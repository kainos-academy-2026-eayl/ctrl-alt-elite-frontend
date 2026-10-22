import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createServer, type IncomingMessage, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, it, vi } from 'vitest';
import { createApp } from '../src/app';
import type { CustomerSource } from '../src/util/customers';
import {
  createInMemoryCustomerSource,
  FIXTURE_CUSTOMERS,
} from './customerFixtures';

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
          res.end(JSON.stringify({ user: { id: 'user-1' } }));
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
      } else {
        res.statusCode = 500;
        res.end();
      }
    });
    const backendOrigin = await listen(backend);
    frontend = createServer(
      createApp(backendOrigin, {
        customerSource: createInMemoryCustomerSource(),
      }),
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
        body: new URLSearchParams({ email, password }),
        redirect: 'manual',
      });
    }

    for (const status of [200, 401, 500, 302]) {
      it(`cancels the unused backend body for status ${status}`, async () => {
        const cancel = vi.fn();
        const upstream = new Response(new ReadableStream({ cancel }), {
          status,
        });
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
            body: new URLSearchParams({
              email: 'user@example.com',
              password: 'password',
            }),
            redirect: 'manual',
          });
          const expectedStatus =
            status === 200 ? 303 : status === 401 ? 401 : 502;
          assert.equal(res.status, expectedStatus);
          assert.equal(cancel.mock.calls.length, 1);
          assert.equal(upstream.bodyUsed, true);
          await res.text();
        } finally {
          fetchMock.mockRestore();
          errorLog.mockRestore();
        }
      });
    }

    it('handles a backend response without a body', async () => {
      const originalFetch = globalThis.fetch;
      const fetchMock = vi
        .spyOn(globalThis, 'fetch')
        .mockResolvedValueOnce(new Response(null, { status: 200 }));
      try {
        const res = await originalFetch(`${base}/login`, {
          method: 'POST',
          body: new URLSearchParams({
            email: 'user@example.com',
            password: 'password',
          }),
          redirect: 'manual',
        });
        assert.equal(res.status, 303);
        assert.equal(res.headers.get('location'), '/');
        await res.text();
      } finally {
        fetchMock.mockRestore();
      }
    });

    it('logs cancellation failures and renders the existing backend error', async () => {
      const cancellationError = new Error('Unable to cancel response');
      const upstream = new Response(
        new ReadableStream({
          cancel: () => Promise.reject(cancellationError),
        }),
      );
      const originalFetch = globalThis.fetch;
      const fetchMock = vi
        .spyOn(globalThis, 'fetch')
        .mockResolvedValueOnce(upstream);
      const errorLog = vi.spyOn(console, 'error').mockImplementation(() => {});
      try {
        const res = await originalFetch(`${base}/login`, {
          method: 'POST',
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
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'user@example.com',
          password: 'password',
        }),
      });
      assert.equal(res.status, 415);
      assert.equal(loginRequests.length, count);
      assert.match(await res.text(), /Please submit the login form\./);
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

  describe('GET /admin', () => {
    it('serves the dashboard with navigation and placeholder sections', async () => {
      const res = await fetch(`${base}/admin`);
      assert.equal(res.status, 200);
      assert.match(res.headers.get('content-type') ?? '', /text\/html/);
      const html = await res.text();
      for (const text of [
        'Dashboard',
        'Products',
        'Orders',
        'Customers',
        'Inventory',
        'Reports',
        'Settings',
        'Stock Alerts',
        'Quick Actions',
        'Add Product',
        'View Orders',
        'Manage Customers',
        'Inventory Management',
        'Notifications',
        'Recent Activity',
        'System Status',
        'Database Connection',
        'Backend Service',
        'API Status',
        'Email Service',
      ]) {
        assert.ok(html.includes(text), `missing "${text}"`);
      }
      assert.match(html, /name="viewport"/);
    });

    it('links back to the homepage', async () => {
      const html = await (await fetch(`${base}/admin`)).text();
      assert.match(html, /<a[^>]*href="\/"[^>]*>[^<]*Back to homepage/);
    });

    it('reflects customer data from the customer source', async () => {
      const html = await (await fetch(`${base}/admin`)).text();
      const customersCard = html.match(
        /admin-summary-label">Customers<\/span>\s*<span class="admin-summary-value">(\d+)</,
      );
      assert.equal(customersCard?.[1], String(FIXTURE_CUSTOMERS.length));
      const activity = html.slice(html.indexOf('Recent Activity'));
      assert.match(activity, /Aoife Devlin<\/a> registered/);
      assert.match(activity, /href="\/admin\/customers\/c-27"/);
      assert.match(html, /Connected/);
    });

    it('falls back to static placeholders when the backend is unreachable', async () => {
      const dead = createServer();
      const deadOrigin = await listen(dead);
      await close(dead);
      const app = createServer(createApp(deadOrigin));
      const origin = await listen(app);
      const originalError = console.error;
      console.error = () => {};
      try {
        const res = await fetch(`${origin}/admin`);
        assert.equal(res.status, 200);
        const html = await res.text();
        assert.match(
          html,
          /admin-summary-label">Customers<\/span>\s*<span class="admin-summary-value">0</,
        );
        assert.ok(html.includes('No active notifications'));
        assert.ok(html.includes('No recent activity available'));
        assert.ok(html.includes('Status unavailable'));
        assert.doesNotMatch(html, /Connected/);
      } finally {
        console.error = originalError;
        await close(app);
      }
    });

    for (const section of ['orders', 'inventory', 'reports', 'settings']) {
      it(`serves a placeholder page for /admin/${section}`, async () => {
        const res = await fetch(`${base}/admin/${section}`);
        assert.equal(res.status, 200);
        assert.match(await res.text(), /Coming soon/);
      });
    }

    it('has no Products navigation entry', async () => {
      const html = await (await fetch(`${base}/admin`)).text();
      assert.doesNotMatch(html, /href="\/admin\/products"/);
      const res = await fetch(`${base}/admin/products`);
      assert.equal(res.status, 404);
    });

    it('returns 404 for unknown admin sections', async () => {
      const res = await fetch(`${base}/admin/unknown`);
      assert.equal(res.status, 404);
    });
  });

  describe('admin customers', () => {
    async function get(path: string, origin = base) {
      const res = await fetch(`${origin}${path}`);
      return { status: res.status, html: await res.text() };
    }

    function names(html: string): string[] {
      return [
        ...html.matchAll(/<a href="\/admin\/customers\/[\w-]+">([^<]+)<\/a>/g),
      ].map((match) => match[1] as string);
    }

    async function withSource(
      source: CustomerSource,
      run: (origin: string) => Promise<void>,
    ) {
      const app = createServer(
        createApp('http://127.0.0.1:1', { customerSource: source }),
      );
      const origin = await listen(app);
      try {
        await run(origin);
      } finally {
        await close(app);
      }
    }

    it('lists customers with columns, total count and first page only', async () => {
      const { status, html } = await get('/admin/customers');
      assert.equal(status, 200);
      for (const text of [
        'Customer Name',
        'Email Address',
        'Registration Date',
      ]) {
        assert.ok(html.includes(text), `missing "${text}"`);
      }
      assert.match(
        html,
        new RegExp(`Total Customers: ${FIXTURE_CUSTOMERS.length}`),
      );
      assert.equal(names(html).length, 10);
      assert.match(html, /Previous/);
      assert.match(html, /aria-label="Page 3"/);
      assert.match(html, /Next/);
    });

    it('marks Customers as the active navigation item', async () => {
      const { html } = await get('/admin/customers');
      assert.match(html, /is-active"\s+href="\/admin\/customers"/);
    });

    it('searches by name, case-insensitively, across first and last name', async () => {
      const byFirst = await get('/admin/customers?q=AMELIA');
      assert.deepEqual(names(byFirst.html), ['Amelia Hart']);
      const byBoth = await get('/admin/customers?q=okafor%20ben');
      assert.deepEqual(names(byBoth.html), ['Ben Okafor']);
    });

    it('searches by email', async () => {
      const { html } = await get('/admin/customers?email=BEN.okafor@');
      assert.deepEqual(names(html), ['Ben Okafor']);
      assert.match(html, /1 matching customer/);
      assert.match(html, /Total Customers: 27/);
    });

    it('combines name and email filters', async () => {
      const match = await get('/admin/customers?q=ben&email=okafor');
      assert.deepEqual(names(match.html), ['Ben Okafor']);
      const none = await get('/admin/customers?q=amelia&email=okafor');
      assert.equal(names(none.html).length, 0);
      assert.match(none.html, /No customers found/);
    });

    it('shows a no results message when nothing matches', async () => {
      const { status, html } = await get('/admin/customers?q=zzzznobody');
      assert.equal(status, 200);
      assert.match(html, /No customers found/);
      assert.equal(names(html).length, 0);
    });

    it('escapes the search term', async () => {
      const { html } = await get(
        '/admin/customers?q=%3Cscript%3Ealert(1)%3C/script%3E',
      );
      assert.doesNotMatch(html, /<script>alert/);
    });

    it('sorts by name and registration date', async () => {
      const asc = names((await get('/admin/customers?sort=nameAsc')).html);
      assert.equal(asc[0], 'Amelia Hart');
      const desc = names((await get('/admin/customers?sort=nameDesc')).html);
      assert.equal(desc[0], 'Zoe Hamilton');
      const newest = names((await get('/admin/customers?sort=newest')).html);
      assert.equal(newest[0], 'Aoife Devlin');
      const oldest = names((await get('/admin/customers?sort=oldest')).html);
      assert.equal(oldest[0], 'Amelia Hart');
    });

    it('falls back to the default sort for unknown values', async () => {
      const { status, html } = await get('/admin/customers?sort=bogus');
      assert.equal(status, 200);
      assert.equal(names(html)[0], 'Amelia Hart');
    });

    it('paginates and preserves search and sort in page links', async () => {
      const page3 = await get('/admin/customers?page=3&sort=newest');
      assert.equal(names(page3.html).length, 7);
      assert.match(
        page3.html,
        /href="\/admin\/customers\?sort=newest&amp;page=2" rel="prev"/,
      );
      assert.doesNotMatch(page3.html, /rel="next"/);
    });

    it('clamps out of range and invalid page numbers', async () => {
      assert.equal(
        names((await get('/admin/customers?page=99')).html).length,
        7,
      );
      assert.equal(
        names((await get('/admin/customers?page=abc')).html).length,
        10,
      );
    });

    it('shows customer details', async () => {
      const { status, html } = await get('/admin/customers/c-1');
      assert.equal(status, 200);
      assert.match(html, /Amelia Hart/);
      assert.match(html, /amelia\.hart@example\.com/);
      assert.match(html, /8 Jan 2026/);
      assert.match(html, /Registration Date/);
    });

    it('returns 404 for unknown or malformed customer ids', async () => {
      assert.equal((await get('/admin/customers/c-9999')).status, 404);
      const bad = await get('/admin/customers/bad%20id');
      assert.equal(bad.status, 404);
      assert.match(bad.html, /Customer not found/);
    });

    it('shows the empty state when there are no customers', async () => {
      await withSource(createInMemoryCustomerSource([]), async (origin) => {
        const { status, html } = await get('/admin/customers', origin);
        assert.equal(status, 200);
        assert.match(html, /No customers found/);
        assert.match(html, /Customers will appear here once they register\./);
        assert.match(html, /Total Customers: 0/);
      });
    });

    it('shows the error state when the backend is unreachable', async () => {
      const app = createServer(createApp('http://127.0.0.1:1'));
      const origin = await listen(app);
      const originalError = console.error;
      console.error = () => {};
      try {
        const { status, html } = await get('/admin/customers', origin);
        assert.equal(status, 503);
        assert.match(html, /Unable to load customers/);
      } finally {
        console.error = originalError;
        await close(app);
      }
    });

    it('shows an error state when customer data cannot be loaded', async () => {
      const failing: CustomerSource = {
        query: async () => {
          throw new Error('boom');
        },
        findById: async () => {
          throw new Error('boom');
        },
      };
      const originalError = console.error;
      console.error = () => {};
      try {
        await withSource(failing, async (origin) => {
          const list = await get('/admin/customers', origin);
          assert.equal(list.status, 503);
          assert.match(list.html, /Unable to load customers/);
          assert.match(list.html, /Admin navigation/);
          const detail = await get('/admin/customers/c-1', origin);
          assert.equal(detail.status, 503);
          assert.match(detail.html, /Unable to load customer/);
        });
      } finally {
        console.error = originalError;
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
    for (const page of ['/', '/login', '/register', '/unavailable', '/admin']) {
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
