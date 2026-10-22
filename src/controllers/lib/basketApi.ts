/*
 * Calls the backend basket API through the frontend's /api proxy.
 * Every successful call returns the whole basket as the server sees it.
 */

import { type BasketResponse, isBasketResponse } from './basketLogic';

const BASKETS_URL = '/api/baskets';
const NETWORK_ERROR_MESSAGE =
  'We could not reach your basket. Please check your connection and try again.';
const SERVER_ERROR_MESSAGE =
  'Something went wrong with your basket. Please try again.';

export class BasketApiError extends Error {
  /** HTTP status code, or 0 when the server could not be reached. */
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'BasketApiError';
    this.status = status;
  }

  get isNotFound(): boolean {
    return this.status === 404;
  }
}

async function sendRequest(
  path: string,
  method: string,
  body?: object,
): Promise<Response> {
  const init: RequestInit = { method };
  if (body !== undefined) {
    init.headers = { 'Content-Type': 'application/json' };
    init.body = JSON.stringify(body);
  }

  let response: Response;
  try {
    response = await fetch(path, init);
  } catch {
    throw new BasketApiError(0, NETWORK_ERROR_MESSAGE);
  }

  if (!response.ok) {
    throw new BasketApiError(response.status, await readErrorMessage(response));
  }
  return response;
}

async function readErrorMessage(response: Response): Promise<string> {
  if (response.status >= 500) {
    return SERVER_ERROR_MESSAGE;
  }
  const body: unknown = await response.json().catch(() => null);
  if (
    body !== null &&
    typeof body === 'object' &&
    'message' in body &&
    typeof body.message === 'string'
  ) {
    return body.message;
  }
  return SERVER_ERROR_MESSAGE;
}

async function readBasket(response: Response): Promise<BasketResponse> {
  const body: unknown = await response.json().catch(() => null);
  if (!isBasketResponse(body)) {
    throw new BasketApiError(response.status, SERVER_ERROR_MESSAGE);
  }
  return body;
}

function basketUrl(basketId: string): string {
  return `${BASKETS_URL}/${encodeURIComponent(basketId)}`;
}

function itemUrl(basketId: string, productId: string): string {
  return `${basketUrl(basketId)}/items/${encodeURIComponent(productId)}`;
}

export async function createBasket(): Promise<BasketResponse> {
  return readBasket(await sendRequest(BASKETS_URL, 'POST'));
}

export async function getBasket(basketId: string): Promise<BasketResponse> {
  return readBasket(await sendRequest(basketUrl(basketId), 'GET'));
}

export async function addBasketItem(
  basketId: string,
  productId: string,
): Promise<BasketResponse> {
  return readBasket(
    await sendRequest(`${basketUrl(basketId)}/items`, 'POST', { productId }),
  );
}

/** Moves a quantity by `change`; the server keeps it between 1 and 99. */
export async function changeBasketItemQuantity(
  basketId: string,
  productId: string,
  change: number,
): Promise<BasketResponse> {
  return readBasket(
    await sendRequest(itemUrl(basketId, productId), 'PATCH', { change }),
  );
}

export async function removeBasketItem(
  basketId: string,
  productId: string,
): Promise<void> {
  await sendRequest(itemUrl(basketId, productId), 'DELETE');
}
