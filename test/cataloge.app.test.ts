import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, it } from 'vitest';
import { createApp } from '../src/app';

function listen(server: Server): Promise<string> {
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      resolve(`http://127.0.0.1:${(server.address() as AddressInfo).port}`);
    });
  });
}

function close(server: Server): Promise<void> {
  return new Promise((resolve) => server.close(() => resolve()));
}

describe('catalog TypeScript integration', () => {
  let backend: Server;
  let frontend: Server;
  let base: string;

  beforeAll(async () => {
    backend = createServer((req, res) => {
      if (req.url !== '/api/products') {
        res.writeHead(404).end();
        return;
      }
      res.setHeader('content-type', 'application/json');
      res.end(
        JSON.stringify({
          products: ['Audio', 'Photography', 'Wearables'].map(
            (category, index) => ({
              id: `catalog-${index}`,
              name: `${category} product`,
              category,
              price: 25,
              stock: index === 1 ? 0 : 12,
              image: 'https://example.com/product.jpg',
              description: `${category} product description.`,
            }),
          ),
        }),
      );
    });
    const backendOrigin = await listen(backend);
    frontend = createServer(createApp(backendOrigin));
    base = await listen(frontend);
  });

  afterAll(async () => {
    await close(frontend);
    await close(backend);
  });

  it('loads the compiled catalog controller rather than the old JavaScript source', async () => {
    const response = await fetch(`${base}/products`);
    assert.equal(response.status, 200);
    const html = await response.text();
    assert.match(
      html,
      /<script src="\/controllers\/product_catalog\.js" defer><\/script>/,
    );
    assert.doesNotMatch(html, /\/product-catalog\/product_catalog\.js/);
    const script = await fetch(`${base}/controllers/product_catalog.js`);
    assert.equal(script.status, 200);
    assert.match(script.headers.get('content-type') ?? '', /javascript/);
    assert.match(await script.text(), /data-category-filter/);
  });

  it('preserves category controls, stock labels and product details', async () => {
    const html = await (await fetch(`${base}/products`)).text();
    for (const category of ['Audio', 'Photography', 'Wearables']) {
      assert.match(html, new RegExp(`data-category-filter="${category}"`));
      assert.match(html, new RegExp(`data-product-name="${category} product"`));
    }
    assert.match(html, /12 in stock/);
    assert.match(html, /Out of stock/);
    assert.match(html, /data-add-to-basket="catalog-1"\s+disabled/);
    assert.match(html, /id="productDetails"/);
  });

  it('does not serve the removed catalog JavaScript source', async () => {
    const response = await fetch(`${base}/product-catalog/product_catalog.js`);
    assert.equal(response.status, 404);
  });
});
