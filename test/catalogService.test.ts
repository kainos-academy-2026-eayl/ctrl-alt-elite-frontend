import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CatalogService } from '../src/server/services/catalog-service';

const BACKEND_ORIGIN = 'https://backend.example.test';
const PRODUCT = {
  id: 'product-1',
  name: 'Test headphones',
  category: 'Audio',
  price: 25,
  image: 'https://example.com/headphones.jpg',
  description: 'A test product.',
  stock: 12,
};

describe('CatalogService.getProducts', () => {
  const service = new CatalogService(BACKEND_ORIGIN);
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('fetches products and adds stock, availability and price labels', async () => {
    fetchMock.mockResolvedValue(Response.json({ products: [PRODUCT] }));

    const result = await service.getProducts();

    expect(fetchMock).toHaveBeenCalledExactlyOnceWith(
      new URL('/api/products', BACKEND_ORIGIN),
      { headers: { accept: 'application/json' } },
    );
    expect(result).toEqual({
      products: [
        {
          ...PRODUCT,
          stockLabel: '12 in stock',
          available: true,
          priceLabel: '\u00a325.00',
        },
      ],
      categories: ['Audio'],
    });
  });

  it('accepts a product array and converts a string price to a GBP label', async () => {
    fetchMock.mockResolvedValue(Response.json([{ ...PRODUCT, price: '19.5' }]));

    const { products } = await service.getProducts();

    expect(products[0]).toMatchObject({
      price: '19.5',
      priceLabel: '\u00a319.50',
    });
  });

  it('returns unique categories in their original order', async () => {
    fetchMock.mockResolvedValue(
      Response.json({
        products: [
          PRODUCT,
          { ...PRODUCT, id: 'product-2', category: 'Photography' },
          { ...PRODUCT, id: 'product-3' },
        ],
      }),
    );

    const { products, categories } = await service.getProducts();

    expect(products).toHaveLength(3);
    expect(categories).toEqual(['Audio', 'Photography']);
  });

  it.each([[], { products: [] }])(
    'handles an empty product list: %j',
    async (payload) => {
      fetchMock.mockResolvedValue(Response.json(payload));

      await expect(service.getProducts()).resolves.toEqual({
        products: [],
        categories: [],
      });
    },
  );

  it.each([
    {
      stock: 0,
      expectedStock: 0,
      stockLabel: 'Out of stock',
      available: false,
    },
    { stock: '7', expectedStock: 7, stockLabel: '7 in stock', available: true },
  ])(
    'normalises stock $stock',
    async ({ stock, expectedStock, stockLabel, available }) => {
      fetchMock.mockResolvedValue(
        Response.json({ products: [{ ...PRODUCT, stock }] }),
      );

      const { products } = await service.getProducts();

      expect(products[0]).toMatchObject({
        stock: expectedStock,
        stockLabel,
        available,
      });
    },
  );

  it.each([
    undefined,
    null,
    '',
    ' ',
    'invalid',
    -1,
    1.5,
    true,
    Number.MAX_SAFE_INTEGER + 1,
  ])('marks invalid or missing stock %j as unavailable', async (stock) => {
    fetchMock.mockResolvedValue(
      Response.json({ products: [{ ...PRODUCT, stock }] }),
    );

    const { products } = await service.getProducts();

    expect(products[0]).toMatchObject({
      stock: null,
      stockLabel: 'Stock unavailable',
      available: false,
    });
  });

  it.each([null, {}, { products: 'invalid' }])(
    'rejects an unexpected payload: %j',
    async (payload) => {
      fetchMock.mockResolvedValue(Response.json(payload));

      await expect(service.getProducts()).rejects.toThrow(
        'The products API returned an unexpected response.',
      );
    },
  );

  it.each([404, 500])(
    'rejects a backend response with status %i',
    async (status) => {
      fetchMock.mockResolvedValue(new Response(null, { status }));

      await expect(service.getProducts()).rejects.toThrow(
        `Products API returned ${status}.`,
      );
    },
  );

  it('propagates a network failure', async () => {
    const error = new TypeError('fetch failed');
    fetchMock.mockRejectedValue(error);

    await expect(service.getProducts()).rejects.toBe(error);
  });

  it('rejects a response containing invalid JSON', async () => {
    fetchMock.mockResolvedValue(new Response('not JSON'));

    await expect(service.getProducts()).rejects.toBeInstanceOf(SyntaxError);
  });
});
