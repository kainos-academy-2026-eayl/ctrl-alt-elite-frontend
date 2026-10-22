import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
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

// The server only serves HTML shells; each page's controller script loads data
// from the backend in the browser, so none of these routes call the backend.
describe('admin portal pages', () => {
  let frontend: Server;
  let base: string;

  beforeAll(async () => {
    frontend = createServer(createApp('http://127.0.0.1:1'));
    base = await listen(frontend);
  });

  afterAll(async () => {
    await close(frontend);
  });

  async function get(path: string) {
    const res = await fetch(`${base}${path}`);
    return { status: res.status, html: await res.text(), res };
  }

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
