import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it, type Mock, vi } from 'vitest';
import {
  addBasketItem,
  BasketApiError,
  changeBasketItemQuantity,
  createBasket,
  getBasket,
  removeBasketItem,
} from '../src/controllers/lib/basketApi';
import type { BasketResponse } from '../src/controllers/lib/basketLogic';

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
