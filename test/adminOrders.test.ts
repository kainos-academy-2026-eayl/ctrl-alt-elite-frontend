import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import {
  buildOrdersUrl,
  formatPence,
  orderQueryParams,
  orderReference,
  parseOrderDetail,
  parseOrderPage,
  readOrderQuery,
} from '../src/util/adminOrders';
import {
  createOrdersApi,
  OrderNotFoundError,
} from '../src/util/adminOrdersApi';
import {
  renderOrderDetail,
  renderOrdersResults,
} from '../src/util/adminOrderViews';
import {
  defaultReportRange,
  parseSalesReport,
  readReportRange,
  validateReportRange,
} from '../src/util/adminReports';
import { renderSalesReport } from '../src/util/adminReportViews';
import { AccessDeniedError, SessionExpiredError } from '../src/util/apiErrors';

const summary = {
  id: '3f2a9c1e-aaaa-bbbb-cccc-1234567890ab',
  customerName: 'Ada <b>Lovelace</b>',
  customerEmail: 'ada@example.com',
  status: 'PENDING',
  totalPence: 1999,
  itemCount: 2,
  createdAt: '2026-11-01T10:30:00.000Z',
};

const detail = {
  id: summary.id,
  status: 'SHIPPED',
  createdAt: summary.createdAt,
  totalPence: 2498,
  customer: { id: 'u-1', name: 'Ada Lovelace', email: 'ada@example.com' },
  delivery: { option: 'Express delivery', pricePence: 499 },
  items: [
    { productId: 'p-1', name: 'Apple', quantity: 2, unitPricePence: 1000 },
  ],
};

const report = {
  range: { from: '2026-11-01', to: '2026-11-05' },
  summary: {
    totalOrders: 3,
    totalRevenuePence: 6000,
    averageOrderValuePence: 2000,
    unitsSold: 7,
  },
  ordersByStatus: [{ status: 'PENDING', count: 3 }],
  dailySales: [{ date: '2026-11-01', orders: 3, revenuePence: 6000 }],
  topProducts: [
    { productId: 'p-1', name: 'Apple', unitsSold: 7, revenuePence: 6000 },
  ],
};

function jsonResponse(status: number, body: unknown): typeof fetch {
  return async () => new Response(JSON.stringify(body), { status });
}

describe('admin order helpers', () => {
  it('reads and rebuilds list queries safely', () => {
    const query = readOrderQuery(
      new URLSearchParams('q= Ada &status=BOGUS&sort=nope&page=-3'),
    );
    assert.deepEqual(query, {
      search: 'Ada',
      status: '',
      sort: 'newest',
      page: 1,
    });
    assert.equal(
      buildOrdersUrl({
        search: 'Ada',
        status: 'SHIPPED',
        sort: 'oldest',
        page: 2,
      }),
      '/admin/orders?q=Ada&status=SHIPPED&sort=oldest&page=2',
    );
    assert.equal(
      orderQueryParams(query, 10).toString(),
      'sort=newest&page=1&pageSize=10&search=Ada',
    );
  });

  it('formats money and references', () => {
    assert.equal(formatPence(1999), '£19.99');
    assert.equal(orderReference(summary.id), '#3F2A9C1E');
  });

  it('rejects malformed API data', () => {
    assert.equal(parseOrderPage({ orders: [{ id: 1 }] }), undefined);
    assert.equal(parseOrderDetail({ ...detail, items: 'x' }), undefined);
    assert.equal(parseSalesReport({ range: {}, summary: {} }), undefined);
  });

  it('escapes customer data when rendering', () => {
    const page = parseOrderPage({
      orders: [summary],
      page: 1,
      pageSize: 10,
      total: 1,
      totalPages: 1,
    });
    assert.ok(page);
    const html = renderOrdersResults(
      page,
      readOrderQuery(new URLSearchParams()),
    );
    assert.doesNotMatch(html, /<b>Lovelace/);
    assert.match(html, /&lt;b&gt;Lovelace/);
    assert.match(html, /href="\/admin\/orders\/3f2a9c1e-/);
  });

  it('renders order details with totals', () => {
    const order = parseOrderDetail(detail);
    assert.ok(order);
    const html = renderOrderDetail(order);
    assert.match(html, /Order #3F2A9C1E/);
    assert.match(html, /£24.98/);
    assert.match(html, /Not recorded/);
  });
});

describe('admin report helpers', () => {
  it('defaults to the last 30 days and validates ranges', () => {
    const now = new Date('2026-11-30T12:00:00Z');
    assert.deepEqual(defaultReportRange(now), {
      from: '2026-11-01',
      to: '2026-11-30',
    });
    assert.deepEqual(
      readReportRange(
        new URLSearchParams('from=2026-12-01&to=2026-11-01'),
        now,
      ),
      defaultReportRange(now),
    );
    assert.ok(validateReportRange({ from: '2026-02-30', to: '2026-03-01' }));
    assert.equal(
      validateReportRange({ from: '2026-11-01', to: '2026-11-05' }),
      undefined,
    );
  });

  it('renders the sales report', () => {
    const parsed = parseSalesReport(report);
    assert.ok(parsed);
    const html = renderSalesReport(parsed);
    assert.match(html, /£60.00/);
    assert.match(html, /Top products/);
  });
});

describe('orders API client', () => {
  it('lists orders and requests the expected URL', async () => {
    let requested = '';
    const api = createOrdersApi({
      fetchImpl: async (input) => {
        requested = String(input);
        return new Response(
          JSON.stringify({
            orders: [summary],
            page: 1,
            pageSize: 10,
            total: 1,
            totalPages: 1,
          }),
        );
      },
    });
    const page = await api.listOrders(
      readOrderQuery(new URLSearchParams('status=SHIPPED')),
    );
    assert.equal(page.total, 1);
    assert.equal(
      requested,
      '/api/admin/orders?sort=newest&page=1&pageSize=10&status=SHIPPED',
    );
  });

  it('maps statuses to errors', async () => {
    await assert.rejects(
      createOrdersApi({ fetchImpl: jsonResponse(401, {}) }).getOrder('a'),
      SessionExpiredError,
    );
    await assert.rejects(
      createOrdersApi({ fetchImpl: jsonResponse(403, {}) }).getOrder('a'),
      AccessDeniedError,
    );
    await assert.rejects(
      createOrdersApi({ fetchImpl: jsonResponse(404, {}) }).getOrder('a'),
      OrderNotFoundError,
    );
  });

  it('loads an order and a sales report', async () => {
    const order = await createOrdersApi({
      fetchImpl: jsonResponse(200, { order: detail }),
    }).getOrder('a');
    assert.equal(order.customer.name, 'Ada Lovelace');
    const loaded = await createOrdersApi({
      fetchImpl: jsonResponse(200, report),
    }).getSalesReport(report.range);
    assert.equal(loaded.summary.totalOrders, 3);
  });
});
