import {
  type AccountDto,
  type DeliveryOptionDto,
  isAccountResponse,
  isDeliveryOptionsResponse,
  isOrderResultDto,
  type OrderResultDto,
  type PlaceOrderRequestDto,
} from '../dtos/checkoutDto';
import { t } from '../i18n/runtime';

const REQUEST_TIMEOUT_MS = 10_000;
const SERVER_ERROR_MESSAGE = () => t('checkout.serverError');
const UNREACHABLE_MESSAGE = () => t('checkout.unreachable');

export class CheckoutServiceError extends Error {
  /** HTTP status from the backend, or 0 when it could not be reached. */
  readonly status: number;

  constructor(status: number, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'CheckoutServiceError';
    this.status = status;
  }

  /** The login token is missing, expired or no longer valid. */
  get isUnauthenticated(): boolean {
    return this.status === 401;
  }

  /** No such order for this customer; an invalid order id (400) counts too. */
  get isNotFound(): boolean {
    return this.status === 404 || this.status === 400;
  }

  /** The backend refused the order with a message the customer can act on. */
  get isRejected(): boolean {
    return this.status === 400 || this.status === 404 || this.status === 409;
  }
}

/**
 * Talks to the backend account, delivery and order APIs. The login token is
 * the backend JWT from the auth_token cookie. It knows nothing about the
 * browser's request or response; CheckoutController decides what to show.
 */
export class CheckoutService {
  constructor(
    private readonly backendOrigin: string,
    private readonly fetchImpl: typeof fetch = (input, init) =>
      fetch(input, init),
  ) {}

  async getAccount(token: string): Promise<AccountDto> {
    const body = await this.request('/api/account', 'GET', token);
    if (!isAccountResponse(body)) {
      throw new CheckoutServiceError(502, SERVER_ERROR_MESSAGE());
    }
    return body.account;
  }

  async getDeliveryOptions(): Promise<DeliveryOptionDto[]> {
    const body = await this.request('/api/delivery-options', 'GET', null);
    if (!isDeliveryOptionsResponse(body)) {
      throw new CheckoutServiceError(502, SERVER_ERROR_MESSAGE());
    }
    return body.deliveryOptions;
  }

  async placeOrder(
    token: string,
    order: PlaceOrderRequestDto,
  ): Promise<OrderResultDto> {
    return this.requestOrder('/api/orders', 'POST', token, order);
  }

  async getOrder(token: string, orderId: string): Promise<OrderResultDto> {
    return this.requestOrder(
      `/api/orders/${encodeURIComponent(orderId)}`,
      'GET',
      token,
    );
  }

  private async requestOrder(
    path: string,
    method: string,
    token: string,
    body?: object,
  ): Promise<OrderResultDto> {
    const result = await this.request(path, method, token, body);
    if (!isOrderResultDto(result)) {
      throw new CheckoutServiceError(502, SERVER_ERROR_MESSAGE());
    }
    return result;
  }

  private async request(
    path: string,
    method: string,
    token: string | null,
    body?: object,
  ): Promise<unknown> {
    const headers: Record<string, string> = { accept: 'application/json' };
    if (token) {
      headers.authorization = `Bearer ${token}`;
    }
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
      throw new CheckoutServiceError(0, UNREACHABLE_MESSAGE(), {
        cause: error,
      });
    }
    if (!response.ok) {
      throw new CheckoutServiceError(
        response.status,
        await readErrorMessage(response),
      );
    }
    return response.json().catch(() => null);
  }
}

/** Client errors (4xx) carry a customer-friendly message; server errors do not. */
async function readErrorMessage(response: Response): Promise<string> {
  if (response.status >= 500) {
    await response.body?.cancel();
    return SERVER_ERROR_MESSAGE();
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
  return SERVER_ERROR_MESSAGE();
}
