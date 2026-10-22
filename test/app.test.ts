import assert from 'node:assert/strict';
import { createServer, type IncomingMessage, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, it, vi } from 'vitest';
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
  });

  describe('GET /login', () => {
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
        (_name, _options, callback) => {
          callback?.(new Error('Template rendering failed'));
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

    it('renders a server-side form without a browser login script', async () => {
      const res = await fetch(`${base}/login`, { redirect: 'manual' });
      assert.equal(res.status, 200);
      assert.match(res.headers.get('content-type') ?? '', /text\/html/);
      const html = await res.text();
      assert.match(html, /action="\/login" method="post"/);
      assert.match(html, new RegExp(`&copy; ${new Date().getFullYear()}`));
      assert.doesNotMatch(html, /<script|{{|{%|Incorrect email or password/);
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
      ['/assets/Login.css', /text\/css/],
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
    for (const page of ['/', '/login', '/register', '/unavailable']) {
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
