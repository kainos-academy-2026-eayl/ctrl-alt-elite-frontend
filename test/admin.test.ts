import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
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

// The server only serves HTML shells; each page's controller script loads data
// from the backend in the browser. Only the access check calls the backend.
describe('admin portal pages', () => {
  let backend: Server;
  let frontend: Server;
  let base: string;
  let checks = 0;

  beforeAll(async () => {
    backend = createServer((req, res) => {
      checks += 1;
      const auth = req.headers.authorization;
      const ok = req.url === '/api/admin/customers?pageSize=1';
      res.statusCode = !ok
        ? 500
        : auth === 'Bearer admin-token'
          ? 200
          : auth === 'Bearer customer-token'
            ? 403
            : auth === 'Bearer broken-token'
              ? 500
              : 401;
      res.end('{}');
    });
    frontend = createServer(createApp(await listen(backend)));
    base = await listen(frontend);
  });

  afterAll(async () => {
    await close(frontend);
    await close(backend);
  });

  async function get(path: string, token = 'admin-token') {
    const res = await fetch(`${base}${path}`, {
      headers: token ? { cookie: `auth_token=${token}` } : {},
      redirect: 'manual',
    });
    return { status: res.status, html: await res.text(), res };
  }

  describe('access control', () => {
    it('redirects visitors without a token to the login page', async () => {
      const before = checks;
      const { status, res } = await get('/admin', '');
      assert.equal(status, 303);
      assert.equal(res.headers.get('location'), '/login');
      assert.equal(checks, before);
    });

    it('redirects expired or invalid tokens to the login page', async () => {
      for (const path of ['/admin', '/admin/customers/abc']) {
        const { status, res } = await get(path, 'expired-token');
        assert.equal(status, 303);
        assert.equal(res.headers.get('location'), '/login');
      }
    });

    it('blocks non-admin users on every admin route', async () => {
      for (const path of [
        '/admin',
        '/admin/customers',
        '/admin/customers/abc',
        '/admin/orders',
        '/admin/unknown',
      ]) {
        const { status, html, res } = await get(path, 'customer-token');
        assert.equal(status, 403, path);
        assert.match(html, /Access denied/);
        assert.doesNotMatch(html, /admin-sidebar|adminDashboard\.js/);
        assert.equal(res.headers.get('cache-control'), 'no-store');
      }
    });

    it('redirects to the unavailable page when the check fails', async () => {
      const errorLog = vi.spyOn(console, 'error').mockImplementation(() => {});
      try {
        const { status, res } = await get('/admin', 'broken-token');
        assert.equal(status, 302);
        assert.equal(res.headers.get('location'), '/unavailable');
      } finally {
        errorLog.mockRestore();
      }
    });

    it('shows a logout form on every admin page', async () => {
      for (const path of [
        '/admin',
        '/admin/customers',
        '/admin/customers/abc',
        '/admin/orders',
      ]) {
        const { html } = await get(path);
        assert.match(
          html,
          /<form class="admin-logout-form" action="\/logout" method="post">/,
          path,
        );
        assert.match(html, />Log out<\/button>/);
      }
    });

    it('clears the auth cookie on logout and redirects to login', async () => {
      const res = await fetch(`${base}/logout`, {
        method: 'POST',
        headers: { cookie: 'auth_token=admin-token' },
        redirect: 'manual',
      });
      assert.equal(res.status, 303);
      assert.equal(res.headers.get('location'), '/login');
      assert.equal(res.headers.get('cache-control'), 'no-store');
      const cookie = res.headers.get('set-cookie') ?? '';
      assert.match(cookie, /^auth_token=;/);
      assert.match(cookie, /Expires=Thu, 01 Jan 1970/);
      assert.match(cookie, /HttpOnly/i);
    });

    it('does not allow logout through GET', async () => {
      const res = await fetch(`${base}/logout`, { redirect: 'manual' });
      assert.equal(res.status, 404);
    });

    it('lets admin users through', async () => {
      assert.equal((await get('/admin')).status, 200);
    });
  });

  describe('dashboard', () => {
    it('serves the navigation and every placeholder section', async () => {
      const { status, res, html } = await get('/admin');
      assert.equal(status, 200);
      assert.match(res.headers.get('content-type') ?? '', /text\/html/);
      for (const text of [
        'Dashboard',
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
        'No active notifications',
        'Recent Activity',
        'No recent activity available',
        'System Status',
        'Database Connection',
        'Backend Service',
        'API Status',
        'Email Service',
        'Status unavailable',
      ]) {
        assert.ok(html.includes(text), `missing "${text}"`);
      }
      assert.match(html, /name="viewport"/);
    });

    it('is available with static content even when the backend is down', async () => {
      const { status, html } = await get('/admin');
      assert.equal(status, 200);
      assert.match(
        html,
        /data-summary-card="Customers">0</,
        'Customers card should default to a placeholder',
      );
    });

    it('loads its controller script and exposes the hooks it updates', async () => {
      const { html } = await get('/admin');
      assert.match(
        html,
        /<script src="\/controllers\/adminDashboard\.js" defer>/,
      );
      for (const hook of [
        'data-summary-card="Customers"',
        'data-dashboard-notifications',
        'data-dashboard-activity',
        'data-dashboard-status',
      ]) {
        assert.ok(html.includes(hook), `missing hook ${hook}`);
      }
    });

    it('links back to the homepage', async () => {
      const { html } = await get('/admin');
      assert.match(html, /<a[^>]*href="\/"[^>]*>[^<]*Back to homepage/);
    });

    it('has no Products navigation entry', async () => {
      const { html } = await get('/admin');
      assert.doesNotMatch(html, /href="\/admin\/products"/);
      assert.equal((await get('/admin/products')).status, 404);
    });

    it('returns 404 for unknown admin sections', async () => {
      assert.equal((await get('/admin/unknown')).status, 404);
    });

    for (const section of ['orders', 'inventory', 'reports', 'settings']) {
      it(`serves a placeholder page for /admin/${section}`, async () => {
        const { status, html } = await get(`/admin/${section}`);
        assert.equal(status, 200);
        assert.match(html, /Coming soon/);
      });
    }
  });

  describe('customers', () => {
    it('serves the list shell with search form, sort options and controller', async () => {
      const { status, html } = await get('/admin/customers');
      assert.equal(status, 200);
      assert.match(html, /name="q"/);
      assert.match(html, /name="email"/);
      for (const value of ['nameAsc', 'nameDesc', 'newest', 'oldest']) {
        assert.ok(html.includes(`value="${value}"`), `missing sort ${value}`);
      }
      assert.match(html, /data-customers-results/);
      assert.match(html, /data-total-customers/);
      assert.match(
        html,
        /<script src="\/controllers\/adminCustomers\.js" defer>/,
      );
      assert.match(html, /is-active"\s+href="\/admin\/customers"/);
    });

    it('serves the details shell for any id and leaves lookup to the controller', async () => {
      const { status, html } = await get('/admin/customers/some-uuid');
      assert.equal(status, 200);
      assert.match(html, /data-customer-detail/);
      assert.match(
        html,
        /<script src="\/controllers\/adminCustomerDetail\.js" defer>/,
      );
      assert.match(html, /Back to customers/);
    });

    it('does not contain any customer data of its own', async () => {
      const { html } = await get('/admin/customers');
      assert.doesNotMatch(html, /@example\.com|<td/);
    });
  });
});
