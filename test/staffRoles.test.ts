import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { SignJWT } from 'jose';
import { afterAll, beforeAll, describe, it, vi } from 'vitest';
import { createApp } from '../src/app';
import { navItemsForRole } from '../src/util/adminPortal';
import {
  findStaffRole,
  landingPathForRole,
  normaliseRole,
  STAFF_ROLES,
} from '../src/util/staffRoles';

const SECRET = 'test-only-staff-role-secret-with-at-least-32-bytes';

const BACKEND_USERS: Record<string, { email: string; role: string }> = {
  'admin-token': { email: 'admin@example.com', role: 'ADMIN' },
  'cs-token': { email: 'cs@example.com', role: 'Customer Service' },
  'finance-token': { email: 'finance@example.com', role: 'FINANCE' },
};

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

describe('staff role definitions', () => {
  it('normalises role names from the backend', () => {
    assert.equal(normaliseRole(' customer service '), 'CUSTOMER_SERVICE');
    assert.equal(normaliseRole('Customer-Service'), 'CUSTOMER_SERVICE');
    assert.equal(normaliseRole('admin'), 'ADMIN');
    assert.equal(normaliseRole(''), undefined);
    assert.equal(normaliseRole(undefined), undefined);
  });

  it('maps roles to their landing page and ignores unknown or inherited names', () => {
    assert.equal(landingPathForRole('ADMIN'), '/admin');
    assert.equal(
      landingPathForRole('CUSTOMER_SERVICE'),
      '/admin/customer-service',
    );
    assert.equal(landingPathForRole('CUSTOMER'), '/');
    assert.equal(landingPathForRole('SUPERUSER'), undefined);
    assert.equal(landingPathForRole('constructor'), undefined);
    assert.equal(findStaffRole('__proto__'), undefined);
  });

  it('limits Customer Service navigation to its own sections', () => {
    const role = STAFF_ROLES.CUSTOMER_SERVICE;
    assert.ok(role);
    assert.deepEqual(
      navItemsForRole(role).map((item) => [item.label, item.href]),
      [
        ['Dashboard', '/admin/customer-service'],
        ['Orders', '/admin/orders'],
        ['Customers', '/admin/customers'],
        ['Support Tickets', '/admin/support'],
        ['Settings', '/admin/settings'],
      ],
    );
  });
});

describe('role-based staff dashboards', () => {
  let backend: Server;
  let frontend: Server;
  let base: string;

  beforeAll(async () => {
    backend = createServer((req, res) => {
      res.setHeader('content-type', 'application/json');
      if (req.url === '/api/auth/login') {
        let body = '';
        req.on('data', (chunk) => {
          body += chunk;
        });
        req.on('end', () => {
          const { email } = JSON.parse(body);
          const entry = Object.entries(BACKEND_USERS).find(
            ([, user]) => user.email === email,
          );
          if (!entry) {
            res.statusCode = 401;
            res.end('{}');
            return;
          }
          res.end(
            JSON.stringify({
              userId: email,
              email,
              firstName: 'Casey',
              lastName: 'Service',
              role: entry[1].role,
              token: entry[0],
            }),
          );
        });
        return;
      }
      const token = req.headers.authorization?.split(' ')[1] ?? '';
      const user = BACKEND_USERS[token];
      if (!user) {
        res.statusCode = 401;
        res.end('{}');
      } else if (req.url === '/api/admin/profile') {
        res.end(
          JSON.stringify({
            name: 'Casey Service',
            email: user.email,
            role: user.role,
          }),
        );
      } else if (req.url === '/api/admin/customers?pageSize=1') {
        res.end('{}');
      } else {
        res.statusCode = 404;
        res.end('{}');
      }
    });
    frontend = createServer(
      createApp(await listen(backend), { jwtSecret: SECRET }),
    );
    base = await listen(frontend);
  });

  afterAll(async () => {
    await close(frontend);
    await close(backend);
  });

  function get(path: string, cookie: string) {
    return fetch(`${base}${path}`, { headers: { cookie }, redirect: 'manual' });
  }

  async function login(email: string) {
    const res = await fetch(`${base}/login`, {
      method: 'POST',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        origin: base,
      },
      body: new URLSearchParams({ email, password: 'CorrectPassword@1' }),
      redirect: 'manual',
    });
    const cookies = res.headers
      .getSetCookie()
      .map((cookie) => cookie.split(';')[0])
      .join('; ');
    return { res, cookies };
  }

  describe('login routing', () => {
    it('sends Customer Service staff to their own dashboard', async () => {
      const { res } = await login('cs@example.com');
      assert.equal(res.status, 303);
      assert.equal(res.headers.get('location'), '/admin/customer-service');
    });

    it('still sends admins to the admin dashboard', async () => {
      const { res } = await login('admin@example.com');
      assert.equal(res.headers.get('location'), '/admin');
    });

    it('rejects staff roles that have no dashboard yet', async () => {
      const errorLog = vi.spyOn(console, 'error').mockImplementation(() => {});
      try {
        const { res } = await login('finance@example.com');
        assert.equal(res.status, 403);
      } finally {
        errorLog.mockRestore();
      }
    });
  });

  describe('Customer Service dashboard', () => {
    const cs = 'auth_token=cs-token';

    it('shows Customers, Orders, Support Tickets and Settings', async () => {
      const res = await get('/admin/customer-service', cs);
      assert.equal(res.status, 200);
      const html = await res.text();
      assert.match(html, /<h1>Welcome, Casey<\/h1>/);
      assert.match(html, /admin-profile-role">Customer Service</);
      for (const label of [
        'Customers',
        'Orders',
        'Support Tickets',
        'Settings',
      ]) {
        assert.ok(html.includes(`data-shortcut="${label}"`), label);
      }
      const nav = html.match(/<nav class="admin-nav"[\s\S]*?<\/nav>/)?.[0];
      assert.ok(nav);
      assert.match(nav, /href="\/admin\/customer-service"/);
      assert.doesNotMatch(nav, /Inventory|Reports/);
    });

    it('allows its own sections', async () => {
      for (const path of [
        '/admin/customers',
        '/admin/customers/abc',
        '/admin/orders',
        '/admin/support',
        '/admin/support/1',
        '/admin/settings',
      ]) {
        assert.equal((await get(path, cs)).status, 200, path);
      }
    });

    it('denies sections outside its role', async () => {
      for (const path of ['/admin/inventory', '/admin/reports']) {
        const res = await get(path, cs);
        assert.equal(res.status, 403, path);
        assert.match(await res.text(), /Access denied/);
      }
    });

    it('sends it to its own dashboard instead of the admin one', async () => {
      const res = await get('/admin', cs);
      assert.equal(res.status, 303);
      assert.equal(res.headers.get('location'), '/admin/customer-service');
    });

    it('keeps unknown sections as 404', async () => {
      assert.equal((await get('/admin/unknown', cs)).status, 404);
    });

    it('is not available to admins, who are sent to their own dashboard', async () => {
      const res = await get(
        '/admin/customer-service',
        'auth_token=admin-token',
      );
      assert.equal(res.status, 303);
      assert.equal(res.headers.get('location'), '/admin');
    });

    it('blocks staff roles without a dashboard from the admin area', async () => {
      const errorLog = vi.spyOn(console, 'error').mockImplementation(() => {});
      try {
        const res = await get('/admin', 'auth_token=finance-token');
        assert.equal(res.status, 403);
      } finally {
        errorLog.mockRestore();
      }
    });

    it('does not add a Dashboard option to the admin profile menu', async () => {
      const html = await (await get('/admin/customers', cs)).text();
      const menu = html.match(
        /<div class="admin-profile-menu">[\s\S]*?<\/div>/,
      )?.[0];
      assert.ok(menu);
      assert.doesNotMatch(menu, /href="\/dashboard"/);
    });
  });

  describe('/dashboard', () => {
    it('redirects Customer Service staff to their dashboard', async () => {
      const { cookies } = await login('cs@example.com');
      const res = await get('/dashboard', cookies);
      assert.equal(res.status, 303);
      assert.equal(res.headers.get('location'), '/admin/customer-service');
      assert.equal(res.headers.get('cache-control'), 'no-store');
    });

    it('redirects admins to the admin dashboard', async () => {
      const { cookies } = await login('admin@example.com');
      const res = await get('/dashboard', cookies);
      assert.equal(res.headers.get('location'), '/admin');
    });

    it('falls back to the backend role when the login session has none', async () => {
      const res = await get('/dashboard', 'auth_token=cs-token');
      assert.equal(res.headers.get('location'), '/admin/customer-service');
    });

    it('redirects visitors to the login page', async () => {
      const res = await get('/dashboard', '');
      assert.equal(res.status, 303);
      assert.equal(res.headers.get('location'), '/login');
    });
  });

  describe('homepage account menu', () => {
    it('shows Dashboard to staff and hides it from customers and guests', async () => {
      const { cookies } = await login('cs@example.com');
      const staff = await (await get('/', cookies)).text();
      assert.match(staff, /href="\/dashboard">Dashboard</);
      const guest = await (await get('/', '')).text();
      assert.doesNotMatch(guest, /href="\/dashboard"/);
    });

    it('shows Dashboard to staff whose login session predates stored roles', async () => {
      const now = Math.floor(Date.now() / 1000);
      const session = await new SignJWT({ name: 'Casey Service' })
        .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
        .setSubject('cs@example.com')
        .setIssuer('ctrl-alt-elite-frontend')
        .setAudience('ctrl-alt-elite-homepage')
        .setIssuedAt(now)
        .setExpirationTime(now + 3600)
        .sign(new TextEncoder().encode(SECRET));
      const cookie = `ctrl_alt_elite_login=${session}; auth_token=cs-token`;
      const html = await (await get('/', cookie)).text();
      assert.match(html, /href="\/dashboard">Dashboard</);
    });
  });
});
