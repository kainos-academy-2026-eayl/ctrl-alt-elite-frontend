import assert from 'node:assert/strict';
import { createServer, type IncomingMessage, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, it } from 'vitest';
import { createApp } from '../src/app';
import { SAMPLE_PRODUCTS } from '../src/data/sampleProducts';

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

function product(
  id: string,
  name: string,
  description: string,
  price: string,
  isInStock: boolean,
) {
  return {
    id,
    name,
    description,
    imageUrl: '/assets/images/placeholder.svg',
    price,
    keywords: [],
    isInStock,
  };
}

const DESK_LAMP = product(
  'sample-lamp',
  'Desk Lamp',
  'Adjustable LED lamp with a warm and a cool light setting.',
  '24.99',
  true,
);
const NOISE_CANCELLING_HEADPHONES = product(
  'sample-headphones',
  'Noise-Cancelling Headphones',
  'Over-ear headphones with active noise cancelling.',
  '129.99',
  true,
);
const STUDIO_HEADPHONES = product(
  'sample-studio-headphones',
  'Studio Headphones',
  'Wired studio headphones with a flat sound profile.',
  '89.00',
  false,
);
const HEADPHONES = [NOISE_CANCELLING_HEADPHONES, STUDIO_HEADPHONES];

/**
 * Canned responses from the backend's GET /api/products/search, keyed by the
 * term it receives. The backend owns the matching rules and tests them; any
 * other term returns no products.
 */
const SEARCH_RESPONSES: Record<
  string,
  { products: unknown[]; isClosestMatch: boolean }
> = {
  lamp: { products: [DESK_LAMP], isClosestMatch: false },
  'desk lamp': { products: [DESK_LAMP], isClosestMatch: false },
  'dek lam': { products: [DESK_LAMP], isClosestMatch: true },
  '<lamp>': { products: [DESK_LAMP], isClosestMatch: true },
  headphone: { products: HEADPHONES, isClosestMatch: false },
  hedphones: { products: HEADPHONES, isClosestMatch: true },
};

async function readBody(req: IncomingMessage): Promise<string> {
  let body = '';
  for await (const chunk of req) body += chunk;
  return body;
}

describe('frontend routes', () => {
  let backend: Server;
  let frontend: Server;
  let base: string;
  const searchRequests: string[] = [];

  beforeAll(async () => {
    backend = createServer(async (req, res) => {
      const url = new URL(req.url ?? '/', 'http://backend');
      if (url.pathname === '/api/products/search') {
        const q = url.searchParams.get('q') ?? '';
        searchRequests.push(q);
        if (q === 'backend-error') {
          res.statusCode = 500;
          res.end(
            JSON.stringify({ message: 'Unable to complete the request.' }),
          );
          return;
        }
        res.setHeader('content-type', 'application/json');
        res.end(
          JSON.stringify({
            searchTerm: q,
            ...(SEARCH_RESPONSES[q] ?? { products: [], isClosestMatch: false }),
          }),
        );
      } else if (req.url === '/api/echo') {
        res.setHeader('content-type', 'application/json');
        res.setHeader('x-custom', 'yes');
        res.setHeader('set-cookie', ['a=1; Path=/', 'b=2; Path=/']);
        res.statusCode = 201;
        res.end(
          JSON.stringify({
            method: req.method,
            body: await readBody(req),
            auth: req.headers.authorization ?? null,
          }),
        );
      } else if (req.url === '/api/missing') {
        res.statusCode = 404;
        res.end('nope');
      } else {
        res.statusCode = 500;
        res.end();
      }
    });
    const backendOrigin = await listen(backend);
    frontend = createServer(createApp(backendOrigin));
    base = await listen(frontend);
  });

  afterAll(async () => {
    await close(frontend);
    await close(backend);
  });

  describe('GET /', () => {
    it('serves the homepage as html', async () => {
      const res = await fetch(`${base}/`);
      assert.equal(res.status, 200);
      assert.match(res.headers.get('content-type') ?? '', /text\/html/);
      assert.match(await res.text(), /<html/i);
    });

    it('renders an Add to Basket button for each product', async () => {
      const html = await (await fetch(`${base}/`)).text();
      const buttons = html.match(/data-add-to-basket /g) ?? [];
      const inStockCount = SAMPLE_PRODUCTS.filter((p) => p.isInStock).length;
      assert.equal(buttons.length, inStockCount);
      assert.match(html, /data-product-id="sample-lamp"/);
    });
  });

  describe('GET /search', () => {
    it('shows matching products with name, description and image', async () => {
      const html = await (await fetch(`${base}/search?q=lamp`)).text();
      assert.match(html, /Desk Lamp/);
      assert.match(html, /Adjustable LED lamp/);
      assert.match(html, /placeholder\.svg/);
    });

    it('shows out of stock products as unavailable', async () => {
      const html = await (await fetch(`${base}/search?q=headphone`)).text();
      assert.match(html, /Studio Headphones/);
      assert.match(html, /Out of Stock/);
      assert.match(html, /Noise-Cancelling Headphones/);
    });

    it('shows a message when nothing matches', async () => {
      const html = await (await fetch(`${base}/search?q=zzzz`)).text();
      assert.match(html, /No products found/);
    });

    it('shows the count for an exact match', async () => {
      const html = await (await fetch(`${base}/search?q=desk+lamp`)).text();
      assert.match(html, /1 product found for "desk lamp"/);
      assert.doesNotMatch(html, /No exact matches/);
    });

    it('shows the closest product for a misspelled search', async () => {
      const html = await (await fetch(`${base}/search?q=dek+lam`)).text();
      assert.match(
        html,
        /No exact matches for "dek lam"\. Showing the closest match\./,
      );
      assert.match(html, /Desk Lamp/);
      assert.doesNotMatch(html, /Ceramic Mug/);
    });

    it('uses the plural message when several products are closest', async () => {
      const html = await (await fetch(`${base}/search?q=hedphones`)).text();
      assert.match(html, /Showing the closest matches\./);
      assert.match(html, /Noise-Cancelling Headphones/);
      assert.match(html, /Studio Headphones/);
    });

    it('escapes the search term in the closest match message', async () => {
      const html = await (
        await fetch(`${base}/search?q=${encodeURIComponent('<lamp>')}`)
      ).text();
      assert.match(html, /No exact matches for "&lt;lamp&gt;"/);
      assert.doesNotMatch(html, /<lamp>/);
    });

    it('searches the backend product API with the normalised term', async () => {
      searchRequests.length = 0;
      await fetch(`${base}/search?q=${encodeURIComponent('  desk & lamp  ')}`);
      assert.deepEqual(searchRequests, ['desk & lamp']);
    });

    it('does not call the backend for a blank search', async () => {
      searchRequests.length = 0;
      const html = await (await fetch(`${base}/search?q=+++`)).text();
      assert.deepEqual(searchRequests, []);
      assert.match(html, /Enter a product name or keyword to search\./);
    });

    it('redirects to the unavailable page when the backend search fails', async () => {
      const res = await fetch(`${base}/search?q=backend-error`, {
        redirect: 'manual',
      });
      assert.equal(res.status, 302);
      assert.equal(res.headers.get('location'), '/unavailable');
    });

    it('redirects to the unavailable page when the backend is unreachable', async () => {
      const dead = createServer(() => {});
      const deadOrigin = await listen(dead);
      await close(dead);
      const app = createServer(createApp(deadOrigin));
      const origin = await listen(app);
      try {
        const res = await fetch(`${origin}/search?q=lamp`, {
          redirect: 'manual',
        });
        assert.equal(res.status, 302);
        assert.equal(res.headers.get('location'), '/unavailable');
      } finally {
        await close(app);
      }
    });

    it('escapes the search term', async () => {
      const html = await (
        await fetch(
          `${base}/search?q=${encodeURIComponent('<script>x</script>')}`,
        )
      ).text();
      assert.doesNotMatch(html, /<script>x<\/script>/);
    });
  });

  describe('GET /register', () => {
    it('serves the register page as html', async () => {
      const res = await fetch(`${base}/register`);
      assert.equal(res.status, 200);
      assert.match(res.headers.get('content-type') ?? '', /text\/html/);
      assert.match(await res.text(), /<html/i);
    });
  });

  describe('GET /basket', () => {
    it('renders the basket page as html', async () => {
      const res = await fetch(`${base}/basket`);
      assert.equal(res.status, 200);
      assert.match(res.headers.get('content-type') ?? '', /text\/html/);
      const html = await res.text();
      assert.match(html, /<h1 id="basket-heading">Your basket<\/h1>/);
      assert.match(html, /data-basket-checkout/);
    });
  });

  describe('GET /unavailable', () => {
    it('serves the unavailable page with 503', async () => {
      const res = await fetch(`${base}/unavailable`);
      assert.equal(res.status, 503);
      assert.match(res.headers.get('content-type') ?? '', /text\/html/);
    });
  });

  describe('GET /health', () => {
    it('returns status ok and numeric uptime', async () => {
      const res = await fetch(`${base}/health`);
      assert.equal(res.status, 200);
      const body = (await res.json()) as { status: string; uptime: number };
      assert.equal(body.status, 'ok');
      assert.equal(typeof body.uptime, 'number');
    });
  });

  describe('static assets', () => {
    for (const [path, type] of [
      ['/assets/styles.css', /text\/css/],
      ['/controllers/script.js', /javascript/],
      ['/assets/register.css', /text\/css/],
      ['/controllers/register.js', /javascript/],
      ['/assets/basket.css', /text\/css/],
      ['/controllers/basket.js', /javascript/],
    ] as const) {
      it(`serves ${path}`, async () => {
        const res = await fetch(`${base}${path}`);
        assert.equal(res.status, 200);
        assert.match(res.headers.get('content-type') ?? '', type);
      });
    }

    it('returns 404 for unknown paths', async () => {
      const res = await fetch(`${base}/does-not-exist`);
      assert.equal(res.status, 404);
    });
  });

  describe('page references', () => {
    for (const page of ['/', '/register', '/basket', '/unavailable']) {
      it(`every local href/src on ${page} resolves`, async () => {
        const html = await (await fetch(`${base}${page}`)).text();
        const refs = [...html.matchAll(/\b(?:href|src)="([^"#]+)"/g)]
          .map((match) => match[1] as string)
          .filter((ref) => !/^[a-z][a-z0-9+.-]*:/i.test(ref));
        assert.ok(refs.length > 0);
        for (const ref of refs) {
          const res = await fetch(new URL(ref, `${base}${page}`), {
            redirect: 'manual',
          });
          assert.ok(
            res.status === 200 || res.status === 503,
            `${page} references ${ref} which returned ${res.status}`,
          );
        }
      });
    }
  });

  describe('/api proxy', () => {
    it('forwards GET requests, status, headers and multiple cookies', async () => {
      const res = await fetch(`${base}/api/echo`, {
        headers: { authorization: 'Bearer token' },
      });
      assert.equal(res.status, 201);
      assert.equal(res.headers.get('x-custom'), 'yes');
      assert.deepEqual(res.headers.getSetCookie(), [
        'a=1; Path=/',
        'b=2; Path=/',
      ]);
      assert.deepEqual(await res.json(), {
        method: 'GET',
        body: '',
        auth: 'Bearer token',
      });
    });

    it('forwards POST request bodies', async () => {
      const res = await fetch(`${base}/api/echo`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: 'a@b.c' }),
      });
      const body = (await res.json()) as { method: string; body: string };
      assert.equal(body.method, 'POST');
      assert.equal(body.body, JSON.stringify({ email: 'a@b.c' }));
    });

    it('passes through upstream error statuses', async () => {
      const res = await fetch(`${base}/api/missing`);
      assert.equal(res.status, 404);
      assert.equal(await res.text(), 'nope');
    });

    it('returns 502 when the backend is unreachable', async () => {
      const dead = createServer();
      const deadOrigin = await listen(dead);
      await close(dead);
      const app = createServer(createApp(deadOrigin));
      const origin = await listen(app);
      const originalError = console.error;
      console.error = () => {};
      try {
        const res = await fetch(`${origin}/api/anything`);
        assert.equal(res.status, 502);
        assert.deepEqual(await res.json(), {
          message: 'Unable to reach the backend API.',
        });
      } finally {
        console.error = originalError;
        await close(app);
      }
    });
  });
});
