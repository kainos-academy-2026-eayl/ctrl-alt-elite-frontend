import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import type { CatalogProduct } from '../src/server/services/catalog-service';
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

describe('buildHomepage conveyor cards', () => {
  it('links each popular product to its product page with a formatted price', () => {
    const page = buildHomepage({
      account: null,
      products: [],
      conveyorProducts: POPULAR,
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
        url: '/products/crown',
      },
    ]);
  });

  it('has no conveyor cards when there are no popular products', () => {
    const page = buildHomepage({ account: null, products: [], basket: null });
    assert.deepEqual(page.conveyorCards, []);
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
