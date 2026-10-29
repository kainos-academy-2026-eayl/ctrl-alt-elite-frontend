import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, it, vi } from 'vitest';
import { createApp } from '../src/app';
import { SAMPLE_PRODUCTS } from '../src/data/sampleProducts';

const TEST_JWT_SECRET = 'test-only-profile-secret-with-at-least-32-bytes';

/** In-memory stand-in for the backend basket API (/api/baskets). */
const fakeBaskets = new Map<string, Map<string, number>>();

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.statusCode = status;
  res.setHeader('content-type', 'application/json');
  res.end(JSON.stringify(body));
}

function basketBody(id: string, quantities: Map<string, number>) {
  const items = [...quantities].map(([productId, quantity]) => {
    const product = SAMPLE_PRODUCTS.find((p) => p.id === productId);
    const unitPricePence = Math.round(Number(product?.price) * 100);
    return {
      id: productId,
      name: product?.name ?? productId,
      unitPricePence,
      quantity,
      lineTotalPence: unitPricePence * quantity,
    };
  });
  return {
    id,
    items,
    itemCount: items.reduce((sum, item) => sum + item.quantity, 0),
    totalPence: items.reduce((sum, item) => sum + item.lineTotalPence, 0),
    maxQuantity: 99,
  };
}

async function handleFakeBasketApi(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const [, , , basketId, , productId] = (req.url ?? '').split('/');
  if (req.method === 'POST' && basketId === undefined) {
    const id = randomUUID();
    fakeBaskets.set(id, new Map());
    sendJson(res, 201, basketBody(id, new Map()));
    return;
  }
  const quantities = fakeBaskets.get(basketId ?? '');
  if (!basketId || !quantities) {
    sendJson(res, 404, { message: 'Basket not found.' });
    return;
  }
  if (req.method === 'POST') {
    const { productId: added } = JSON.parse(await readBody(req));
    if (!SAMPLE_PRODUCTS.some((product) => product.id === added)) {
      sendJson(res, 400, { message: 'That product is not available.' });
      return;
    }
    quantities.set(added, (quantities.get(added) ?? 0) + 1);
  } else if (req.method === 'PATCH' && productId) {
    const { change } = JSON.parse(await readBody(req));
    const id = decodeURIComponent(productId);
    quantities.set(id, (quantities.get(id) ?? 0) + change);
  } else if (req.method === 'DELETE' && productId) {
    quantities.delete(decodeURIComponent(productId));
    res.statusCode = 204;
    res.end();
    return;
  }
  sendJson(res, 200, basketBody(basketId, quantities));
}

/** Keeps the cookies a browser would send back, like a tiny cookie jar. */
function updateCookies(cookies: string, res: Response): string {
  const jar = new Map(
    cookies
      .split('; ')
      .filter(Boolean)
      .map((pair) => [pair.slice(0, pair.indexOf('=')), pair] as const),
  );
  for (const setCookie of res.headers.getSetCookie()) {
    const pair = setCookie.split(';')[0] ?? '';
    const name = pair.slice(0, pair.indexOf('='));
    if (pair.endsWith('=')) jar.delete(name);
    else jar.set(name, pair);
  }
  return [...jar.values()].join('; ');
}

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
      } else if (req.url?.startsWith('/api/baskets')) {
        await handleFakeBasketApi(req, res);
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

    it('renders an Add to Basket form for each product without JavaScript', async () => {
      const html = await (await fetch(`${base}/`)).text();
      const forms = html.match(
        /<form action="\/basket\/items" method="post">/g,
      );
      assert.equal(forms?.length, SAMPLE_PRODUCTS.length);
      assert.match(
        html,
        new RegExp(
          `<input type="hidden" name="productId" value="${SAMPLE_PRODUCTS[0]?.id}" />`,
        ),
      );
      assert.doesNotMatch(html, /basket\.js/);
      assert.match(
        html,
        /<span class="basket-badge" aria-hidden="true">0<\/span>/,
      );
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

  describe('basket (server-rendered, no JavaScript)', () => {
    const product = SAMPLE_PRODUCTS[0] as (typeof SAMPLE_PRODUCTS)[number];
    const productPath = `/basket/items/${encodeURIComponent(product.id)}`;

    function post(
      path: string,
      cookies: string,
      form: Record<string, string> = {},
    ) {
      return fetch(`${base}${path}`, {
        method: 'POST',
        redirect: 'manual',
        headers: {
          origin: base,
          cookie: cookies,
          'content-type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams(form),
      });
    }

    async function getBasketPage(cookies: string, path = '/basket') {
      const res = await fetch(`${base}${path}`, {
        headers: { cookie: cookies },
      });
      return { res, html: await res.text() };
    }

    it('renders an empty basket page with no scripts', async () => {
      const { res, html } = await getBasketPage('');
      assert.equal(res.status, 200);
      assert.match(res.headers.get('content-type') ?? '', /text\/html/);
      assert.match(
        html,
        /<h1 id="basket-heading" tabindex="-1">Your basket<\/h1>/,
      );
      assert.match(html, /Your basket is empty\./);
      assert.doesNotMatch(html, /<script/);
    });

    it('adds, updates and removes items with form posts and redirects', async () => {
      let cookies = '';

      const added = await post('/basket/items', cookies, {
        productId: product.id,
      });
      assert.equal(added.status, 303);
      assert.equal(added.headers.get('location'), '/basket');
      cookies = updateCookies(cookies, added);
      assert.match(cookies, /basket_id=/);

      let page = await getBasketPage(cookies);
      cookies = updateCookies(cookies, page.res);
      assert.match(
        page.html,
        new RegExp(`${product.name} added to your basket`),
      );
      assert.match(page.html, /<span class="basket-quantity__value">1<\/span>/);

      const increased = await post(productPath, cookies, { change: '1' });
      assert.equal(increased.status, 303);
      assert.equal(
        increased.headers.get('location'),
        `/basket?focus=${encodeURIComponent(`${product.id}:increase`)}`,
      );
      page = await getBasketPage(
        cookies,
        increased.headers.get('location') ?? '/basket',
      );
      assert.match(page.html, /<span class="basket-quantity__value">2<\/span>/);
      assert.match(
        page.html,
        /aria-label="Increase quantity of Swaggy Jeans" autofocus/,
      );
      assert.match(page.html, /Total \(2 items\)/);

      const home = await (
        await fetch(`${base}/`, { headers: { cookie: cookies } })
      ).text();
      assert.match(
        home,
        /<span class="basket-badge" aria-hidden="true">2<\/span>/,
      );

      const checkout = await post('/basket/checkout', cookies);
      assert.equal(checkout.status, 303);
      assert.equal(checkout.headers.get('location'), '/checkout');
      const checkoutPage = await fetch(`${base}/checkout`, {
        headers: { cookie: cookies },
      });
      const checkoutHtml = await checkoutPage.text();
      assert.equal(checkoutPage.status, 200);
      assert.match(checkoutHtml, /<h1 id="checkout-heading">Checkout<\/h1>/);
      assert.match(checkoutHtml, new RegExp(product.name));
      assert.match(checkoutHtml, /Total \(2 items\)/);
      assert.doesNotMatch(checkoutHtml, /<script/);

      const removed = await post(`${productPath}/remove`, cookies);
      assert.equal(removed.status, 303);
      cookies = updateCookies(cookies, removed);
      page = await getBasketPage(
        cookies,
        removed.headers.get('location') ?? '/basket',
      );
      assert.match(
        page.html,
        new RegExp(`${product.name} removed from your basket`),
      );
      assert.match(page.html, /Your basket is empty\./);
      assert.match(
        page.html,
        /<h1 id="basket-heading" tabindex="-1" autofocus>/,
      );
    });

    it('does not open checkout for an empty basket', async () => {
      const added = await post('/basket/items', '', { productId: product.id });
      const cookies = updateCookies('', added);
      const removed = await post(`${productPath}/remove`, cookies);
      assert.equal(removed.status, 303);
      const checkout = await post('/basket/checkout', cookies);
      assert.equal(checkout.status, 303);
      assert.equal(checkout.headers.get('location'), '/basket');
      const { html } = await getBasketPage(updateCookies(cookies, checkout));
      assert.match(html, /Your basket is empty\./);
    });

    it('shows the backend message when a product cannot be added', async () => {
      const res = await post('/basket/items', '', {
        productId: 'not-a-product',
      });
      assert.equal(res.status, 303);
      const { html } = await getBasketPage(updateCookies('', res));
      assert.match(html, /That product is not available\./);
    });

    it('starts again when the saved basket no longer exists', async () => {
      const { res, html } = await getBasketPage(`basket_id=${randomUUID()}`);
      assert.match(html, /We could not find your previous basket/);
      assert.match(res.headers.getSetCookie().join(), /basket_id=;/);
    });

    it('rejects form posts from other sites', async () => {
      const res = await fetch(`${base}/basket/items`, {
        method: 'POST',
        headers: {
          origin: 'https://evil.example',
          'content-type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({ productId: product.id }),
      });
      assert.equal(res.status, 403);
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
      ['/assets/basket.css', /text\/css/],
      ['/assets/admin.css', /text\/css/],
      ['/controllers/adminDashboard.js', /javascript/],
      ['/controllers/adminCustomers.js', /javascript/],
      ['/controllers/adminCustomerDetail.js', /javascript/],
      ['/assets/support.css', /text\/css/],
      ['/controllers/support.js', /javascript/],
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
      '/basket',
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
          // Protected pages redirect to the login page when logged out.
          const resolves =
            res.status === 200 ||
            res.status === 503 ||
            (res.status === 303 && res.headers.get('location') === '/login');
          assert.ok(
            resolves,
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
