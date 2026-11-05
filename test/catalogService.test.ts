import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CatalogService } from '../src/services/catalog-service';

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
      facets: null,
    });
  });

  it('sends filters to the backend and returns its facets', async () => {
    const facets = {
      total: 3,
      categories: [{ name: 'Audio', count: 1 }],
      stock: { in: 1, out: 0 },
      priceRange: { min: '25.00', max: '25.00' },
    };
    fetchMock.mockResolvedValue(Response.json({ products: [PRODUCT], facets }));

    const result = await service.getProducts({
      stock: ['in'],
      categories: ['Audio', 'Hi-Fi & TV'],
      minPrice: '',
      maxPrice: '',
      priceBand: '10-25',
      sort: 'price-desc',
    });

    expect(String(fetchMock.mock.calls[0]?.[0])).toBe(
      `${BACKEND_ORIGIN}/api/products?stock=in&category=Audio&category=Hi-Fi+%26+TV&minPrice=10&maxPrice=24.99&sort=price-desc`,
    );
    expect(result.facets).toEqual(facets);
  });

  it('ignores facets that are not in the expected shape', async () => {
    fetchMock.mockResolvedValue(
      Response.json({ products: [PRODUCT], facets: { total: 'many' } }),
    );
    expect((await service.getProducts()).facets).toBeNull();
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
        facets: null,
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

describe('CatalogService.getCategories', () => {
  const service = new CatalogService(BACKEND_ORIGIN);
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('shares an in-flight category refresh across concurrent requests', async () => {
    let resolveResponse: (response: Response) => void = () => {};
    fetchMock.mockReturnValue(
      new Promise((resolve) => {
        resolveResponse = resolve;
      }),
    );

    const requests = [
      service.getCategories(0),
      service.getCategories(0),
      service.getCategories(0),
    ];

    expect(fetchMock).toHaveBeenCalledExactlyOnceWith(
      new URL('/api/products', BACKEND_ORIGIN),
      {
        headers: { accept: 'application/json' },
        signal: expect.any(AbortSignal),
      },
    );
    resolveResponse(Response.json({ products: [PRODUCT] }));

    await expect(Promise.all(requests)).resolves.toEqual([
      ['Audio'],
      ['Audio'],
      ['Audio'],
    ]);
  });
});

describe('CatalogService.getProduct', () => {
  const service = new CatalogService(BACKEND_ORIGIN);
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('fetches one product by its encoded id and adds the same labels', async () => {
    fetchMock.mockResolvedValue(Response.json({ product: PRODUCT }));

    const product = await service.getProduct('a/b');

    expect(fetchMock).toHaveBeenCalledExactlyOnceWith(
      new URL('/api/products/a%2Fb', BACKEND_ORIGIN),
      { headers: { accept: 'application/json' } },
    );
    expect(product).toMatchObject({
      id: 'product-1',
      priceLabel: '£25.00',
      stockLabel: '12 in stock',
      available: true,
    });
  });

  it('returns null when the backend has no such product', async () => {
    fetchMock.mockResolvedValue(
      Response.json({ message: 'Product not found.' }, { status: 404 }),
    );
    expect(await service.getProduct('missing')).toBeNull();
  });

  it('throws when the backend fails or sends an unexpected body', async () => {
    fetchMock.mockResolvedValueOnce(new Response('', { status: 500 }));
    await expect(service.getProduct('x')).rejects.toThrow('500');

    fetchMock.mockResolvedValueOnce(Response.json({ products: [] }));
    await expect(service.getProduct('x')).rejects.toThrow('unexpected');
  });
});
