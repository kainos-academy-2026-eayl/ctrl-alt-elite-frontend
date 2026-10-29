import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { fileURLToPath } from 'node:url';
import express from 'express';
import nunjucks from 'nunjucks';
import { describe, it, vi } from 'vitest';
import { createApp } from '../src/app';
import { errorHandler } from '../src/middleware/errorHandler';
import { buildErrorPage } from '../src/views/error.page';

const VIEWS_DIRECTORY = fileURLToPath(
  new URL('../src/views/', import.meta.url),
);

async function withServer(
  app: express.Express,
  run: (origin: string) => Promise<void>,
): Promise<void> {
  const server: Server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  const errorLog = vi.spyOn(console, 'error').mockImplementation(() => {});
  try {
    await run(`http://127.0.0.1:${port}`);
  } finally {
    errorLog.mockRestore();
    await new Promise((resolve) => server.close(resolve));
  }
}

describe('buildErrorPage', () => {
  it('uses a general message by default', () => {
    const page = buildErrorPage(500, new Date('2026-10-29T12:00:00Z'));
    assert.deepEqual(page, {
      status: 500,
      title: 'Something went wrong',
      message:
        'Sorry, we could not load this page. Please try again in a little while.',
      currentYear: 2026,
    });
  });

  it('explains a 503 as temporarily unavailable', () => {
    assert.equal(buildErrorPage(503).title, 'Service temporarily unavailable');
  });
});

describe('error page', () => {
  it('shows the error template when the support page cannot be rendered', async () => {
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
    await withServer(app, async (origin) => {
      const res = await fetch(`${origin}/account/support`, {
        redirect: 'manual',
        headers: { cookie: 'auth_token=test' },
      });
      assert.equal(res.status, 500);
      assert.match(res.headers.get('content-type') ?? '', /text\/html/);
      const html = await res.text();
      assert.match(html, /<h1 id="error-heading">Something went wrong<\/h1>/);
      assert.doesNotMatch(html, /Template rendering failed/);
    });
  });

  it('shows the error template for any unexpected route error, without details', async () => {
    const app = express();
    nunjucks.configure(VIEWS_DIRECTORY, { autoescape: true, express: app });
    app.set('view engine', 'njk');
    app.get('/boom', () => {
      throw new Error('Secret internal detail');
    });
    app.use(errorHandler);

    await withServer(app, async (origin) => {
      const res = await fetch(`${origin}/boom`);
      assert.equal(res.status, 500);
      const html = await res.text();
      assert.match(html, /<p class="eyebrow">Error 500<\/p>/);
      assert.doesNotMatch(html, /Secret internal detail/);
    });
  });
});
