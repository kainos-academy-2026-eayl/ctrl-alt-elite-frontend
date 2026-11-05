import assert from 'node:assert/strict';
import { describe, it, vi } from 'vitest';
import {
  buildNotifications,
  buildSystemStatus,
  loadDashboardCustomerData,
  loadDashboardOrderData,
  loadProductCount,
  renderActivity,
  renderNotifications,
  renderSystemStatus,
} from '../src/util/adminDashboard';
import type { Customer, CustomerSource } from '../src/util/customers';
import { createInMemoryCustomerSource } from './customerFixtures';

const NOW = new Date('2026-10-22T10:00:00Z');

describe('dashboard product count', () => {
  const respond = (body: unknown, status = 200) =>
    (async () => Response.json(body, { status })) as unknown as typeof fetch;

  it('counts products from { products } or a plain array', async () => {
    assert.equal(
      await loadProductCount(respond({ products: [{}, {}, {}] })),
      3,
    );
    assert.equal(await loadProductCount(respond([{}])), 1);
    assert.equal(await loadProductCount(respond({ products: [] })), 0);
  });

  it('asks the products API', async () => {
    const fetchImpl = vi.fn(async (_url: string) =>
      Response.json({ products: [] }),
    );
    await loadProductCount(fetchImpl as unknown as typeof fetch);
    assert.equal(fetchImpl.mock.calls[0]?.[0], '/api/products');
  });

  it('returns null so the placeholder stays when the count is unavailable', async () => {
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      assert.equal(await loadProductCount(respond({}, 500)), null);
      assert.equal(await loadProductCount(respond({ nope: true })), null);
      assert.equal(
        await loadProductCount((async () => {
          throw new Error('offline');
        }) as unknown as typeof fetch),
        null,
      );
    } finally {
      errorLog.mockRestore();
    }
  });
});

describe('dashboard order data', () => {
  const page = (total: number) => ({
    orders: [],
    page: 1,
    pageSize: 1,
    total,
    totalPages: total,
  });

  it('reads the total and pending counts, one row each', async () => {
    const listOrders = vi.fn(
      async (query: { status: string }, _size?: number) =>
        page(query.status === 'PENDING' ? 4 : 12),
    );
    const data = await loadDashboardOrderData({ listOrders });
    assert.deepEqual(data, {
      available: true,
      totalOrders: 12,
      pendingOrders: 4,
    });
    assert.deepEqual(
      listOrders.mock.calls.map((call) => [call[0].status, call[1]]),
      [
        ['', 1],
        ['PENDING', 1],
      ],
    );
  });

  it('returns unavailable data instead of throwing when orders cannot be read', async () => {
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const data = await loadDashboardOrderData({
        listOrders: async () => {
          throw new Error('403');
        },
      });
      assert.equal(data.available, false);
      assert.equal(data.totalOrders, 0);
    } finally {
      errorLog.mockRestore();
    }
  });

  it('adds a pending-orders notification linking to the filtered list', () => {
    const customers = {
      available: true,
      totalCustomers: 1,
      recentCustomers: [],
      newCustomers: 1,
    };
    const notifications = buildNotifications(customers, {
      available: true,
      totalOrders: 3,
      pendingOrders: 2,
    });
    assert.deepEqual(notifications[0], {
      text: '2 orders are awaiting processing',
      href: '/admin/orders?status=PENDING',
    });
    assert.equal(notifications.length, 2);
    assert.equal(
      buildNotifications(customers, {
        available: true,
        totalOrders: 1,
        pendingOrders: 1,
      })[0]?.text,
      '1 order is awaiting processing',
    );
    assert.equal(
      buildNotifications(
        { ...customers, newCustomers: 0 },
        { available: true, totalOrders: 3, pendingOrders: 0 },
      ).length,
      0,
    );
  });
});

describe('dashboard customer data', () => {
  it('loads the total, latest registrations and the last-7-days count', async () => {
    const data = await loadDashboardCustomerData(
      createInMemoryCustomerSource(),
      NOW,
    );
    // Fixtures registered on or after 2026-10-16: Zoe (10-18) and Aoife (10-21).
    assert.equal(data.available, true);
    assert.equal(data.totalCustomers, 27);
    assert.equal(data.newCustomers, 2);
    assert.equal(data.recentCustomers.length, 5);
    assert.equal(data.recentCustomers[0]?.firstName, 'Aoife');
    assert.deepEqual(buildNotifications(data), [
      {
        text: '2 new customers registered in the last 7 days',
        href: '/admin/customers?sort=newest',
      },
    ]);
  });

  it('uses singular wording for one new customer and no notification for none', async () => {
    const one = await loadDashboardCustomerData(
      createInMemoryCustomerSource(),
      new Date('2026-10-26T10:00:00Z'),
    );
    assert.deepEqual(
      buildNotifications(one).map((notification) => notification.text),
      ['1 new customer registered in the last 7 days'],
    );
    const none = await loadDashboardCustomerData(
      createInMemoryCustomerSource(),
      new Date('2027-01-01T00:00:00Z'),
    );
    assert.deepEqual(buildNotifications(none), []);
  });

  it('returns unavailable data instead of throwing when the backend fails', async () => {
    const failing: CustomerSource = {
      query: async () => {
        throw new Error('down');
      },
      findById: async () => undefined,
    };
    const originalError = console.error;
    console.error = () => {};
    try {
      const data = await loadDashboardCustomerData(failing, NOW);
      assert.equal(data.available, false);
      assert.equal(data.totalCustomers, 0);
      assert.deepEqual(buildNotifications(data), []);
    } finally {
      console.error = originalError;
    }
  });

  it('derives backend status from availability and leaves email unknown', () => {
    const up = buildSystemStatus(true);
    assert.deepEqual(
      up.map((service) => service.ok),
      [true, true, true, false],
    );
    assert.equal(up[3]?.text, 'Status unavailable');
    assert.ok(buildSystemStatus(false).every((service) => !service.ok));
  });
});

describe('dashboard rendering', () => {
  const customer: Customer = {
    id: 'abc-1',
    firstName: '<b>Eve</b>',
    lastName: 'O"Neil',
    email: 'eve@example.com',
    registrationDate: '2026-10-21',
  };

  it('renders empty states', () => {
    assert.match(renderNotifications([]), /No active notifications/);
    assert.match(renderActivity([]), /No recent activity available/);
  });

  it('renders activity entries as links to the customer, escaping names', () => {
    const html = renderActivity([customer]);
    assert.match(html, /href="\/admin\/customers\/abc-1"/);
    assert.match(html, /&lt;b&gt;Eve&lt;\/b&gt; O&quot;Neil/);
    assert.doesNotMatch(html, /<b>Eve/);
    assert.match(html, /21 Oct 2026/);
  });

  it('renders notifications and status badges', () => {
    assert.match(
      renderNotifications([
        {
          text: '3 new customers registered in the last 7 days',
          href: '/admin/customers?sort=newest',
        },
      ]),
      /<a href="\/admin\/customers\?sort=newest">3 new customers/,
    );
    const status = renderSystemStatus(buildSystemStatus(true));
    assert.match(status, /Database Connection/);
    assert.match(status, /admin-status-badge is-ok">Connected/);
    assert.match(status, /admin-status-badge">Status unavailable/);
  });
});
