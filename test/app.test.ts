import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createServer, type IncomingMessage, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, it, vi } from 'vitest';
import { createApp } from '../src/app';

const TEST_JWT_SECRET = 'test-only-profile-secret-with-at-least-32-bytes';

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

async function readBody(req: IncomingMessage): Promise<string> {
  let body = '';
  for await (const chunk of req) body += chunk;
  return body;
}

describe('frontend routes', () => {
  let backend: Server;
  let frontend: Server;
  let base: string;
  const loginRequests: {
    method: string | undefined;
    body: unknown;
    contentType: string | undefined;
  }[] = [];

  beforeAll(async () => {
    backend = createServer(async (req, res) => {
      if (req.url === '/api/auth/login') {
        const body = JSON.parse(await readBody(req));
        loginRequests.push({
          method: req.method,
          body,
          contentType: req.headers['content-type'],
        });
        res.setHeader('content-type', 'application/json');
        if (body.email === 'unavailable@example.com') {
          res.statusCode = 500;
          res.end(JSON.stringify({ message: 'Private backend error' }));
        } else if (
          body.email === 'user@example.com' &&
          body.password === 'CorrectPassword@1'
        ) {
          res.end(
            JSON.stringify({ userId: 1, email: body.email, role: 'CUSTOMER' }),
          );
        } else if (
          body.email === 'admin@example.com' &&
          body.password === 'CorrectPassword@1'
        ) {
          res.end(
            JSON.stringify({
              userId: 2,
              email: body.email,
              role: 'ADMIN',
              token: 'admin.jwt.token',
            }),
          );
        } else if (body.email === 'unknownrole@example.com') {
          res.end(JSON.stringify({ userId: 3, role: 'SUPERUSER' }));
        } else if (body.email === 'norole@example.com') {
          res.end(JSON.stringify({ userId: 4 }));
        } else {
          res.statusCode = 401;
          res.end(JSON.stringify({ message: 'Incorrect email or password.' }));
        }
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
      } else if (req.url === '/api/products') {
        res.setHeader('content-type', 'application/json');
        res.end(
          JSON.stringify({
            products: [
              {
                id: 'database-product',
                name: 'Backend Product',
                category: 'Test category',
                price: 25,
                image: 'https://example.com/product.jpg',
                description: 'Loaded from the backend test server.',
                stock: 12,
              },
              ...[0, '7', undefined, null, '', ' ', 'invalid', -1, 1.5].map(
                (stock, index) => ({
                  id: `stock-${index}`,
                  name: `Stock fixture ${index}`,
                  category: ['Audio', 'Photography', 'Test category'][
                    index % 3
                  ],
                  price: 10,
                  image: 'https://example.com/product.jpg',
                  description: 'Stock test product.',
                  stock,
                }),
              ),
            ],
          }),
        );
      } else {
        res.statusCode = 500;
        res.end();
      }
    });
    const backendOrigin = await listen(backend);
    frontend = createServer(
      createApp(backendOrigin, { jwtSecret: TEST_JWT_SECRET }),
    );
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
  });

  describe('GET /login', () => {
    it('inherits the shared layout and preserves page-specific metadata and styles', async () => {
      const template = await readFile(
        new URL('../src/views/login.njk', import.meta.url),
        'utf8',
      );
      assert.match(template, /{% extends "layout\.njk" %}/);
      assert.doesNotMatch(template, /<head>|<footer|<!doctype/i);

      const html = await (await fetch(`${base}/login`)).text();
      for (const tag of ['head', 'header', 'main', 'footer']) {
        assert.equal(
          [...html.matchAll(new RegExp(`<${tag}[\\s>]`, 'g'))].length,
          1,
        );
      }
      assert.match(html, /<title>Log in \| Ctrl-Alt-Elite<\/title>/);
      assert.match(
        html,
        /name="description" content="Log in to your Ctrl-Alt-Elite account\."/,
      );
      assert.match(html, /href="\/assets\/styles\.css"/);
      assert.match(html, /href="\/assets\/login\.css"/);
      assert.match(html, /<body class="login-page">/);
      assert.match(html, /class="site-header"/);
      assert.match(html, /class="site-footer"/);
    });

    it('configures the Express view engine and views directory', () => {
      const app = createApp('http://127.0.0.1:3001');
      assert.equal(app.get('view engine'), 'njk');
      assert.equal(
        app.get('views'),
        new URL('../src/views/', import.meta.url).pathname,
      );
    });

    it('redirects to the unavailable page if rendering fails', async () => {
      const app = createApp('http://127.0.0.1:3001');
      vi.spyOn(app, 'render').mockImplementationOnce(
        (
          _name: string,
          optionsOrCallback?: object | ((error: Error, html: string) => void),
          callback?: (error: Error, html: string) => void,
        ) => {
          const onRendered =
            typeof optionsOrCallback === 'function'
              ? optionsOrCallback
              : callback;
          assert.ok(onRendered);
          onRendered(new Error('Template rendering failed'), '');
        },
      );
      const server = createServer(app);
      const origin = await listen(server);
      const errorLog = vi.spyOn(console, 'error').mockImplementation(() => {});
      try {
        const res = await fetch(`${origin}/login`, { redirect: 'manual' });
        assert.equal(res.status, 302);
        assert.equal(res.headers.get('location'), '/unavailable');
        assert.equal(errorLog.mock.calls.length, 1);
      } finally {
        errorLog.mockRestore();
        await close(server);
      }
    });

    it('renders a server-side form with an optional password visibility control', async () => {
      const res = await fetch(`${base}/login`, { redirect: 'manual' });
      assert.equal(res.status, 200);
      assert.match(res.headers.get('content-type') ?? '', /text\/html/);
      const html = await res.text();
      assert.match(html, /action="\/login" method="post"/);
      assert.match(html, new RegExp(`&copy; ${new Date().getFullYear()}`));
      assert.match(html, /id="password"[\s\S]*?type="password"/);
      const toggle = html.match(
        /<button\b[^>]*data-password-toggle[\s\S]*?<\/button>/,
      )?.[0];
      assert.ok(toggle);
      assert.match(toggle, /type="button"/);
      assert.match(toggle, /aria-controls="password"/);
      assert.match(toggle, /aria-label="Show password"/);
      assert.match(toggle, /title="Show password"/);
      assert.match(toggle, /\bhidden\s*>/);
      assert.match(toggle, /<svg\b[^>]*aria-hidden="true"/);
      assert.match(
        html,
        /<script src="\/controllers\/login\.js" defer><\/script>/,
      );
      assert.doesNotMatch(html, /{{|{%|Incorrect email or password/);
    });
  });

  describe('POST /login', () => {
    async function submit(email: string, password: string) {
      return fetch(`${base}/login`, {
        method: 'POST',
        headers: { origin: base },
        body: new URLSearchParams({ email, password }),
        redirect: 'manual',
      });
    }

    for (const status of [200, 401, 500, 302]) {
      it(`consumes the backend body for status ${status}`, async () => {
        const cancel = vi.fn();
        const upstream =
          status === 200
            ? new Response(JSON.stringify({ userId: 1, role: 'CUSTOMER' }), {
                status,
              })
            : new Response(new ReadableStream({ cancel }), { status });
        const originalFetch = globalThis.fetch;
        const fetchMock = vi
          .spyOn(globalThis, 'fetch')
          .mockResolvedValueOnce(upstream);
        const errorLog = vi
          .spyOn(console, 'error')
          .mockImplementation(() => {});
        try {
          const res = await originalFetch(`${base}/login`, {
            method: 'POST',
            headers: { origin: base },
            body: new URLSearchParams({
              email: 'user@example.com',
              password: 'password',
            }),
            redirect: 'manual',
          });
          const expectedStatus =
            status === 200 ? 303 : status === 401 ? 401 : 502;
          assert.equal(res.status, expectedStatus);
          assert.equal(cancel.mock.calls.length, status === 200 ? 0 : 1);
          assert.equal(upstream.bodyUsed, true);
          await res.text();
        } finally {
          fetchMock.mockRestore();
          errorLog.mockRestore();
        }
      });
    }

    it('renders an error for a successful response without a body', async () => {
      const originalFetch = globalThis.fetch;
      const fetchMock = vi
        .spyOn(globalThis, 'fetch')
        .mockResolvedValueOnce(new Response(null, { status: 200 }));
      const errorLog = vi.spyOn(console, 'error').mockImplementation(() => {});
      try {
        const res = await originalFetch(`${base}/login`, {
          method: 'POST',
          headers: { origin: base },
          body: new URLSearchParams({
            email: 'user@example.com',
            password: 'password',
          }),
          redirect: 'manual',
        });
        assert.equal(res.status, 403);
        assert.equal(res.headers.get('location'), null);
        assert.match(await res.text(), /role is not recognised/);
      } finally {
        fetchMock.mockRestore();
        errorLog.mockRestore();
      }
    });

    it('redirects admins to the admin dashboard', async () => {
      const res = await submit('admin@example.com', 'CorrectPassword@1');
      assert.equal(res.status, 303);
      assert.equal(res.headers.get('location'), '/admin');
      assert.equal(res.headers.get('cache-control'), 'no-store');
      const cookie =
        res.headers
          .getSetCookie()
          .find((value) => value.startsWith('auth_token=')) ?? '';
      assert.match(cookie, /^auth_token=admin\.jwt\.token;/);
      assert.match(cookie, /HttpOnly/i);
      assert.match(cookie, /SameSite=Lax/i);
      assert.ok(
        res.headers
          .getSetCookie()
          .some((value) => value.startsWith('ctrl_alt_elite_login=')),
      );
      await res.text();
    });

    it('clears an existing auth cookie when the backend returns no token', async () => {
      const res = await fetch(`${base}/login`, {
        method: 'POST',
        headers: { origin: base, cookie: 'auth_token=admin.jwt.token' },
        body: new URLSearchParams({
          email: 'user@example.com',
          password: 'CorrectPassword@1',
        }),
        redirect: 'manual',
      });
      const cookie =
        res.headers
          .getSetCookie()
          .find((value) => value.startsWith('auth_token=')) ?? '';
      assert.match(cookie, /^auth_token=;/);
      assert.match(cookie, /Expires=Thu, 01 Jan 1970/);
      await res.text();
    });

    it('sends the auth cookie to the backend as a bearer token via the proxy', async () => {
      const res = await fetch(`${base}/api/echo`, {
        headers: { cookie: 'other=1; auth_token=admin.jwt.token' },
      });
      assert.equal(
        ((await res.json()) as { auth: string }).auth,
        'Bearer admin.jwt.token',
      );
    });

    for (const email of ['unknownrole@example.com', 'norole@example.com']) {
      it(`shows an error and stays on login for an unknown role (${email})`, async () => {
        const errorLog = vi
          .spyOn(console, 'error')
          .mockImplementation(() => {});
        try {
          const res = await submit(email, 'password');
          assert.equal(res.status, 403);
          assert.equal(res.headers.get('location'), null);
          assert.match(
            await res.text(),
            /role="alert">Your account role is not recognised\./,
          );
        } finally {
          errorLog.mockRestore();
        }
      });
    }

    it('logs cancellation failures and renders the existing backend error', async () => {
      const cancellationError = new Error('Unable to cancel response');
      const upstream = new Response(
        new ReadableStream({
          cancel: () => Promise.reject(cancellationError),
        }),
        { status: 500 },
      );
      const originalFetch = globalThis.fetch;
      const fetchMock = vi
        .spyOn(globalThis, 'fetch')
        .mockResolvedValueOnce(upstream);
      const errorLog = vi.spyOn(console, 'error').mockImplementation(() => {});
      try {
        const res = await originalFetch(`${base}/login`, {
          method: 'POST',
          headers: { origin: base },
          body: new URLSearchParams({
            email: 'user@example.com',
            password: 'password',
          }),
          redirect: 'manual',
        });
        assert.equal(res.status, 502);
        assert.match(await res.text(), /Unable to reach the server\./);
        assert.deepEqual(errorLog.mock.calls, [
          ['Unable to reach the backend login API:', cancellationError],
        ]);
      } finally {
        fetchMock.mockRestore();
        errorLog.mockRestore();
      }
    });

    it('sends credentials from the frontend server to the backend and redirects', async () => {
      const res = await submit(' user@example.com ', 'CorrectPassword@1');
      assert.equal(res.status, 303);
      assert.equal(res.headers.get('location'), '/');
      assert.equal(res.headers.get('cache-control'), 'no-store');
      assert.deepEqual(loginRequests.at(-1), {
        method: 'POST',
        body: { email: 'user@example.com', password: 'CorrectPassword@1' },
        contentType: 'application/json',
      });
      assert.doesNotMatch(await res.text(), /user-1|CorrectPassword/);
    });

    for (const email of ['user@example.com', 'unknown@example.com']) {
      it(`renders an error for invalid credentials (${email})`, async () => {
        const res = await submit(email, 'WrongPassword@1');
        assert.equal(res.status, 401);
        assert.equal(res.headers.get('location'), null);
        const html = await res.text();
        assert.match(html, /role="alert">Incorrect email or password\./);
        assert.ok(html.includes(`value="${email}"`));
        assert.doesNotMatch(html, /WrongPassword@1/);
      });
    }

    it('escapes the email when re-rendering and never repopulates the password', async () => {
      const res = await submit(
        '"><script>alert(1)</script>',
        'WrongPassword@1',
      );
      const html = await res.text();
      assert.equal(res.status, 401);
      assert.doesNotMatch(html, /<script>|WrongPassword@1/);
      assert.match(html, /&lt;script&gt;/);
    });

    it('rejects empty or oversized credentials without calling the backend', async () => {
      const count = loginRequests.length;
      for (const [email, password] of [
        ['', 'password'],
        ['user@example.com', ''],
        ['a'.repeat(255), 'password'],
        ['user@example.com', 'a'.repeat(129)],
      ] as const) {
        const res = await submit(email, password);
        assert.equal(res.status, 400);
        assert.match(
          await res.text(),
          /Please enter your email and password\./,
        );
      }
      assert.equal(loginRequests.length, count);
    });

    it('rejects JSON rather than accepting a browser API submission', async () => {
      const count = loginRequests.length;
      const res = await fetch(`${base}/login`, {
        method: 'POST',
        headers: { origin: base, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'user@example.com',
          password: 'password',
        }),
      });
      assert.equal(res.status, 415);
      assert.equal(loginRequests.length, count);
      assert.match(await res.text(), /Please submit the login form\./);
    });

    it('rejects cross-origin login submissions without calling the backend', async () => {
      const count = loginRequests.length;
      const res = await fetch(`${base}/login`, {
        method: 'POST',
        headers: {
          origin: 'https://attacker.example',
          cookie: 'auth_token=admin.jwt.token',
        },
        body: new URLSearchParams({
          email: 'user@example.com',
          password: 'CorrectPassword@1',
        }),
        redirect: 'manual',
      });
      assert.equal(res.status, 403);
      assert.equal(loginRequests.length, count);
      assert.equal(res.headers.get('set-cookie'), null);
      await res.text();
    });

    it('renders a safe error when the backend fails', async () => {
      const errorLog = vi.spyOn(console, 'error').mockImplementation(() => {});
      try {
        const res = await submit('unavailable@example.com', 'password');
        assert.equal(res.status, 502);
        const html = await res.text();
        assert.match(html, /Unable to log in\. Please try again later\./);
        assert.doesNotMatch(html, /Private backend error/);
        assert.equal(errorLog.mock.calls.length, 1);
      } finally {
        errorLog.mockRestore();
      }
    });

    it('renders an error when the backend cannot be reached', async () => {
      const dead = createServer();
      const deadOrigin = await listen(dead);
      await close(dead);
      const app = createServer(createApp(deadOrigin));
      const origin = await listen(app);
      const errorLog = vi.spyOn(console, 'error').mockImplementation(() => {});
      try {
        const res = await fetch(`${origin}/login`, {
          method: 'POST',
          headers: { origin },
          body: new URLSearchParams({
            email: 'user@example.com',
            password: 'password',
          }),
          redirect: 'manual',
        });
        assert.equal(res.status, 502);
        assert.match(await res.text(), /Unable to reach the server\./);
        assert.equal(errorLog.mock.calls.length, 1);
      } finally {
        errorLog.mockRestore();
        await close(app);
      }
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

  describe('GET /products', () => {
    it('renders products returned by the backend API', async () => {
      const res = await fetch(`${base}/products`);
      assert.equal(res.status, 200);
      const html = await res.text();
      assert.match(html, /Backend Product/);
      assert.match(html, /Test category/);
      assert.doesNotMatch(html, /Studio Wireless Headphones/);
    });

    it('removes search while keeping the product count', async () => {
      const html = await (await fetch(`${base}/products`)).text();
      assert.doesNotMatch(
        html,
        /productSearch|search-field|data-search|noSearchResults/,
      );
      assert.match(html, /10 products/);
    });

    it('renders one category toggle per backend category and tags product cards', async () => {
      const html = await (await fetch(`${base}/products`)).text();
      const filters = [...html.matchAll(/data-category-filter="([^"]+)"/g)].map(
        (match) => match[1],
      );
      assert.deepEqual(filters, ['Test category', 'Audio', 'Photography']);
      assert.equal((html.match(/aria-pressed="false"/g) ?? []).length, 3);
      assert.equal(
        (html.match(/data-product-card data-category=/g) ?? []).length,
        10,
      );
    });

    it('shows stock quantities and disables unavailable products', async () => {
      const html = await (await fetch(`${base}/products`)).text();
      const cards = [
        ...html.matchAll(/<article\b[^>]*>([\s\S]*?)<\/article>/g),
      ].map((match) => match[1] as string);
      assert.equal(cards.length, 10);
      for (const [index, card] of cards.entries()) {
        const button = card.match(
          /<button\b[^>]*data-add-to-basket[^>]*>/,
        )?.[0];
        assert.ok(button);
        if (index === 0 || index === 2) {
          assert.match(card, index === 0 ? /12 in stock/ : /7 in stock/);
          assert.doesNotMatch(button, /\bdisabled\b/);
        } else {
          assert.match(
            card,
            index === 1 ? /Out of stock/ : /Stock unavailable/,
          );
          assert.match(button, /\bdisabled\b/);
        }
      }
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
      ['/assets/login.css', /text\/css/],
      ['/controllers/login.js', /javascript/],
      ['/controllers/script.js', /javascript/],
      ['/assets/register.css', /text\/css/],
      ['/controllers/register.js', /javascript/],
      ['/assets/admin.css', /text\/css/],
      ['/controllers/adminDashboard.js', /javascript/],
      ['/controllers/adminCustomers.js', /javascript/],
      ['/controllers/adminCustomerDetail.js', /javascript/],
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
    for (const page of [
      '/',
      '/login',
      '/register',
      '/unavailable',
      '/admin',
      '/admin/customers',
      '/admin/customers/abc-123',
    ]) {
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
