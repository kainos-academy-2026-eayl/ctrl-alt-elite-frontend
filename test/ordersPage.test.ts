import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, beforeEach, describe, it, vi } from 'vitest';
import { createApp } from '../src/app';

async function listen(server: Server): Promise<string> {
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

async function close(server: Server): Promise<void> {
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
}

describe('GET /orders', () => {
  let frontend: Server;
  let backend: Server;
  let base: string;
  let status: number;
  let payload: unknown;
  let authorization: string | undefined;
  let orderRequests: number;

  beforeAll(async () => {
    backend = createServer((req, res) => {
      if (req.url === '/api/orders') {
        authorization = req.headers.authorization;
        orderRequests++;
        res.writeHead(status, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(payload));
        return;
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ products: [] }));
    });
    const origin = await listen(backend);
    frontend = createServer(createApp(origin));
    base = await listen(frontend);
  });

  beforeEach(() => {
    status = 200;
    payload = { orders: [] };
    authorization = undefined;
    orderRequests = 0;
  });

  afterAll(async () => {
    await close(frontend);
    await close(backend);
  });

  function getOrders(cookie = 'auth_token=customer-token', language = 'en') {
    return fetch(`${base}/orders`, {
      headers: { cookie, 'accept-language': language },
      redirect: 'manual',
    });
  }

  it('redirects guests to login without requesting orders', async () => {
    const response = await getOrders('');
    assert.equal(response.status, 303);
    assert.equal(response.headers.get('location'), '/login');
    assert.equal(orderRequests, 0);
  });

  it('renders empty history in the shared layout using the customer token', async () => {
    const response = await getOrders();
    const html = await response.text();
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.equal(authorization, 'Bearer customer-token');
    assert.match(html, /You have no previous orders\./);
    assert.match(html, /class="site-footer"/);
    assert.ok(!html.includes('customer-token'));
    assert.doesNotMatch(html, /product_catalog\.js/);
  });

  it('renders order totals and product quantities with escaped content', async () => {
    payload = {
      orders: [
        {
          id: 'order-1',
          order_total: 52.5,
          order_status: '<script>unsafe</script>',
          createdAt: '2026-11-05T12:00:00Z',
          delivery_price_pence: 250,
          products: [
            { product_id: 'product-1', amount: 2, unit_price_pence: 2500 },
          ],
        },
      ],
    };
    const response = await getOrders();
    const html = await response.text();
    assert.equal(response.status, 200);
    assert.match(html, /Order #order-1/);
    assert.match(html, /Product #product-1 - Quantity: 2/);
    assert.match(html, /Total: £52\.50/);
    assert.match(html, /&lt;script&gt;unsafe&lt;\/script&gt;/);
    assert.doesNotMatch(html, /<script>unsafe/);
  });

  it('renders translated empty history', async () => {
    const response = await getOrders('auth_token=customer-token', 'fr');
    assert.match(await response.text(), /Historique des commandes/);
  });

  it.each([500, 401])(
    'shows an explicit failure for backend status %i',
    async (code) => {
      status = code;
      const log = vi.spyOn(console, 'error').mockImplementation(() => {});
      try {
        const response = await getOrders();
        const html = await response.text();
        assert.equal(response.status, 502);
        assert.match(html, /role="alert">Orders are temporarily unavailable\./);
        assert.doesNotMatch(html, /You have no previous orders/);
        assert.equal(log.mock.calls.length, 1);
      } finally {
        log.mockRestore();
      }
    },
  );
});
