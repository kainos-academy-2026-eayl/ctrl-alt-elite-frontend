import {
  type OrderDetail,
  type OrderPage,
  type OrderQuery,
  orderQueryParams,
  parseOrderDetail,
  parseOrderPage,
} from './adminOrders';
import {
  parseSalesReport,
  type ReportRange,
  reportRangeParams,
  type SalesReport,
} from './adminReports';
import { ServiceUnavailableError, throwForSharedStatus } from './apiErrors';

const ORDERS_API_PATH = '/api/admin/orders';
const REPORTS_API_PATH = '/api/admin/reports';
const DEFAULT_TIMEOUT_MS = 10_000;
const BAD_FORMAT = 'The response was not in the expected format.';

export class OrderNotFoundError extends Error {
  constructor() {
    super('The order was not found.');
    this.name = 'OrderNotFoundError';
  }
}

export interface OrdersApiOptions {
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

export function createOrdersApi({
  fetchImpl = (input, init) => fetch(input, init),
  timeoutMs = DEFAULT_TIMEOUT_MS,
}: OrdersApiOptions = {}) {
  async function get(
    path: string,
    params?: URLSearchParams,
  ): Promise<{ status: number; body: unknown }> {
    const query = params?.toString();
    let response: Response;
    try {
      response = await fetchImpl(`${path}${query ? `?${query}` : ''}`, {
        headers: { accept: 'application/json' },
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch {
      throw new ServiceUnavailableError();
    }

    throwForSharedStatus(response.status);
    if (response.status === 404) return { status: 404, body: null };
    if (!response.ok) {
      throw new ServiceUnavailableError(
        `The server responded with ${response.status}.`,
      );
    }
    try {
      return { status: response.status, body: await response.json() };
    } catch {
      throw new ServiceUnavailableError(BAD_FORMAT);
    }
  }

  return {
    async listOrders(query: OrderQuery, pageSize?: number): Promise<OrderPage> {
      const { body } = await get(
        ORDERS_API_PATH,
        orderQueryParams(query, pageSize),
      );
      const page = parseOrderPage(body);
      if (!page) throw new ServiceUnavailableError(BAD_FORMAT);
      return page;
    },

    async getOrder(id: string): Promise<OrderDetail> {
      const { status, body } = await get(
        `${ORDERS_API_PATH}/${encodeURIComponent(id)}`,
      );
      if (status === 404) throw new OrderNotFoundError();
      const order = parseOrderDetail(
        typeof body === 'object' && body !== null
          ? (body as { order?: unknown }).order
          : undefined,
      );
      if (!order) throw new ServiceUnavailableError(BAD_FORMAT);
      return order;
    },

    async getSalesReport(range: ReportRange): Promise<SalesReport> {
      const { body } = await get(
        `${REPORTS_API_PATH}/sales`,
        reportRangeParams(range),
      );
      const report = parseSalesReport(body);
      if (!report) throw new ServiceUnavailableError(BAD_FORMAT);
      return report;
    },
  };
}

export type OrdersApi = ReturnType<typeof createOrdersApi>;
