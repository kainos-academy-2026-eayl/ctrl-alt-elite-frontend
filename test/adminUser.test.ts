import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, it } from 'vitest';
import { createApp } from '../src/app';
import { loadAdminFirstName } from '../src/util/adminUser';

function tokenFor(sub: string): string {
  const encode = (value: object) =>
    Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${encode({ alg: 'HS256' })}.${encode({ sub })}.signature`;
}

describe('admin first name', () => {
  let backend: Server;
  let frontend: Server;
  let backendOrigin: string;
  let frontendOrigin: string;

  function listen(server: Server): Promise<string> {
    return new Promise((resolve) => {
      server.listen(0, '127.0.0.1', () => {
        resolve(`http://127.0.0.1:${(server.address() as AddressInfo).port}`);
      });
    });
  }

  beforeAll(async () => {
    backend = createServer((req, res) => {
      const bearer = req.headers.authorization === `Bearer ${tokenFor('u-1')}`;
      if (req.url === '/api/admin/customers?pageSize=1') {
        res.statusCode = bearer ? 200 : 401;
        res.end('{}');
      } else if (req.url === '/api/admin/customers/u-1' && bearer) {
        res.end(JSON.stringify({ customer: { id: 'u-1', firstName: 'Ada' } }));
      } else {
        res.statusCode = 404;
        res.end('{}');
      }
    });
    backendOrigin = await listen(backend);
    frontend = createServer(createApp(backendOrigin));
    frontendOrigin = await listen(frontend);
  });

  afterAll(() => {
    backend.close();
    frontend.close();
  });

  it('returns the first name for the token subject', async () => {
    assert.equal(
      await loadAdminFirstName(backendOrigin, tokenFor('u-1')),
      'Ada',
    );
  });

  it('returns null for missing, malformed or unknown tokens', async () => {
    assert.equal(await loadAdminFirstName(backendOrigin, null), null);
    assert.equal(await loadAdminFirstName(backendOrigin, 'garbage'), null);
    assert.equal(
      await loadAdminFirstName(backendOrigin, tokenFor('missing')),
      null,
    );
  });

  it('greets the admin by first name on the dashboard', async () => {
    const res = await fetch(`${frontendOrigin}/admin`, {
      headers: { cookie: `auth_token=${tokenFor('u-1')}` },
    });
    assert.match(await res.text(), /<h1>Welcome, Ada<\/h1>/);
  });
});
