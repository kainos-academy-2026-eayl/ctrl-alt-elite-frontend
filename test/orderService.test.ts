import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { OrderService } from '../src/server/services/order-service';

const BACKEND_ORIGIN = 'https://backend.example.test';
const ORDER = {
  id: 'order-1',
  order_total: 52.5,
  order_status: 'COMPLETED',
  createdAt: '2026-11-04T12:00:00.000Z',
  delivery_price_pence: 250,
  products: [{ product_id: 'product-1', amount: 2, unit_price_pence: 2500 }],
};

describe('OrderService.getOrders', () => {
  const service = new OrderService(BACKEND_ORIGIN);
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('fetches the signed-in customer orders using a Bearer token', async () => {
    fetchMock.mockResolvedValue(Response.json({ orders: [ORDER] }));

    await expect(service.getOrders('test-token')).resolves.toEqual({
      orders: [ORDER],
    });
    expect(fetchMock).toHaveBeenCalledExactlyOnceWith(
      new URL('/api/orders', BACKEND_ORIGIN),
      {
        method: 'GET',
        headers: {
          accept: 'application/json',
          authorization: 'Bearer test-token',
        },
        cache: 'no-store',
      },
    );
  });

  it('returns an empty order history', async () => {
    fetchMock.mockResolvedValue(Response.json({ orders: [] }));

    await expect(service.getOrders('test-token')).resolves.toEqual({
      orders: [],
    });
  });

  it('preserves nullable checkout details and historical prices', async () => {
    const order = { ...ORDER, first_name: null, address_line2: null };
    fetchMock.mockResolvedValue(Response.json({ orders: [order] }));

    await expect(service.getOrders('test-token')).resolves.toEqual({
      orders: [order],
    });
  });

  it.each(['', '   '])(
    'rejects a blank token without fetching',
    async (token) => {
      await expect(service.getOrders(token)).rejects.toThrow(
        'An authentication token is required',
      );
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );

  it.each([401, 403, 404, 500])('rejects HTTP status %i', async (status) => {
    fetchMock.mockResolvedValue(new Response(null, { status }));

    await expect(service.getOrders('test-token')).rejects.toThrow(
      `Orders API returned ${status}.`,
    );
  });

  it.each([
    null,
    [],
    {},
    { products: [] },
    { orders: 'invalid' },
    { orders: [null] },
    { orders: [{ ...ORDER, order_total: '52.50' }] },
    { orders: [{ ...ORDER, order_status: null }] },
    { orders: [{ ...ORDER, createdAt: 'invalid' }] },
    { orders: [{ ...ORDER, delivery_price_pence: -1 }] },
    { orders: [{ ...ORDER, products: [{}] }] },
    {
      orders: [{ ...ORDER, products: [{ ...ORDER.products[0], amount: 1.5 }] }],
    },
    {
      orders: [
        {
          ...ORDER,
          products: [{ ...ORDER.products[0], unit_price_pence: -1 }],
        },
      ],
    },
  ])('rejects an unexpected response: %j', async (payload) => {
    fetchMock.mockResolvedValue(Response.json(payload));

    await expect(service.getOrders('test-token')).rejects.toThrow(
      'The orders API returned an unexpected response.',
    );
  });

  it('propagates network failures', async () => {
    const error = new TypeError('fetch failed');
    fetchMock.mockRejectedValue(error);

    await expect(service.getOrders('test-token')).rejects.toBe(error);
  });

  it('rejects invalid JSON', async () => {
    fetchMock.mockResolvedValue(new Response('not JSON'));

    await expect(service.getOrders('test-token')).rejects.toBeInstanceOf(
      SyntaxError,
    );
  });
});
