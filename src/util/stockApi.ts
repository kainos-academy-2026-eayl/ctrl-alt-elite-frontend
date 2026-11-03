import {
  parseStockItem,
  parseStockItems,
  parseStockSummary,
  type StockDashboard,
  type StockFieldErrors,
  type StockItem,
  type StockUpdate,
} from './adminStock';
import { ServiceUnavailableError, throwForSharedStatus } from './apiErrors';

// Same-origin: requests go through the frontend's /api proxy, which adds the
// bearer token from the httpOnly login cookie.
export const STOCK_API_PATH = '/api/admin/inventory';

export interface StockApiOptions {
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 10_000;

// The backend rejected the input (400). Field messages are safe to show.
export class StockValidationError extends Error {
  constructor(
    message: string,
    readonly fieldErrors: StockFieldErrors,
  ) {
    super(message);
    this.name = 'StockValidationError';
  }
}

// The product no longer exists (404).
export class StockNotFoundError extends Error {
  constructor() {
    super('The product could not be found.');
    this.name = 'StockNotFoundError';
  }
}

function readRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null
    ? (value as Record<string, unknown>)
    : null;
}

function readFieldErrors(
  body: Record<string, unknown> | null,
): StockFieldErrors {
  const fieldErrors: StockFieldErrors = {};
  const errors = body?.errors;
  if (!Array.isArray(errors)) return fieldErrors;
  for (const entry of errors) {
    const error = readRecord(entry);
    if (typeof error?.message !== 'string') continue;
    if (error.field === 'stock') fieldErrors.stock ??= error.message;
    if (error.field === 'lowStockThreshold') {
      fieldErrors.lowStockThreshold ??= error.message;
    }
  }
  return fieldErrors;
}

export function createStockApi({
  fetchImpl = (input, init) => fetch(input, init),
  timeoutMs = DEFAULT_TIMEOUT_MS,
}: StockApiOptions = {}) {
  async function send(
    path: string,
    method: 'GET' | 'PUT',
    payload?: unknown,
  ): Promise<Record<string, unknown>> {
    let response: Response;
    try {
      response = await fetchImpl(`${STOCK_API_PATH}${path}`, {
        method,
        headers: {
          accept: 'application/json',
          ...(payload === undefined
            ? {}
            : { 'content-type': 'application/json' }),
        },
        ...(payload === undefined ? {} : { body: JSON.stringify(payload) }),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch {
      throw new ServiceUnavailableError();
    }

    throwForSharedStatus(response.status);

    let body: Record<string, unknown> | null = null;
    try {
      body = readRecord(await response.json());
    } catch {
      // An empty or non-JSON body is handled below.
    }

    if (response.status === 404) throw new StockNotFoundError();
    if (response.status === 400) {
      const message =
        typeof body?.message === 'string' && body.message.trim()
          ? body.message.trim()
          : 'The values were not accepted.';
      throw new StockValidationError(message, readFieldErrors(body));
    }
    if (!response.ok || !body) {
      throw new ServiceUnavailableError(
        `The server responded with ${response.status}.`,
      );
    }
    return body;
  }

  function readProduct(body: Record<string, unknown>): StockItem {
    const product = parseStockItem(body.product);
    if (!product) {
      throw new ServiceUnavailableError(
        'The response was not in the expected format.',
      );
    }
    return product;
  }

  return {
    async getDashboard(): Promise<StockDashboard> {
      const body = await send('/dashboard', 'GET');
      const summary = parseStockSummary(body.summary);
      const lowStockProducts = parseStockItems(body.lowStockProducts);
      if (!summary || !lowStockProducts) {
        throw new ServiceUnavailableError(
          'The response was not in the expected format.',
        );
      }
      return { summary, lowStockProducts };
    },

    async listProducts(): Promise<StockItem[]> {
      const products = parseStockItems((await send('', 'GET')).products);
      if (!products) {
        throw new ServiceUnavailableError(
          'The response was not in the expected format.',
        );
      }
      return products;
    },

    async updateStock(id: string, update: StockUpdate): Promise<StockItem> {
      return readProduct(
        await send(`/${encodeURIComponent(id)}/stock`, 'PUT', update),
      );
    },

    async setOutOfStock(id: string, outOfStock: boolean): Promise<StockItem> {
      return readProduct(
        await send(`/${encodeURIComponent(id)}/out-of-stock`, 'PUT', {
          outOfStock,
        }),
      );
    },
  };
}

export type StockApi = ReturnType<typeof createStockApi>;
