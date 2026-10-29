import type { Request, Response } from 'express';
import { describe, expect, it, vi } from 'vitest';
import { CatalogController } from '../src/server/controllers/catalog-controller';
import type { CatalogService } from '../src/server/services/catalog-service';

describe('CatalogController.showProducts', () => {
  it('renders the products and categories returned by the service', async () => {
    const products = [
      {
        id: 'product-1',
        name: 'Test headphones',
        category: 'Audio',
        price: 25,
        image: 'https://example.com/headphones.jpg',
        description: 'A test product.',
        stock: 12,
        stockLabel: '12 in stock',
        available: true,
        priceLabel: 'GBP 25.00',
      },
    ];
    const categories = ['Audio'];
    const getProducts = vi
      .fn<CatalogService['getProducts']>()
      .mockResolvedValue({ products, categories });
    const service = { getProducts } as unknown as CatalogService;
    const controller = new CatalogController(service);
    const request = {} as Request;
    const render = vi.fn();
    const status = vi.fn().mockReturnThis();
    const response = { render, status } as unknown as Response;

    await controller.showProducts(request, response);

    expect(getProducts).toHaveBeenCalledExactlyOnceWith();
    expect(render).toHaveBeenCalledExactlyOnceWith('product.njk', {
      products,
      categories,
    });
    expect(status).not.toHaveBeenCalled();
  });

  it('renders a safe error with status 502 when the service fails', async () => {
    const error = new Error('Private backend error');
    const getProducts = vi
      .fn<CatalogService['getProducts']>()
      .mockRejectedValue(error);
    const service = { getProducts } as unknown as CatalogService;
    const controller = new CatalogController(service);
    const request = {} as Request;
    const render = vi.fn();
    const status = vi.fn().mockReturnThis();
    const response = { render, status } as unknown as Response;
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => {});

    try {
      await controller.showProducts(request, response);

      expect(getProducts).toHaveBeenCalledExactlyOnceWith();
      expect(status).toHaveBeenCalledExactlyOnceWith(502);
      expect(render).toHaveBeenCalledExactlyOnceWith('product.njk', {
        products: [],
        productError: 'Products are temporarily unavailable.',
      });
      expect(errorLog).toHaveBeenCalledExactlyOnceWith(
        'Unable to load products from the backend:',
        error,
      );
    } finally {
      errorLog.mockRestore();
    }
  });
});

// const fetch = globalThis.fetch;

//   describe('GET /products', () => {
//     it('renders products returned by the backend API', async () => {
//       const res = await fetch(`src/views/product.njk`);
//       assert.equal(res.status, 200);
//       const html = await res.text();
//       assert.match(html, /Backend Product/);
//       assert.match(html, /Test category/);
//       assert.doesNotMatch(html, /Studio Wireless Headphones/);
//     });

//     it('removes search while keeping the product count', async () => {
//       const html = await (await fetch(`src/views/product.njk`)).text();
//       assert.doesNotMatch(
//         html,
//         /productSearch|search-field|data-search|noSearchResults/,
//       );
//       assert.match(html, /10 products/);
//     });

//     it('renders one category toggle per backend category and tags product cards', async () => {
//       const html = await (await fetch(`src/views/product.njk`)).text();
//       const filters = [...html.matchAll(/data-category-filter="([^"]+)"/g)].map(
//         (match) => match[1],
//       );
//       assert.deepEqual(filters, ['Test category', 'Audio', 'Photography']);
//       assert.equal((html.match(/aria-pressed="false"/g) ?? []).length, 3);
//       assert.equal(
//         (html.match(/data-product-card data-category=/g) ?? []).length,
//         10,
//       );
//     });

//     it('shows stock quantities and disables unavailable products', async () => {
//       const html = await (await fetch(`src/views/product.njk`)).text();
//       const cards = [
//         ...html.matchAll(/<article\b[^>]*>([\s\S]*?)<\/article>/g),
//       ].map((match) => match[1] as string);
//       assert.equal(cards.length, 10);
//       for (const [index, card] of cards.entries()) {
//         const button = card.match(
//           /<button\b[^>]*data-add-to-basket[^>]*>/,
//         )?.[0];
//         assert.ok(button);
//         if (index === 0 || index === 2) {
//           assert.match(card, index === 0 ? /12 in stock/ : /7 in stock/);
//           assert.doesNotMatch(button, /\bdisabled\b/);
//         } else {
//           assert.match(
//             card,
//             index === 1 ? /Out of stock/ : /Stock unavailable/,
//           );
//           assert.match(button, /\bdisabled\b/);
//         }
//       }
//     });
//   });
