import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createServer, type IncomingMessage, type Server } from 'node:http';
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

async function readBody(req: IncomingMessage): Promise<string> {
  let body = '';
  for await (const chunk of req) body += chunk;
  return body;
}

describe('frontend routes', () => {
  let backend: Server;
  let frontend: Server;
  let base: string;

  beforeAll(async () => {
    backend = createServer(async (req, res) => {
      if (req.url === '/api/echo') {
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
    it('renders the login template without changing its markup', async () => {
      const res = await fetch(`${base}/login`, { redirect: 'manual' });
      assert.equal(res.status, 200);
      assert.match(res.headers.get('content-type') ?? '', /text\/html/);
      const template = await readFile(
        new URL('../src/views/Login.njk', import.meta.url),
        'utf8',
      );
      assert.equal(await res.text(), template);
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
      ['/controllers/Login.js', /javascript/],
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
