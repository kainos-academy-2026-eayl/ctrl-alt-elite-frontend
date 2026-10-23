/*
 * KAN-28 basket service, used by the browser controller
 * src/controllers/basket.ts.
 *
 * The backend owns the basket (/api/baskets, reached through this server's
 * /api proxy) and every successful call returns the whole basket as the server
 * sees it. BasketService keeps only the basket id in session storage, so the
 * basket survives page navigation and refreshes in the same tab. It never
 * touches the page: the controller renders the state it exposes.
 */

import {
  type BasketLine,
  type BasketResponse,
  createCheckoutSnapshot,
  isBasketResponse,
  MAX_QUANTITY,
} from '../models/basket';

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

/** The parts of the browser's Storage that the basket uses, so tests can pass a fake. */
export interface BasketStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export type CheckoutResult = 'saved' | 'empty' | 'failed';

export const BASKET_ID_KEY = 'ctrl-alt-elite:basket-id';
// The basket used to live in the browser under this key; it is now ignored.
export const LEGACY_BASKET_KEY = 'ctrl-alt-elite:basket';
export const CHECKOUT_KEY = 'ctrl-alt-elite:checkout';

const EMPTY_BASKET: BasketResponse = {
  id: '',
  items: [],
  itemCount: 0,
  totalPence: 0,
  maxQuantity: MAX_QUANTITY,
};

export function isMissingBasket(error: unknown): boolean {
  return error instanceof BasketApiError && error.isNotFound;
}

export class BasketService {
  /** The latest basket from the server, or null when it could not be loaded. */
  #basket: BasketResponse | null = null;
  #isLoaded = false;
  // Used when storage is blocked (e.g. strict privacy settings).
  #memoryBasketId: string | null = null;
  #storageWorks = true;
  #basketWasReset = false;
  #checkoutFailed = false;
  #pendingWork: Promise<unknown> = Promise.resolve();
  readonly #getStorage: () => BasketStorage;

  /**
   * Takes a function rather than the storage itself because reading
   * window.sessionStorage throws when the browser blocks site data.
   */
  constructor(getStorage: () => BasketStorage) {
    this.#getStorage = getStorage;
  }

  get basket(): BasketResponse | null {
    return this.#basket;
  }

  get isLoaded(): boolean {
    return this.#isLoaded;
  }

  get storageWorks(): boolean {
    return this.#storageWorks;
  }

  /** True when the saved basket had gone and a new, empty one was started. */
  get basketWasReset(): boolean {
    return this.#basketWasReset;
  }

  get checkoutFailed(): boolean {
    return this.#checkoutFailed;
  }

  removeLegacyBasket(): void {
    try {
      this.#getStorage().removeItem(LEGACY_BASKET_KEY);
    } catch {
      // Storage is blocked; readBasketId() reports this when it is first used.
    }
  }

  refresh(): Promise<void> {
    return this.#runInOrder(() => this.#loadBasket());
  }

  /** Adds one of a product, starting a new basket if needed. Throws if it fails. */
  addItem(productId: string): Promise<BasketResponse> {
    return this.#runInOrder(async () => {
      const updated = await this.#addItemToCurrentBasket(productId);
      this.#basket = updated;
      this.#clearCheckoutSnapshot();
      return updated;
    });
  }

  /**
   * Moves a quantity by `change`. If it fails, the basket is reloaded so it
   * matches the server, then the error is thrown.
   */
  changeQuantity(productId: string, change: number): Promise<void> {
    return this.#runInOrder(async () => {
      try {
        const basketId = this.#requireBasketId();
        this.#basket = await changeBasketItemQuantity(
          basketId,
          productId,
          change,
        );
        this.#clearCheckoutSnapshot();
      } catch (error) {
        await this.#recoverFromFailedUpdate(error);
        throw error;
      }
    });
  }

  /**
   * Removes a product and returns the line that was removed. If it fails, the
   * basket is reloaded so it matches the server, then the error is thrown.
   */
  removeItem(productId: string): Promise<BasketLine | undefined> {
    return this.#runInOrder(async () => {
      const removed = this.#basket?.items.find((item) => item.id === productId);
      try {
        await removeBasketItem(this.#requireBasketId(), productId);
        this.#clearCheckoutSnapshot();
        await this.#loadBasket();
        return removed;
      } catch (error) {
        await this.#recoverFromFailedUpdate(error);
        throw error;
      }
    });
  }

  /**
   * Re-reads the basket so the snapshot saved for the checkout page is exactly
   * what the server holds now.
   */
  prepareCheckout(now: Date): Promise<CheckoutResult> {
    return this.#runInOrder(async () => {
      await this.#loadBasket();
      if (this.#basket === null || this.#basket.items.length === 0) {
        return 'empty';
      }

      const snapshot = JSON.stringify(
        createCheckoutSnapshot(this.#basket.items, now),
      );
      try {
        if (!this.#storageWorks) {
          throw new Error('Basket storage is unavailable');
        }
        const storage = this.#getStorage();
        storage.setItem(CHECKOUT_KEY, snapshot);
        if (storage.getItem(CHECKOUT_KEY) !== snapshot) {
          throw new Error('Checkout snapshot did not save correctly');
        }
      } catch (error) {
        console.error('Unable to send the basket to checkout:', error);
        // Never leave a stale or partial snapshot for the checkout page to show.
        try {
          this.#getStorage().removeItem(CHECKOUT_KEY);
        } catch {
          // Storage is unusable, so there is nothing to clean up.
        }
        this.#checkoutFailed = true;
        return 'failed';
      }

      this.#checkoutFailed = false;
      return 'saved';
    });
  }

  // Runs basket changes one at a time, in call order, so a slow response can
  // never overwrite the result of a later change.
  #runInOrder<T>(task: () => Promise<T>): Promise<T> {
    const result = this.#pendingWork.then(task, task);
    this.#pendingWork = result.catch(() => undefined);
    return result;
  }

  #readBasketId(): string | null {
    if (!this.#storageWorks) {
      return this.#memoryBasketId;
    }
    try {
      return this.#getStorage().getItem(BASKET_ID_KEY);
    } catch (error) {
      console.error('Basket storage is unavailable:', error);
      this.#storageWorks = false;
      return this.#memoryBasketId;
    }
  }

  #requireBasketId(): string {
    const basketId = this.#readBasketId();
    if (basketId === null) {
      throw new BasketApiError(404, 'Basket not found.');
    }
    return basketId;
  }

  #saveBasketId(basketId: string | null): void {
    this.#memoryBasketId = basketId;
    if (!this.#storageWorks) {
      return;
    }
    try {
      const storage = this.#getStorage();
      if (basketId === null) {
        storage.removeItem(BASKET_ID_KEY);
      } else {
        storage.setItem(BASKET_ID_KEY, basketId);
      }
    } catch (error) {
      console.error('Unable to save the basket id:', error);
      this.#storageWorks = false;
    }
  }

  /** The basket changed, so any earlier checkout snapshot is now out of date. */
  #clearCheckoutSnapshot(): void {
    this.#checkoutFailed = false;
    if (!this.#storageWorks) {
      return;
    }
    try {
      this.#getStorage().removeItem(CHECKOUT_KEY);
    } catch (error) {
      console.error('Unable to clear the checkout snapshot:', error);
    }
  }

  async #loadBasket(): Promise<void> {
    const basketId = this.#readBasketId();
    this.#isLoaded = true;
    if (basketId === null) {
      this.#basket = EMPTY_BASKET;
      return;
    }
    try {
      this.#basket = await getBasket(basketId);
    } catch (error) {
      if (
        error instanceof BasketApiError &&
        (error.isNotFound || error.status === 400)
      ) {
        this.#saveBasketId(null);
        this.#basketWasReset = true;
        this.#basket = EMPTY_BASKET;
        return;
      }
      console.error('Unable to load the basket:', error);
      this.#basket = null;
    }
  }

  async #ensureBasketId(): Promise<string> {
    const existingId = this.#readBasketId();
    if (existingId !== null) {
      return existingId;
    }
    const created = await createBasket();
    this.#saveBasketId(created.id);
    return created.id;
  }

  async #addItemToCurrentBasket(productId: string): Promise<BasketResponse> {
    try {
      return await addBasketItem(await this.#ensureBasketId(), productId);
    } catch (error) {
      if (!isMissingBasket(error)) {
        throw error;
      }
      // The saved basket no longer exists, so start a new one and try once more.
      this.#saveBasketId(null);
      return addBasketItem(await this.#ensureBasketId(), productId);
    }
  }

  async #recoverFromFailedUpdate(error: unknown): Promise<void> {
    console.error('Unable to update the basket:', error);
    // Reload so the page always shows what the server really holds.
    await this.#loadBasket();
  }
}
