import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, it } from 'vitest';
import { createApp } from '../src/app';

const PRODUCTS = [
  { id: 'p1', name: 'Headphones', category: 'Audio', price: 25, stock: 4 },
  { id: 'p2', name: 'Speaker', category: 'Audio', price: 40, stock: 2 },
  { id: 'p3', name: 'Mug', category: 'Kitchen & Home', price: 8, stock: 9 },
].map((product) => ({
  ...product,
  image: `https://example.com/${product.id}.jpg`,
  description: `${product.name} description`,
}));

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

describe('customer site navigation', () => {
  let backend: Server;
  let frontend: Server;
  let base: string;
  let productRequests = 0;
  let basketRequests = 0;
  let productsAvailable = true;

  beforeAll(async () => {
    backend = createServer((req, res) => {
      res.setHeader('content-type', 'application/json');
      if (req.url === '/api/admin/profile') {
        res.end(
          JSON.stringify({
            name: 'Ada Lovelace',
            email: 'ada@example.com',
            role: 'ADMIN',
          }),
        );
        return;
      }
      if (req.url?.startsWith('/api/admin/customers')) {
        res.end('{}');
        return;
      }
      if (req.url?.startsWith('/api/products')) {
        productRequests += 1;
        const category = new URL(req.url, 'http://backend').searchParams.get(
          'category',
        );
        const matches = category
          ? PRODUCTS.filter((product) => product.category === category)
          : PRODUCTS;
        res.statusCode = productsAvailable ? 200 : 500;
        res.end(JSON.stringify(productsAvailable ? { products: matches } : {}));
        return;
      }
      if (req.url?.startsWith('/api/baskets/')) {
        basketRequests += 1;
      }
      res.statusCode = 404;
      res.end('{}');
    });
    frontend = createServer(createApp(await listen(backend)));
    base = await listen(frontend);
  });

  afterAll(async () => {
    await close(frontend);
    await close(backend);
  });

  async function page(path: string): Promise<string> {
    const res = await fetch(`${base}${path}`, { redirect: 'manual' });
    return res.text();
  }

  function navOf(html: string): string {
    return /<div class="site-nav">[\s\S]*?<\/nav>/.exec(html)?.[0] ?? '';
  }

  it('shows the same navigation on every customer page', async () => {
    for (const path of [
      '/',
      '/products',
      '/products/p1',
      '/search?q=mug',
      '/basket',
      '/login',
      '/register',
    ]) {
      const html = await page(path);
      const nav = navOf(html);
      assert.match(nav, /aria-label="Main navigation"/, path);
      assert.match(nav, /href="\/"[^>]*>Home<\/a>/, path);
      assert.match(nav, /href="\/products"[^>]*>Shop<\/a>/, path);
      assert.match(nav, /role="search"/, path);
      assert.match(nav, /class="account-menu"/, path);
      assert.match(nav, /href="\/login"/, path);
      assert.match(nav, /class="nav-link basket-icon-link/, path);
      assert.match(nav, /class="site-nav-check" type="checkbox"/, path);
      assert.equal(
        html.match(/<script src="\/controllers\/script\.js" defer><\/script>/g)
          ?.length,
        1,
        path,
      );
    }
  });

  it('does not cache pages that render customer navigation', async () => {
    for (const path of [
      '/',
      '/products',
      '/products/p1',
      '/search?q=mug',
      '/basket',
      '/login',
      '/register',
    ]) {
      const res = await fetch(`${base}${path}`, { redirect: 'manual' });
      assert.equal(res.headers.get('cache-control'), 'no-store', path);
    }
  });

  it('includes navigation data on failed login submissions', async () => {
    const res = await fetch(`${base}/login`, {
      method: 'POST',
      headers: {
        origin: base,
        'content-type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ email: 'ada@example.com', password: 'bad' }),
      redirect: 'manual',
    });

    assert.equal(res.status, 502);
    assert.equal(res.headers.get('cache-control'), 'no-store');
    assert.match(navOf(await res.text()), /Kitchen &amp; Home/);
  });

  it('loads basket data only once on basket and checkout pages', async () => {
    const cookie = 'basket_id=00000000-0000-4000-8000-000000000001';
    const beforeBasket = basketRequests;
    await fetch(`${base}/basket`, { headers: { cookie } });
    assert.equal(basketRequests - beforeBasket, 1);

    const beforeCheckout = basketRequests;
    await fetch(`${base}/checkout`, {
      headers: { cookie },
      redirect: 'manual',
    });
    assert.equal(basketRequests - beforeCheckout, 1);
  });

  it('lists the product categories as links, escaping their names', async () => {
    const nav = navOf(await page('/'));
    assert.match(nav, /href="\/products\?category=Audio"/);
    assert.match(nav, /href="\/products\?category=Kitchen%20%26%20Home"/);
    assert.match(nav, />Kitchen &amp; Home<\/a>/);
  });

  it('filters the catalogue by the chosen category', async () => {
    const html = await page('/products?category=Audio');
    assert.match(html, /<h1 id="catalogTitle">Audio<\/h1>/);
    assert.match(html, /Headphones/);
    assert.match(html, /Speaker/);
    assert.doesNotMatch(html, /<h2>Mug<\/h2>/);
    assert.match(
      navOf(html),
      /href="\/products\?category=Audio" aria-current="page"/,
    );

    const unknown = await page('/products?category=Nope');
    assert.doesNotMatch(unknown, /<h2>(Mug|Headphones|Speaker)<\/h2>/);
  });

  it('marks the current page in the navigation', async () => {
    assert.match(navOf(await page('/')), /href="\/" aria-current="page">Home/);
    assert.match(
      navOf(await page('/products')),
      /href="\/products" aria-current="page">Shop/,
    );
    assert.match(
      navOf(await page('/products/p1')),
      /href="\/products" aria-current="page">Shop/,
    );
    assert.match(
      navOf(await page('/basket')),
      /href="\/basket" aria-current="page"/,
    );
    assert.doesNotMatch(
      navOf(await page('/search?q=mug')),
      /aria-current="page"/,
    );
  });

  it('keeps the page working without categories when the backend fails', async () => {
    productsAvailable = false;
    try {
      const app = createApp(
        `http://127.0.0.1:${(backend.address() as AddressInfo).port}`,
      );
      const server = createServer(app);
      const origin = await listen(server);
      try {
        const res = await fetch(`${origin}/basket`);
        assert.equal(res.status, 200);
        const nav = navOf(await res.text());
        assert.match(nav, /href="\/products"[^>]*>Shop<\/a>/);
        assert.doesNotMatch(nav, /Categories/);
      } finally {
        await close(server);
      }
    } finally {
      productsAvailable = true;
    }
  });

  it('does not render the customer navigation on staff dashboards', async () => {
    const before = productRequests;
    const res = await fetch(`${base}/admin`, {
      headers: { cookie: 'auth_token=admin-token' },
      redirect: 'manual',
    });
    const html = await res.text();
    assert.equal(res.status, 200);
    assert.match(html, /admin-nav/);
    assert.doesNotMatch(html, /site-nav|skip-link/);
    assert.equal(productRequests, before);
  });
});
