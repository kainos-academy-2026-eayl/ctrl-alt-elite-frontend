import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, it } from 'vitest';
import { createApp } from '../src/app';
import { navItemsForRole } from '../src/util/adminPortal';
import type { StockItem } from '../src/util/adminStock';
import {
  findStaffRole,
  landingPathForRole,
  normaliseRole,
  Role,
  STAFF_ROLES,
} from '../src/util/staffRoles';
import { withoutAccessibilityMenu } from './accessibilityMenu';

const SECRET = 'test-only-inventory-role-secret-with-at-least-32-bytes';

interface BackendUser {
  email: string;
  role: string;
  customersProbe: number;
  inventory: number;
}

const USERS: Record<string, BackendUser> = {
  'inventory-token': {
    email: 'stock@example.com',
    role: 'INVENTORY_MANAGEMENT',
    customersProbe: 403,
    inventory: 200,
  },
  'admin-token': {
    email: 'admin@example.com',
    role: 'ADMIN',
    customersProbe: 200,
    inventory: 200,
  },
  'cs-token': {
    email: 'cs@example.com',
    role: 'CUSTOMER_SERVICE',
    customersProbe: 200,
    inventory: 403,
  },
  'customer-token': {
    email: 'shopper@example.com',
    role: 'CUSTOMER',
    customersProbe: 403,
    inventory: 403,
  },
};

function product(
  id: string,
  name: string,
  stock: number,
  threshold: number,
  outOfStock = false,
): StockItem {
  const lowStock = stock <= threshold;
  return {
    id,
    name,
    category: 'Clothing',
    stock,
    lowStockThreshold: threshold,
    outOfStock,
    lowStock,
    status:
      outOfStock || stock === 0
        ? 'OUT_OF_STOCK'
        : lowStock
          ? 'LOW_STOCK'
          : 'IN_STOCK',
  };
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

function navOf(html: string): string {
  const nav = html.match(/<nav class="admin-nav"[\s\S]*?<\/nav>/)?.[0];
  assert.ok(nav, 'navigation not found');
  return nav;
}

function menuOf(html: string): string {
  const menu = html.match(
    /<div class="admin-profile-menu">[\s\S]*?<\/div>/,
  )?.[0];
  assert.ok(menu, 'profile menu not found');
  return menu;
}

describe('inventory manager role definition', () => {
  it('is recognised and lands on the inventory dashboard', () => {
    assert.equal(
      normaliseRole('inventory management'),
      Role.INVENTORY_MANAGEMENT,
    );
    assert.equal(
      normaliseRole('Inventory-Management'),
      Role.INVENTORY_MANAGEMENT,
    );
    assert.equal(
      landingPathForRole('INVENTORY_MANAGEMENT'),
      '/admin/stock/dashboard',
    );
    assert.equal(
      findStaffRole('INVENTORY_MANAGEMENT')?.label,
      'Inventory Manager',
    );
  });

  it('shows the inventory pages and Settings in the menu', () => {
    const role = STAFF_ROLES.INVENTORY_MANAGEMENT;
    assert.ok(role);
    assert.deepEqual(
      navItemsForRole(role).map((item) => [item.label, item.href]),
      [
        ['Inventory Dashboard', '/admin/stock/dashboard'],
        ['Inventory', '/admin/stock'],
        ['Settings', '/admin/settings'],
      ],
    );
  });

  it('gives admins a single Inventory item next to the existing ones', () => {
    const role = STAFF_ROLES.ADMIN;
    assert.ok(role);
    assert.deepEqual(
      navItemsForRole(role).map((item) => item.label),
      [
        'Dashboard',
        'Orders',
        'Customers',
        'Support Tickets',
        'Products',
        'Inventory',
        'Reports',
        'Settings',
      ],
    );
  });

  it('keeps inventory items away from Customer Service', () => {
    const role = STAFF_ROLES.CUSTOMER_SERVICE;
    assert.ok(role);
    assert.deepEqual(
      navItemsForRole(role).map((item) => item.label),
      ['Dashboard', 'Orders', 'Customers', 'Support Tickets', 'Settings'],
    );
  });
});

describe('inventory management access', () => {
  let backend: Server;
  let frontend: Server;
  let base: string;
  let products: StockItem[];
  let failInventory = false;

  function summary() {
    return {
      totalProducts: products.length,
      inStock: products.filter((p) => p.status === 'IN_STOCK').length,
      lowStock: products.filter((p) => p.status === 'LOW_STOCK').length,
      outOfStock: products.filter((p) => p.status === 'OUT_OF_STOCK').length,
      totalUnits: products.reduce((total, p) => total + p.stock, 0),
    };
  }

  beforeAll(async () => {
    products = [
      product('p-1', 'Kainos Hoodie', 20, 5),
      product('p-2', 'Swaggy Jeans', 3, 5),
      product('p-3', 'Cap', 0, 5, true),
    ];
    backend = createServer((req, res) => {
      res.setHeader('content-type', 'application/json');
      const url = req.url ?? '';
      let body = '';
      req.on('data', (chunk) => {
        body += chunk;
      });
      req.on('end', () => {
        if (url === '/api/auth/login') {
          const { email } = JSON.parse(body);
          const entry = Object.entries(USERS).find(
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
              firstName: 'Sam',
              lastName: 'Stock',
              role: entry[1].role,
              token: entry[0],
            }),
          );
          return;
        }

        const token = req.headers.authorization?.split(' ')[1] ?? '';
        const user = USERS[token];
        if (!user) {
          res.statusCode = 401;
          res.end('{}');
          return;
        }
        if (url === '/api/admin/profile') {
          if (user.role === 'CUSTOMER') {
            res.statusCode = 403;
            res.end('{}');
            return;
          }
          res.end(
            JSON.stringify({
              name: 'Sam Stock',
              email: user.email,
              role: user.role,
            }),
          );
          return;
        }
        if (url === '/api/admin/customers?pageSize=1') {
          res.statusCode = user.customersProbe;
          res.end('{}');
          return;
        }
        if (url.startsWith('/api/admin/inventory')) {
          if (user.inventory !== 200) {
            res.statusCode = user.inventory;
            res.end('{}');
            return;
          }
          if (failInventory) {
            res.statusCode = 500;
            res.end('{}');
            return;
          }
          if (
            req.method === 'GET' &&
            url === '/api/admin/inventory/dashboard'
          ) {
            res.end(
              JSON.stringify({
                summary: summary(),
                lowStockProducts: products.filter((p) => p.lowStock),
              }),
            );
            return;
          }
          if (req.method === 'GET' && url === '/api/admin/inventory') {
            res.end(JSON.stringify({ products }));
            return;
          }
          const match = url.match(/^\/api\/admin\/inventory\/([^/]+)\/stock$/);
          if (req.method === 'PATCH' && match) {
            const payload = JSON.parse(body) as {
              stock: number;
              lowStockThreshold?: number;
            };
            if (!Number.isInteger(payload.stock) || payload.stock < 0) {
              res.statusCode = 400;
              res.end(
                JSON.stringify({
                  message: 'Validation failed',
                  errors: [
                    { field: 'stock', message: 'stock must be a whole number' },
                  ],
                }),
              );
              return;
            }
            const current = products.find((p) => p.id === match[1]);
            if (!current) {
              res.statusCode = 404;
              res.end('{}');
              return;
            }
            const next = product(
              current.id,
              current.name,
              payload.stock,
              payload.lowStockThreshold ?? current.lowStockThreshold,
              current.outOfStock,
            );
            products = products.map((p) => (p.id === next.id ? next : p));
            res.end(JSON.stringify({ product: next }));
            return;
          }
        }
        res.statusCode = 404;
        res.end('{}');
      });
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

  function get(path: string, token?: string) {
    return fetch(`${base}${path}`, {
      headers: token ? { cookie: `auth_token=${token}` } : {},
      redirect: 'manual',
    });
  }

  async function login(email: string, returnTo?: string) {
    const form = new URLSearchParams({ email, password: 'CorrectPassword@1' });
    if (returnTo !== undefined) form.set('returnTo', returnTo);
    const res = await fetch(`${base}/login`, {
      method: 'POST',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        origin: base,
      },
      body: form,
      redirect: 'manual',
    });
    const cookies = res.headers
      .getSetCookie()
      .map((cookie) => cookie.split(';')[0])
      .join('; ');
    return { res, cookies };
  }

  describe('login to dashboard to stock update', () => {
    it('takes an inventory manager to the dashboard and lets them update stock', async () => {
      const { res: loginRes, cookies } = await login('stock@example.com');
      assert.equal(loginRes.status, 303);
      assert.equal(loginRes.headers.get('location'), '/admin/stock/dashboard');

      const page = await fetch(`${base}/admin/stock/dashboard`, {
        headers: { cookie: cookies },
      });
      assert.equal(page.status, 200);
      const html = await page.text();
      assert.match(html, /<h1>Inventory Dashboard<\/h1>/);
      assert.match(html, /src="\/client\/adminStockDashboard\.js"/);
      assert.match(html, /data-stock-summary/);
      assert.match(html, /admin-profile-role">Inventory Manager</);

      const dashboard = await fetch(`${base}/api/admin/inventory/dashboard`, {
        headers: { cookie: cookies },
      });
      assert.equal(dashboard.status, 200);
      const before = (await dashboard.json()) as {
        summary: { lowStock: number; inStock: number; totalUnits: number };
        lowStockProducts: StockItem[];
      };
      assert.equal(before.summary.lowStock, 1);
      assert.deepEqual(
        before.lowStockProducts.map((p) => p.id),
        ['p-2', 'p-3'],
      );

      const listPage = await fetch(`${base}/admin/stock`, {
        headers: { cookie: cookies },
      });
      assert.equal(listPage.status, 200);
      assert.match(await listPage.text(), /src="\/client\/adminStockList\.js"/);

      const update = await fetch(`${base}/api/admin/inventory/p-2/stock`, {
        method: 'PATCH',
        headers: { cookie: cookies, 'content-type': 'application/json' },
        body: JSON.stringify({ stock: 40, lowStockThreshold: 10 }),
      });
      assert.equal(update.status, 200);
      const { product: updated } = (await update.json()) as {
        product: StockItem;
      };
      assert.equal(updated.stock, 40);
      assert.equal(updated.status, 'IN_STOCK');

      const after = (await (
        await fetch(`${base}/api/admin/inventory/dashboard`, {
          headers: { cookie: cookies },
        })
      ).json()) as {
        summary: { lowStock: number; inStock: number; totalUnits: number };
      };
      assert.equal(after.summary.lowStock, 0);
      assert.equal(after.summary.inStock, 2);
      assert.equal(after.summary.totalUnits, before.summary.totalUnits + 37);
    });

    it('passes validation and not-found responses through to the browser', async () => {
      const headers = {
        cookie: 'auth_token=inventory-token',
        'content-type': 'application/json',
      };
      const invalid = await fetch(`${base}/api/admin/inventory/p-1/stock`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ stock: -5 }),
      });
      assert.equal(invalid.status, 400);
      const body = (await invalid.json()) as { errors: { field: string }[] };
      assert.equal(body.errors[0]?.field, 'stock');

      const missing = await fetch(`${base}/api/admin/inventory/nope/stock`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ stock: 5 }),
      });
      assert.equal(missing.status, 404);
    });

    it('passes 401, 403 and 500 responses through to the browser', async () => {
      const call = (token: string) =>
        fetch(`${base}/api/admin/inventory`, {
          headers: { cookie: `auth_token=${token}` },
        });
      assert.equal((await call('expired-token')).status, 401);
      assert.equal((await call('cs-token')).status, 403);
      failInventory = true;
      try {
        assert.equal((await call('inventory-token')).status, 500);
      } finally {
        failInventory = false;
      }
    });
  });

  describe('Inventory Manager route guard', () => {
    const token = 'inventory-token';

    it('allows the inventory pages and Settings', async () => {
      for (const path of [
        '/admin/stock/dashboard',
        '/admin/stock',
        '/admin/settings',
      ]) {
        assert.equal((await get(path, token)).status, 200, path);
      }
    });

    it('denies every other admin page with Access denied', async () => {
      for (const path of [
        '/admin/customers',
        '/admin/customers/abc',
        '/admin/support',
        '/admin/support/1',
        '/admin/inventory',
        '/admin/inventory/new',
        '/admin/inventory/p-1',
        '/admin/orders',
        '/admin/reports',
      ]) {
        const res = await get(path, token);
        assert.equal(res.status, 403, path);
        const html = await res.text();
        assert.match(html, /Access denied/, path);
        assert.doesNotMatch(html, /admin-sidebar/, path);
      }
    });

    it('sends the generic admin and Customer Service dashboards to its own', async () => {
      for (const path of ['/admin', '/admin/customer-service']) {
        const res = await get(path, token);
        assert.equal(res.status, 303, path);
        assert.equal(res.headers.get('location'), '/admin/stock/dashboard');
      }
    });

    it('keeps unknown sections as 404', async () => {
      assert.equal((await get('/admin/unknown', token)).status, 404);
    });

    it('shows Inventory Dashboard, Inventory and Settings, with My Profile, Back to homepage and Log out in the menu', async () => {
      const html = await (await get('/admin/stock', token)).text();
      const nav = navOf(html);
      assert.deepEqual(
        [...nav.matchAll(/>([^<]+)<\/a>/g)].map((match) => match[1]),
        ['Inventory Dashboard', 'Inventory', 'Settings'],
      );
      assert.match(nav, /aria-current="page"[^>]*>Inventory</);

      const menu = menuOf(html);
      assert.match(menu, /href="\/profile">My Profile</);
      assert.match(menu, /action="\/logout"/);
      assert.match(menu, />Log out</);
      assert.match(menu, /href="\/">&larr; Back to homepage<\/a>/);
    });

    it('shows Settings without the dashboard widget preferences', async () => {
      const html = await (await get('/admin/settings', token)).text();
      assert.match(html, /admin-profile-role">Inventory Manager</);
      assert.match(html, /System Information/);
      assert.doesNotMatch(html, /Dashboard Preferences|data-widget-toggle/);
      assert.match(navOf(html), /aria-current="page"[^>]*>Settings</);
    });

    it('marks only the dashboard as current on the dashboard page', async () => {
      const nav = navOf(
        await (await get('/admin/stock/dashboard', token)).text(),
      );
      assert.equal((nav.match(/aria-current="page"/g) ?? []).length, 1);
      assert.match(nav, /aria-current="page"[^>]*>Inventory Dashboard</);
    });

    it('blocks a role the backend cannot confirm as staff', async () => {
      const res = await get('/admin/stock', 'customer-token');
      assert.equal(res.status, 403);
      assert.match(await res.text(), /Access denied/);
    });
  });

  describe('Admin route guard', () => {
    const token = 'admin-token';

    it('allows the inventory list as well as the existing pages', async () => {
      for (const path of [
        '/admin',
        '/admin/stock',
        '/admin/inventory',
        '/admin/inventory/new',
        '/admin/customers',
        '/admin/reports',
      ]) {
        assert.equal((await get(path, token)).status, 200, path);
      }
    });

    it('has no Inventory Dashboard: the page redirects to the admin dashboard', async () => {
      const res = await get('/admin/stock/dashboard', token);
      assert.equal(res.status, 303);
      assert.equal(res.headers.get('location'), '/admin');
    });

    it('shows a single Inventory item next to the existing ones', async () => {
      const nav = navOf(await (await get('/admin/stock', token)).text());
      for (const label of [
        'Dashboard',
        'Customers',
        'Products',
        'Inventory',
        'Reports',
        'Settings',
      ]) {
        assert.ok(nav.includes(`>${label}</a>`), label);
      }
      assert.doesNotMatch(nav, /Inventory Dashboard/);
      assert.match(nav, /aria-current="page"[^>]*>Inventory</);
    });

    it('still offers the way back to the homepage', async () => {
      const menu = menuOf(await (await get('/admin/stock', token)).text());
      assert.match(menu, /Back to homepage/);
      assert.match(menu, /href="\/profile">My Profile</);
    });
  });

  describe('Customer Service route guard', () => {
    const token = 'cs-token';

    it('does not see inventory items', async () => {
      const nav = navOf(await (await get('/admin/customers', token)).text());
      assert.doesNotMatch(nav, /Inventory|Products/);
    });

    it('is denied the inventory list', async () => {
      const res = await get('/admin/stock', token);
      assert.equal(res.status, 403);
      assert.match(await res.text(), /Access denied/);
    });

    it('is sent to its own dashboard from the Inventory Dashboard URL', async () => {
      const res = await get('/admin/stock/dashboard', token);
      assert.equal(res.status, 303);
      assert.equal(res.headers.get('location'), '/admin/customer-service');
    });
  });

  describe('Customer and signed-out visitors', () => {
    it('denies customers', async () => {
      for (const path of ['/admin/stock', '/admin/stock/dashboard']) {
        assert.equal((await get(path, 'customer-token')).status, 403, path);
      }
    });

    it('redirects expired tokens to login and keeps the intended page', async () => {
      const res = await get('/admin/stock?low=1', 'expired-token');
      assert.equal(res.status, 303);
      assert.equal(
        res.headers.get('location'),
        '/login?returnTo=%2Fadmin%2Fstock%3Flow%3D1',
      );
    });

    it('redirects signed-out visitors to login and keeps the intended page', async () => {
      const res = await get('/admin/stock/dashboard');
      assert.equal(res.status, 303);
      assert.equal(
        res.headers.get('location'),
        '/login?returnTo=%2Fadmin%2Fstock%2Fdashboard',
      );
    });
  });

  describe('returning to the intended page after login', () => {
    it('carries a safe returnTo into the login form', async () => {
      const html = await (await get('/login?returnTo=%2Fadmin%2Fstock')).text();
      assert.match(
        html,
        /<input type="hidden" name="returnTo" value="\/admin\/stock"/,
      );
    });

    it('drops unsafe returnTo values', async () => {
      for (const value of [
        '//evil.example',
        'https://evil.example',
        '/\\evil',
      ]) {
        const html = await (
          await get(`/login?returnTo=${encodeURIComponent(value)}`)
        ).text();
        assert.doesNotMatch(
          withoutAccessibilityMenu(html),
          /name="returnTo"/,
          value,
        );
      }
    });

    it('sends staff back to the page they asked for', async () => {
      const { res } = await login('stock@example.com', '/admin/stock?low=1');
      assert.equal(res.headers.get('location'), '/admin/stock?low=1');
    });

    it('ignores external or mismatched destinations', async () => {
      for (const target of [
        '//evil.example',
        'https://evil.example',
        '/account/support',
      ]) {
        const { res } = await login('stock@example.com', target);
        assert.equal(
          res.headers.get('location'),
          '/admin/stock/dashboard',
          target,
        );
      }
      const customer = await login('shopper@example.com', '/admin/stock');
      assert.equal(customer.res.headers.get('location'), '/');
    });
  });
});
