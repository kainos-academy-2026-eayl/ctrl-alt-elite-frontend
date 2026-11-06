import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import { HIDDEN_HOMEPAGE_PRODUCT_IDS } from '../src/data/hiddenProducts';
import type { CatalogProduct } from '../src/services/catalog-service';
import { pickHomepageProducts } from '../src/services/homepage-products';
import { ProductService } from '../src/services/productService';
import { buildHomepage } from '../src/views/homepage.page';
import { buildProductDetailPage } from '../src/views/product-detail.page';

const POPULAR = [
  {
    id: 'a/1',
    name: 'Kainos Hoodie',
    price: '8.99',
    imageUrl: 'data:image/png;base64,AA==',
  },
  {
    id: 'crown',
    name: 'Crown',
    price: '9999.00',
    imageUrl: 'data:image/png;base64,AA==',
  },
];

function catalogProduct(
  id: string | number,
  overrides: Partial<CatalogProduct> = {},
): CatalogProduct {
  return {
    id,
    name: `Product ${id}`,
    category: 'Test',
    description: 'A test product.',
    price: 8.99,
    image: 'data:image/png;base64,AA==',
    stock: 5,
    stockLabel: '5 in stock',
    available: true,
    priceLabel: '£8.99',
    ...overrides,
  };
}

describe('buildHomepage conveyor cards', () => {
  it('links each conveyor product to its product page with its price', () => {
    const page = buildHomepage({
      account: null,
      products: [],
      conveyorProducts: [
        catalogProduct('a/1', { name: 'Kainos Hoodie' }),
        catalogProduct(7, { name: 'Crown', priceLabel: '£9,999.00' }),
      ],
      basket: null,
    });
    assert.deepEqual(page.conveyorCards, [
      {
        name: 'Kainos Hoodie',
        imageUrl: 'data:image/png;base64,AA==',
        price: '£8.99',
        url: '/products/a%2F1',
      },
      {
        name: 'Crown',
        imageUrl: 'data:image/png;base64,AA==',
        price: '£9,999.00',
        url: '/products/7',
      },
    ]);
  });

  it('has no conveyor cards when there are no conveyor products', () => {
    const page = buildHomepage({ account: null, products: [], basket: null });
    assert.deepEqual(page.conveyorCards, []);
  });
});

describe('pickHomepageProducts', () => {
  const ids = (products: readonly CatalogProduct[]) =>
    products.map((product) => product.id);
  const catalogue = [
    ...[...HIDDEN_HOMEPAGE_PRODUCT_IDS].map((id) => catalogProduct(id)),
    catalogProduct('sold-out', { available: false }),
    ...Array.from({ length: 10 }, (_, i) => catalogProduct(`p${i + 1}`)),
  ];

  it('features the first six in-stock products that are not hidden', () => {
    assert.deepEqual(ids(pickHomepageProducts(catalogue).featured), [
      'p1',
      'p2',
      'p3',
      'p4',
      'p5',
      'p6',
    ]);
  });

  it('picks the conveyor at random from the products not featured', () => {
    assert.deepEqual(ids(pickHomepageProducts(catalogue, () => 0).conveyor), [
      'p7',
      'p8',
      'p9',
      'p10',
    ]);
    assert.deepEqual(
      ids(pickHomepageProducts(catalogue, () => 0.99).conveyor),
      ['p10', 'p9', 'p8', 'p7'],
    );
  });

  it('shows at most six conveyor products', () => {
    const big = Array.from({ length: 20 }, (_, i) => catalogProduct(i));
    const { featured, conveyor } = pickHomepageProducts(big);
    assert.equal(conveyor.length, 6);
    const featuredIds = new Set(ids(featured));
    assert.ok(conveyor.every((product) => !featuredIds.has(product.id)));
  });

  it('never shows hidden products', () => {
    const hiddenId = [...HIDDEN_HOMEPAGE_PRODUCT_IDS][0] as string;
    const { featured, conveyor } = pickHomepageProducts([
      catalogProduct(hiddenId),
    ]);
    assert.deepEqual([...featured, ...conveyor], []);
  });

  it('shows nothing for an empty catalogue', () => {
    assert.deepEqual(pickHomepageProducts([]), { featured: [], conveyor: [] });
  });
});

describe('buildProductDetailPage', () => {
  const product: CatalogProduct = {
    id: 42,
    name: 'Kainos Hoodie',
    category: 'Hoodie',
    description: 'A cozy hoodie.',
    price: 8.99,
    image: 'data:image/png;base64,AA==',
    stock: 0,
    stockLabel: 'Out of stock',
    available: false,
    priceLabel: '£8.99',
  };

  it('builds the product view, basket count and year', () => {
    const page = buildProductDetailPage({
      product,
      basket: null,
      now: new Date('2026-10-30T12:00:00Z'),
    });
    assert.deepEqual(page.product, {
      id: '42',
      name: 'Kainos Hoodie',
      category: 'Hoodie',
      description: 'A cozy hoodie.',
      imageUrl: 'data:image/png;base64,AA==',
      price: '£8.99',
      stockLabel: 'Out of stock',
      isAvailable: false,
    });
    assert.equal(page.basketSummary.itemCount, 0);
    assert.equal(page.addToBasketUrl, '/basket/items');
    assert.equal(page.currentYear, 2026);
  });
});

describe('ProductService.getPopular', () => {
  function fakeFetch(response: Response) {
    const urls: string[] = [];
    const fetchImpl: typeof fetch = async (input) => {
      urls.push(String(input));
      return response;
    };
    return { fetchImpl, urls };
  }

  it('asks the backend for the given number of popular products', async () => {
    const { fetchImpl, urls } = fakeFetch(Response.json({ products: POPULAR }));
    const products = await new ProductService(
      'http://backend.test',
      fetchImpl,
    ).getPopular(6);
    assert.deepEqual(products, POPULAR);
    assert.deepEqual(urls, [
      'http://backend.test/api/products/popular?limit=6',
    ]);
  });

  it('throws when the backend fails or sends an unexpected body', async () => {
    await assert.rejects(
      new ProductService(
        'http://backend.test',
        fakeFetch(new Response('', { status: 500 })).fetchImpl,
      ).getPopular(6),
      /status 500/,
    );
    await assert.rejects(
      new ProductService(
        'http://backend.test',
        fakeFetch(Response.json({ products: [{ id: 1 }] })).fetchImpl,
      ).getPopular(6),
      /unexpected response/,
    );
  });
});
