import {
  type AddBasketItemRequestDto,
  type BasketResponseDto,
  isBasketId,
  isBasketResponseDto,
  type UpdateBasketItemRequestDto,
} from '../dtos/basketDto';

const BASKETS_PATH = '/api/baskets';
const REQUEST_TIMEOUT_MS = 10_000;
const NOT_FOUND_MESSAGE = 'Basket not found.';
const SERVER_ERROR_MESSAGE =
  'Something went wrong with your basket. Please try again.';
const UNREACHABLE_MESSAGE =
  'We could not reach your basket right now. Please try again later.';

export class BasketServiceError extends Error {
  /** HTTP status from the backend, or 0 when it could not be reached. */
  readonly status: number;

  constructor(status: number, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'BasketServiceError';
    this.status = status;
  }

  get isNotFound(): boolean {
    return this.status === 404;
  }
}

/**
 * Talks to the backend basket API. It knows nothing about the browser's
 * request or response; BasketController decides what to show the customer.
 */
export class BasketService {
  constructor(
    private readonly backendOrigin: string,
    private readonly fetchImpl: typeof fetch = (input, init) =>
      fetch(input, init),
  ) {}

  createBasket(): Promise<BasketResponseDto> {
    return this.requestBasket(BASKETS_PATH, 'POST');
  }

  async getBasket(basketId: string): Promise<BasketResponseDto> {
    return this.requestBasket(this.basketPath(basketId), 'GET');
  }

  /**
   * Adds one of a product. Starts a new basket when there is no basket yet or
   * the saved one no longer exists, so the customer's click is never lost.
   */
  async addItem(
    basketId: string | null,
    productId: string,
  ): Promise<BasketResponseDto> {
    if (isBasketId(basketId)) {
      try {
        return await this.postItem(basketId, productId);
      } catch (error) {
        if (!(error instanceof BasketServiceError && error.isNotFound)) {
          throw error;
        }
      }
    }
    const basket = await this.createBasket();
    return this.postItem(basket.id, productId);
  }

  /** Moves a quantity up or down; the backend keeps it between 1 and 99. */
  async changeItemQuantity(
    basketId: string,
    productId: string,
    change: number,
  ): Promise<BasketResponseDto> {
    const body: UpdateBasketItemRequestDto = { change };
    return this.requestBasket(
      this.itemPath(basketId, productId),
      'PATCH',
      body,
    );
  }

  /** Removes a line and returns its product name, if it was in the basket. */
  async removeItem(
    basketId: string,
    productId: string,
  ): Promise<string | null> {
    const basket = await this.getBasket(basketId);
    const removedName =
      basket.items.find((item) => item.id === productId)?.name ?? null;
    await this.request(this.itemPath(basketId, productId), 'DELETE');
    return removedName;
  }

  private postItem(
    basketId: string,
    productId: string,
  ): Promise<BasketResponseDto> {
    const body: AddBasketItemRequestDto = { productId };
    return this.requestBasket(
      `${this.basketPath(basketId)}/items`,
      'POST',
      body,
    );
  }

  private basketPath(basketId: string): string {
    if (!isBasketId(basketId)) {
      throw new BasketServiceError(404, NOT_FOUND_MESSAGE);
    }
    return `${BASKETS_PATH}/${encodeURIComponent(basketId)}`;
  }

  private itemPath(basketId: string, productId: string): string {
    return `${this.basketPath(basketId)}/items/${encodeURIComponent(productId)}`;
  }

  private async requestBasket(
    path: string,
    method: string,
    body?: object,
  ): Promise<BasketResponseDto> {
    const response = await this.request(path, method, body);
    const basket: unknown = await response.json().catch(() => null);
    if (!isBasketResponseDto(basket)) {
      throw new BasketServiceError(502, SERVER_ERROR_MESSAGE);
    }
    return basket;
  }

  private async request(
    path: string,
    method: string,
    body?: object,
  ): Promise<Response> {
    const headers: Record<string, string> = { accept: 'application/json' };
    if (body !== undefined) {
      headers['content-type'] = 'application/json';
    }
    let response: Response;
    try {
      response = await this.fetchImpl(new URL(path, this.backendOrigin), {
        method,
        headers,
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (error) {
      throw new BasketServiceError(0, UNREACHABLE_MESSAGE, { cause: error });
    }
    if (!response.ok) {
      throw new BasketServiceError(
        response.status,
        await readErrorMessage(response),
      );
    }
    return response;
  }
}

/** Client errors (4xx) carry a customer-friendly message; server errors do not. */
async function readErrorMessage(response: Response): Promise<string> {
  if (response.status >= 500) {
    await response.body?.cancel();
    return SERVER_ERROR_MESSAGE;
  }
  const body: unknown = await response.json().catch(() => null);
  if (
    body !== null &&
    typeof body === 'object' &&
    'message' in body &&
    typeof body.message === 'string' &&
    body.message.trim() !== ''
  ) {
    return body.message;
  }
  return SERVER_ERROR_MESSAGE;
}
