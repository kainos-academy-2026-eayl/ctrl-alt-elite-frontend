import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import type { BasketResponseDto } from '../src/dtos/basketDto';
import {
  BasketService,
  BasketServiceError,
} from '../src/services/basketService';

const BACKEND = 'http://backend.test';
const BASKET_ID = '9ab2045d-fed8-4003-8051-6d2c1305a002';
const NEW_BASKET_ID = 'ada670af-a238-45be-86d7-2fdfefc794bf';

function basketWith(id: string, quantity = 1): BasketResponseDto {
  return {
    id,
    items: [
      {
        id: 'jeans',
        name: 'Swaggy Jeans',
        unitPricePence: 2499,
        quantity,
        lineTotalPence: 2499 * quantity,
      },
    ],
    itemCount: quantity,
    totalPence: 2499 * quantity,
    maxQuantity: 99,
  };
}

function emptyBasket(id: string): BasketResponseDto {
  return { id, items: [], itemCount: 0, totalPence: 0, maxQuantity: 99 };
}

/** A fake fetch that records each request and replies from a queue. */
function fakeFetch(...replies: (Response | Error)[]) {
  const requests: { url: string; method: string; body: unknown }[] = [];
  const fetchImpl: typeof fetch = async (input, init) => {
    requests.push({
      url: String(input),
      method: init?.method ?? 'GET',
      body: init?.body ? JSON.parse(String(init.body)) : undefined,
    });
    const reply = replies.shift();
    if (!reply) throw new Error('Unexpected request');
    if (reply instanceof Error) throw reply;
    return reply;
  };
  return { fetchImpl, requests };
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('BasketService requests', () => {
  it('gets a basket by id from the backend', async () => {
    const { fetchImpl, requests } = fakeFetch(json(basketWith(BASKET_ID)));
    const basket = await new BasketService(BACKEND, fetchImpl).getBasket(
      BASKET_ID,
    );
    assert.equal(basket.id, BASKET_ID);
    assert.equal(requests[0]?.url, `${BACKEND}/api/baskets/${BASKET_ID}`);
    assert.equal(requests[0]?.method, 'GET');
  });

  it('adds to the existing basket by sending only the product id', async () => {
    const { fetchImpl, requests } = fakeFetch(json(basketWith(BASKET_ID), 201));
    await new BasketService(BACKEND, fetchImpl).addItem(BASKET_ID, 'jeans');
    assert.deepEqual(requests, [
      {
        url: `${BACKEND}/api/baskets/${BASKET_ID}/items`,
        method: 'POST',
        body: { productId: 'jeans' },
      },
    ]);
  });

  it('creates a basket first when there is no basket yet', async () => {
    const { fetchImpl, requests } = fakeFetch(
      json(emptyBasket(NEW_BASKET_ID), 201),
      json(basketWith(NEW_BASKET_ID), 201),
    );
    const basket = await new BasketService(BACKEND, fetchImpl).addItem(
      null,
      'jeans',
    );
    assert.equal(basket.id, NEW_BASKET_ID);
    assert.deepEqual(
      requests.map(({ method, url }) => `${method} ${url}`),
      [
        `POST ${BACKEND}/api/baskets`,
        `POST ${BACKEND}/api/baskets/${NEW_BASKET_ID}/items`,
      ],
    );
  });

  it('starts a new basket when the saved one no longer exists', async () => {
    const { fetchImpl, requests } = fakeFetch(
      json({ message: 'Basket not found.' }, 404),
      json(emptyBasket(NEW_BASKET_ID), 201),
      json(basketWith(NEW_BASKET_ID), 201),
    );
    const basket = await new BasketService(BACKEND, fetchImpl).addItem(
      BASKET_ID,
      'jeans',
    );
    assert.equal(basket.id, NEW_BASKET_ID);
    assert.equal(requests.length, 3);
  });

  it('changes a quantity by sending the +/- change', async () => {
    const { fetchImpl, requests } = fakeFetch(json(basketWith(BASKET_ID, 2)));
    await new BasketService(BACKEND, fetchImpl).changeItemQuantity(
      BASKET_ID,
      'jeans',
      1,
    );
    assert.deepEqual(requests, [
      {
        url: `${BACKEND}/api/baskets/${BASKET_ID}/items/jeans`,
        method: 'PATCH',
        body: { change: 1 },
      },
    ]);
  });

  it('removes an item and returns its name', async () => {
    const { fetchImpl, requests } = fakeFetch(
      json(basketWith(BASKET_ID)),
      new Response(null, { status: 204 }),
    );
    const name = await new BasketService(BACKEND, fetchImpl).removeItem(
      BASKET_ID,
      'jeans',
    );
    assert.equal(name, 'Swaggy Jeans');
    assert.equal(requests[1]?.method, 'DELETE');
    assert.equal(
      requests[1]?.url,
      `${BACKEND}/api/baskets/${BASKET_ID}/items/jeans`,
    );
  });

  it('encodes product ids so they cannot change the URL path', async () => {
    const { fetchImpl, requests } = fakeFetch(json(basketWith(BASKET_ID)));
    await new BasketService(BACKEND, fetchImpl).changeItemQuantity(
      BASKET_ID,
      '../../admin',
      1,
    );
    assert.equal(
      requests[0]?.url,
      `${BACKEND}/api/baskets/${BASKET_ID}/items/..%2F..%2Fadmin`,
    );
  });
});

describe('BasketService errors', () => {
  it('treats a basket id that is not a UUID as not found without calling the backend', async () => {
    const { fetchImpl, requests } = fakeFetch();
    await assert.rejects(
      new BasketService(BACKEND, fetchImpl).getBasket('not-a-uuid'),
      (error) => error instanceof BasketServiceError && error.isNotFound,
    );
    assert.equal(requests.length, 0);
  });

  it('passes on the backend message for a client error', async () => {
    const { fetchImpl } = fakeFetch(
      json({ message: 'That product is not available.' }, 400),
    );
    await assert.rejects(
      new BasketService(BACKEND, fetchImpl).addItem(BASKET_ID, 'missing'),
      { status: 400, message: 'That product is not available.' },
    );
  });

  it('hides server error details behind a friendly message', async () => {
    const { fetchImpl } = fakeFetch(
      json({ message: 'Database password is wrong' }, 500),
    );
    await assert.rejects(
      new BasketService(BACKEND, fetchImpl).getBasket(BASKET_ID),
      {
        status: 500,
        message: 'Something went wrong with your basket. Please try again.',
      },
    );
  });

  it('reports status 0 when the backend cannot be reached', async () => {
    const { fetchImpl } = fakeFetch(new TypeError('fetch failed'));
    await assert.rejects(
      new BasketService(BACKEND, fetchImpl).getBasket(BASKET_ID),
      { status: 0 },
    );
  });

  it('rejects a basket whose totals do not add up', async () => {
    const { fetchImpl } = fakeFetch(
      json({ ...basketWith(BASKET_ID), totalPence: 1 }),
    );
    await assert.rejects(
      new BasketService(BACKEND, fetchImpl).getBasket(BASKET_ID),
      { status: 502 },
    );
  });
});
