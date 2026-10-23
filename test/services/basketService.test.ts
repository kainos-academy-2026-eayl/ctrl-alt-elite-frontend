import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it, type Mock, vi } from 'vitest';
import {
  type BasketResponse,
  createCheckoutSnapshot,
} from '../../src/models/basket';
import {
  addBasketItem,
  BASKET_ID_KEY,
  BasketApiError,
  BasketService,
  type BasketStorage,
  CHECKOUT_KEY,
  changeBasketItemQuantity,
  createBasket,
  getBasket,
  isMissingBasket,
  LEGACY_BASKET_KEY,
  removeBasketItem,
} from '../../src/services/basketService';

const BASKET_ID = '6f1c2f0e-6a8e-4c43-9a51-3f3c9b8f4b11';
const basket: BasketResponse = {
  id: BASKET_ID,
  items: [
    {
      id: 'sample-lamp',
      name: 'Desk Lamp',
      unitPricePence: 2499,
      quantity: 2,
      lineTotalPence: 4998,
    },
  ],
  itemCount: 2,
  totalPence: 4998,
  maxQuantity: 99,
};

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

let fetchMock: Mock<typeof fetch>;

beforeEach(() => {
  fetchMock = vi.fn<typeof fetch>(async () => jsonResponse(200, basket));
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function lastRequest(): { url: unknown; init: RequestInit | undefined } {
  const [url, init] = fetchMock.mock.calls.at(-1) ?? [];
  return { url, init };
}

describe('basket API requests', () => {
  it('creates a basket with POST /api/baskets', async () => {
    assert.deepEqual(await createBasket(), basket);
    assert.deepEqual(lastRequest(), {
      url: '/api/baskets',
      init: { method: 'POST' },
    });
  });

  it('gets a basket by id', async () => {
    assert.deepEqual(await getBasket(BASKET_ID), basket);
    assert.equal(lastRequest().url, `/api/baskets/${BASKET_ID}`);
  });

  it('adds an item by sending only the product id', async () => {
    await addBasketItem(BASKET_ID, 'sample-lamp');

    assert.deepEqual(lastRequest(), {
      url: `/api/baskets/${BASKET_ID}/items`,
      init: {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{"productId":"sample-lamp"}',
      },
    });
  });

  it('changes a quantity by sending the +/- change', async () => {
    await changeBasketItemQuantity(BASKET_ID, 'sample-lamp', -1);

    const { url, init } = lastRequest();
    assert.equal(url, `/api/baskets/${BASKET_ID}/items/sample-lamp`);
    assert.equal(init?.method, 'PATCH');
    assert.equal(init?.body, '{"change":-1}');
  });

  it('removes an item with DELETE', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));

    await removeBasketItem(BASKET_ID, 'sample-lamp');

    assert.deepEqual(lastRequest(), {
      url: `/api/baskets/${BASKET_ID}/items/sample-lamp`,
      init: { method: 'DELETE' },
    });
  });

  it('encodes ids so they cannot change the URL path', async () => {
    await changeBasketItemQuantity(BASKET_ID, '../admin?x=1', 1);

    assert.equal(
      lastRequest().url,
      `/api/baskets/${BASKET_ID}/items/..%2Fadmin%3Fx%3D1`,
    );
  });
});

describe('basket API errors', () => {
  it('uses the server message for a client error such as the maximum quantity', async () => {
    const message =
      'You already have the maximum of 99 × Desk Lamp in your basket';
    fetchMock.mockResolvedValue(jsonResponse(409, { message }));

    await assert.rejects(addBasketItem(BASKET_ID, 'sample-lamp'), {
      name: 'BasketApiError',
      status: 409,
      message,
    });
  });

  it('reports a missing basket as not found', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(404, { message: 'Basket not found.' }),
    );

    const error = await getBasket(BASKET_ID).catch((caught) => caught);

    assert.ok(error instanceof BasketApiError);
    assert.equal(error.isNotFound, true);
  });

  it('hides server error details behind a friendly message', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(500, { message: 'Internal database failure' }),
    );

    await assert.rejects(getBasket(BASKET_ID), {
      status: 500,
      message: 'Something went wrong with your basket. Please try again.',
    });
  });

  it('reports status 0 when the server cannot be reached', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));

    await assert.rejects(getBasket(BASKET_ID), {
      status: 0,
      message:
        'We could not reach your basket. Please check your connection and try again.',
    });
  });

  it('rejects a basket whose totals do not add up', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(200, { ...basket, totalPence: 1 }),
    );

    await assert.rejects(getBasket(BASKET_ID), BasketApiError);
  });
});

const emptyBasket: BasketResponse = {
  id: BASKET_ID,
  items: [],
  itemCount: 0,
  totalPence: 0,
  maxQuantity: 99,
};

class FakeStorage implements BasketStorage {
  readonly values = new Map<string, string>();
  failWrites = false;

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    if (this.failWrites) {
      throw new Error('QuotaExceededError');
    }
    this.values.set(key, value);
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }
}

/** Answers each "METHOD url" with a fresh response; anything else fails the request. */
function respondTo(handlers: Record<string, () => Response>): void {
  fetchMock.mockImplementation(async (url, init) => {
    const request = `${init?.method ?? 'GET'} ${String(url)}`;
    const handler = handlers[request];
    if (!handler) {
      throw new Error(`Unexpected request: ${request}`);
    }
    return handler();
  });
}

function requests(): string[] {
  return fetchMock.mock.calls.map(
    ([url, init]) => `${init?.method ?? 'GET'} ${String(url)}`,
  );
}

const BASKET_URL = `/api/baskets/${BASKET_ID}`;

describe('BasketService', () => {
  let storage: FakeStorage;
  let service: BasketService;

  beforeEach(() => {
    storage = new FakeStorage();
    service = new BasketService(() => storage);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('refresh', () => {
    it('shows an empty basket without calling the server when no basket id is saved', async () => {
      await service.refresh();

      assert.equal(service.isLoaded, true);
      assert.deepEqual(service.basket?.items, []);
      assert.deepEqual(requests(), []);
    });

    it('loads the saved basket', async () => {
      storage.setItem(BASKET_ID_KEY, BASKET_ID);

      await service.refresh();

      assert.deepEqual(service.basket, basket);
      assert.deepEqual(requests(), [`GET ${BASKET_URL}`]);
    });

    it('starts a new basket when the saved one no longer exists', async () => {
      storage.setItem(BASKET_ID_KEY, BASKET_ID);
      respondTo({ [`GET ${BASKET_URL}`]: () => jsonResponse(404, {}) });

      await service.refresh();

      assert.deepEqual(service.basket?.items, []);
      assert.equal(service.basketWasReset, true);
      assert.equal(storage.getItem(BASKET_ID_KEY), null);
    });

    it('keeps the basket id but has no basket when the server fails', async () => {
      storage.setItem(BASKET_ID_KEY, BASKET_ID);
      respondTo({ [`GET ${BASKET_URL}`]: () => jsonResponse(500, {}) });

      await service.refresh();

      assert.equal(service.basket, null);
      assert.equal(storage.getItem(BASKET_ID_KEY), BASKET_ID);
    });
  });

  describe('addItem', () => {
    it('creates a basket and saves its id before the first add', async () => {
      respondTo({
        'POST /api/baskets': () => jsonResponse(201, emptyBasket),
        [`POST ${BASKET_URL}/items`]: () => jsonResponse(200, basket),
      });

      assert.deepEqual(await service.addItem('sample-lamp'), basket);

      assert.deepEqual(requests(), [
        'POST /api/baskets',
        `POST ${BASKET_URL}/items`,
      ]);
      assert.equal(storage.getItem(BASKET_ID_KEY), BASKET_ID);
      assert.deepEqual(service.basket, basket);
    });

    it('starts a new basket and tries again when the saved one has gone', async () => {
      storage.setItem(BASKET_ID_KEY, 'old-basket');
      respondTo({
        'POST /api/baskets/old-basket/items': () => jsonResponse(404, {}),
        'POST /api/baskets': () => jsonResponse(201, emptyBasket),
        [`POST ${BASKET_URL}/items`]: () => jsonResponse(200, basket),
      });

      assert.deepEqual(await service.addItem('sample-lamp'), basket);

      assert.equal(storage.getItem(BASKET_ID_KEY), BASKET_ID);
    });

    it('clears an out of date checkout snapshot', async () => {
      storage.setItem(BASKET_ID_KEY, BASKET_ID);
      storage.setItem(CHECKOUT_KEY, '{"version":1}');

      await service.addItem('sample-lamp');

      assert.equal(storage.getItem(CHECKOUT_KEY), null);
    });

    it('throws the server message and keeps the current basket when it fails', async () => {
      storage.setItem(BASKET_ID_KEY, BASKET_ID);
      await service.refresh();
      const message = 'You already have the maximum of 99 × Desk Lamp';
      fetchMock.mockResolvedValue(jsonResponse(409, { message }));

      await assert.rejects(service.addItem('sample-lamp'), { message });

      assert.deepEqual(service.basket, basket);
    });
  });

  describe('changeQuantity', () => {
    it('stores the updated basket from the server', async () => {
      storage.setItem(BASKET_ID_KEY, BASKET_ID);

      await service.changeQuantity('sample-lamp', 1);

      assert.deepEqual(service.basket, basket);
      assert.deepEqual(requests(), [`PATCH ${BASKET_URL}/items/sample-lamp`]);
    });

    it('reloads the basket and throws when the change fails', async () => {
      storage.setItem(BASKET_ID_KEY, BASKET_ID);
      respondTo({
        [`PATCH ${BASKET_URL}/items/sample-lamp`]: () =>
          jsonResponse(409, { message: 'Too many' }),
        [`GET ${BASKET_URL}`]: () => jsonResponse(200, basket),
      });

      await assert.rejects(service.changeQuantity('sample-lamp', 1), {
        status: 409,
      });

      assert.equal(requests().at(-1), `GET ${BASKET_URL}`);
      assert.deepEqual(service.basket, basket);
    });

    it('throws a missing basket error when no basket id is saved', async () => {
      const error = await service
        .changeQuantity('sample-lamp', 1)
        .catch((caught: unknown) => caught);

      assert.equal(isMissingBasket(error), true);
      assert.deepEqual(service.basket?.items, []);
      assert.deepEqual(requests(), []);
    });
  });

  describe('removeItem', () => {
    it('returns the removed line and reloads the basket', async () => {
      storage.setItem(BASKET_ID_KEY, BASKET_ID);
      await service.refresh();
      respondTo({
        [`DELETE ${BASKET_URL}/items/sample-lamp`]: () =>
          new Response(null, { status: 204 }),
        [`GET ${BASKET_URL}`]: () => jsonResponse(200, emptyBasket),
      });

      const removed = await service.removeItem('sample-lamp');

      assert.equal(removed?.name, 'Desk Lamp');
      assert.deepEqual(service.basket, emptyBasket);
    });

    it('reloads the basket and throws when the removal fails', async () => {
      storage.setItem(BASKET_ID_KEY, BASKET_ID);
      respondTo({
        [`DELETE ${BASKET_URL}/items/sample-lamp`]: () => jsonResponse(500, {}),
        [`GET ${BASKET_URL}`]: () => jsonResponse(200, basket),
      });

      await assert.rejects(service.removeItem('sample-lamp'), { status: 500 });

      assert.deepEqual(service.basket, basket);
    });
  });

  describe('prepareCheckout', () => {
    const now = new Date('2026-10-23T10:00:00.000Z');

    it('saves a snapshot of the basket the server holds now', async () => {
      storage.setItem(BASKET_ID_KEY, BASKET_ID);

      assert.equal(await service.prepareCheckout(now), 'saved');

      assert.deepEqual(requests(), [`GET ${BASKET_URL}`]);
      assert.deepEqual(
        JSON.parse(storage.getItem(CHECKOUT_KEY) ?? 'null'),
        createCheckoutSnapshot(basket.items, now),
      );
      assert.equal(service.checkoutFailed, false);
    });

    it('does not save a snapshot for an empty basket', async () => {
      assert.equal(await service.prepareCheckout(now), 'empty');

      assert.equal(storage.getItem(CHECKOUT_KEY), null);
    });

    it('does not save a snapshot when the basket cannot be loaded', async () => {
      storage.setItem(BASKET_ID_KEY, BASKET_ID);
      fetchMock.mockResolvedValue(jsonResponse(500, {}));

      assert.equal(await service.prepareCheckout(now), 'empty');

      assert.equal(storage.getItem(CHECKOUT_KEY), null);
    });

    it('reports a failure and leaves no snapshot when it cannot be saved', async () => {
      storage.setItem(BASKET_ID_KEY, BASKET_ID);
      storage.failWrites = true;

      assert.equal(await service.prepareCheckout(now), 'failed');

      assert.equal(service.checkoutFailed, true);
      assert.equal(storage.getItem(CHECKOUT_KEY), null);
    });

    it('clears the failure once the basket changes', async () => {
      storage.setItem(BASKET_ID_KEY, BASKET_ID);
      storage.failWrites = true;
      await service.prepareCheckout(now);
      storage.failWrites = false;

      await service.addItem('sample-lamp');

      assert.equal(service.checkoutFailed, false);
    });
  });

  describe('when storage is blocked', () => {
    beforeEach(() => {
      service = new BasketService(() => {
        throw new DOMException('Access denied', 'SecurityError');
      });
      respondTo({
        'POST /api/baskets': () => jsonResponse(201, emptyBasket),
        [`POST ${BASKET_URL}/items`]: () => jsonResponse(200, basket),
        [`GET ${BASKET_URL}`]: () => jsonResponse(200, basket),
      });
    });

    it('keeps the basket id in memory for the rest of the page', async () => {
      await service.addItem('sample-lamp');
      await service.addItem('sample-lamp');

      assert.equal(service.storageWorks, false);
      assert.deepEqual(requests(), [
        'POST /api/baskets',
        `POST ${BASKET_URL}/items`,
        `POST ${BASKET_URL}/items`,
      ]);
    });

    it('cannot save a checkout snapshot', async () => {
      await service.addItem('sample-lamp');

      assert.equal(
        await service.prepareCheckout(new Date('2026-10-23T10:00:00Z')),
        'failed',
      );
    });

    it('does not throw when removing the old browser-only basket', () => {
      assert.doesNotThrow(() => service.removeLegacyBasket());
    });
  });

  it('removes the old browser-only basket', () => {
    storage.setItem(LEGACY_BASKET_KEY, '[]');

    service.removeLegacyBasket();

    assert.equal(storage.getItem(LEGACY_BASKET_KEY), null);
  });

  it('runs changes one at a time in the order they were made', async () => {
    storage.setItem(BASKET_ID_KEY, BASKET_ID);
    let finishFirst: () => void = () => undefined;
    fetchMock.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishFirst = () => resolve(jsonResponse(200, basket));
        }),
    );

    const first = service.addItem('sample-lamp');
    const second = service.addItem('sample-mug');
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(fetchMock.mock.calls.length, 1);

    finishFirst();
    await Promise.all([first, second]);

    assert.deepEqual(
      fetchMock.mock.calls.map(([, init]) => init?.body),
      ['{"productId":"sample-lamp"}', '{"productId":"sample-mug"}'],
    );
  });

  it('carries on with later changes after one fails', async () => {
    storage.setItem(BASKET_ID_KEY, BASKET_ID);
    fetchMock.mockResolvedValueOnce(jsonResponse(409, { message: 'No' }));

    await assert.rejects(service.addItem('sample-lamp'));
    assert.deepEqual(await service.addItem('sample-lamp'), basket);
  });
});
