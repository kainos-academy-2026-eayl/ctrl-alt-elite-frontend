import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import {
  filterStock,
  hasStockFilters,
  MAX_STOCK,
  parseStockItem,
  parseStockItems,
  parseStockSummary,
  readStockQuery,
  STOCK_RANGE_MESSAGE,
  type StockItem,
  stockQueryParams,
  validateStockForm,
} from '../src/util/adminStock';
import {
  renderLowStockTable,
  renderStatusBadge,
  renderStockAccessDenied,
  renderStockEmpty,
  renderStockError,
  renderStockTable,
  renderSummaryCards,
  type StockDraft,
} from '../src/util/adminStockViews';
import {
  AccessDeniedError,
  loginRedirectFor,
  ServiceUnavailableError,
  SessionExpiredError,
} from '../src/util/apiErrors';
import { isAdminPath, loginUrl, safeReturnPath } from '../src/util/returnPath';
import {
  createStockApi,
  StockNotFoundError,
  StockValidationError,
} from '../src/util/stockApi';

function item(overrides: Partial<StockItem> = {}): StockItem {
  return {
    id: 'p-1',
    name: 'Kainos Hoodie',
    category: 'Clothing',
    stock: 20,
    lowStockThreshold: 5,
    outOfStock: false,
    lowStock: false,
    status: 'IN_STOCK',
    ...overrides,
  };
}

const LOW = item({
  id: 'p-2',
  name: 'Swaggy Jeans',
  stock: 3,
  lowStock: true,
  status: 'LOW_STOCK',
});
const OUT = item({
  id: 'p-3',
  name: 'Cap',
  stock: 0,
  outOfStock: true,
  lowStock: true,
  status: 'OUT_OF_STOCK',
});
const ITEMS = [item(), LOW, OUT];

function draft(overrides: Partial<StockDraft> = {}): StockDraft {
  return {
    stock: '20',
    lowStockThreshold: '5',
    errors: {},
    formError: '',
    saving: false,
    ...overrides,
  };
}

describe('stock input validation', () => {
  it('accepts whole numbers from 0 to 1,000,000', () => {
    for (const text of ['0', '1', '999999', String(MAX_STOCK), ' 42 ']) {
      const result = validateStockForm({ stock: text, lowStockThreshold: '' });
      assert.equal(result.ok, true, text);
    }
  });

  it('rejects anything else with the inline message', () => {
    for (const text of [
      '',
      '-1',
      '1.5',
      '1e3',
      'abc',
      '1000001',
      '99999999999999999999',
    ]) {
      const result = validateStockForm({ stock: text, lowStockThreshold: '' });
      assert.equal(result.ok, false, text);
      if (!result.ok) assert.equal(result.errors.stock, STOCK_RANGE_MESSAGE);
    }
    assert.equal(
      STOCK_RANGE_MESSAGE,
      'Enter a whole number from 0 to 1,000,000.',
    );
  });

  it('treats the threshold as optional but validates it when present', () => {
    assert.deepEqual(validateStockForm({ stock: '4', lowStockThreshold: '' }), {
      ok: true,
      value: { stock: 4 },
    });
    assert.deepEqual(
      validateStockForm({ stock: '4', lowStockThreshold: '10' }),
      {
        ok: true,
        value: { stock: 4, lowStockThreshold: 10 },
      },
    );
    const result = validateStockForm({ stock: '4', lowStockThreshold: '-2' });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.errors.lowStockThreshold, STOCK_RANGE_MESSAGE);
      assert.equal(result.errors.stock, undefined);
    }
  });

  it('reports both fields when both are invalid', () => {
    const result = validateStockForm({ stock: 'x', lowStockThreshold: 'y' });
    assert.equal(result.ok, false);
    if (!result.ok)
      assert.deepEqual(Object.keys(result.errors).sort(), [
        'lowStockThreshold',
        'stock',
      ]);
  });
});

describe('stock response parsing', () => {
  it('accepts a well-formed item and normalises numeric ids', () => {
    assert.deepEqual(parseStockItem({ ...item(), id: 7 }), item({ id: '7' }));
  });

  it('rejects malformed items and lists', () => {
    assert.equal(parseStockItem(null), null);
    assert.equal(parseStockItem({ ...item(), stock: '3' }), null);
    assert.equal(parseStockItem({ ...item(), stock: -1 }), null);
    assert.equal(parseStockItem({ ...item(), status: 'GONE' }), null);
    assert.equal(parseStockItems([item(), { id: 1 }]), null);
    assert.equal(parseStockItems('nope'), null);
    assert.deepEqual(parseStockItems([]), []);
  });

  it('validates the summary', () => {
    const summary = {
      totalProducts: 3,
      inStock: 1,
      lowStock: 1,
      outOfStock: 1,
      totalUnits: 23,
    };
    assert.deepEqual(parseStockSummary(summary), summary);
    assert.equal(
      parseStockSummary({ ...summary, totalUnits: undefined }),
      null,
    );
  });
});

describe('inventory search and filters', () => {
  it('searches by name, ignoring case', () => {
    const query = { search: 'JEANS', status: '', lowStockOnly: false } as const;
    assert.deepEqual(filterStock(ITEMS, query), [LOW]);
  });

  it('filters by status', () => {
    const query = {
      search: '',
      status: 'OUT_OF_STOCK',
      lowStockOnly: false,
    } as const;
    assert.deepEqual(filterStock(ITEMS, query), [OUT]);
  });

  it('can show low-stock products only', () => {
    const query = { search: '', status: '', lowStockOnly: true } as const;
    assert.deepEqual(filterStock(ITEMS, query), [LOW, OUT]);
  });

  it('combines the filters', () => {
    const query = {
      search: 'cap',
      status: 'LOW_STOCK',
      lowStockOnly: true,
    } as const;
    assert.deepEqual(filterStock(ITEMS, query), []);
  });

  it('round-trips the query through the URL and ignores bad values', () => {
    const query = readStockQuery(
      new URLSearchParams('q=hoodie&status=LOW_STOCK&low=1'),
    );
    assert.deepEqual(query, {
      search: 'hoodie',
      status: 'LOW_STOCK',
      lowStockOnly: true,
    });
    assert.equal(
      stockQueryParams(query).toString(),
      'q=hoodie&status=LOW_STOCK&low=1',
    );
    assert.equal(hasStockFilters(query), true);

    const bad = readStockQuery(new URLSearchParams('status=EVIL&low=yes'));
    assert.deepEqual(bad, { search: '', status: '', lowStockOnly: false });
    assert.equal(hasStockFilters(bad), false);
  });
});

describe('inventory views', () => {
  it('shows every status as text plus an icon, never colour alone', () => {
    const labels = {
      IN_STOCK: 'In stock',
      LOW_STOCK: 'Low stock',
      OUT_OF_STOCK: 'Out of stock',
    } as const;
    for (const [status, label] of Object.entries(labels)) {
      const html = renderStatusBadge(status as keyof typeof labels);
      assert.match(html, new RegExp(`</span>${label}</span>$`), status);
      assert.match(html, /stock-badge-icon" aria-hidden="true"/);
    }
  });

  it('renders the five summary cards', () => {
    const html = renderSummaryCards({
      totalProducts: 12,
      inStock: 8,
      lowStock: 3,
      outOfStock: 1,
      totalUnits: 1234,
    });
    const cards: [string, string][] = [
      ['Total products', '12'],
      ['In stock', '8'],
      ['Low stock', '3'],
      ['Out of stock', '1'],
      ['Total units', '1,234'],
    ];
    for (const [label, value] of cards) {
      assert.match(
        html,
        new RegExp(`data-summary-card="${label}">${value}</span>`),
        label,
      );
    }
  });

  it('lists low-stock products or says there are none', () => {
    const html = renderLowStockTable([LOW]);
    assert.match(html, /<caption class="visually-hidden">Low-stock products/);
    assert.match(html, /Swaggy Jeans/);
    assert.match(html, /class="stock-row is-low-stock"/);
    assert.match(renderLowStockTable([]), /No products are low on stock/);
  });

  it('shows name, category, stock, threshold and status for every product', () => {
    const html = renderStockTable(ITEMS, new Map(), new Set());
    for (const heading of [
      'Name',
      'Category',
      'Stock',
      'Threshold',
      'Status',
    ]) {
      assert.match(html, new RegExp(`<th scope="col">${heading}</th>`));
    }
    assert.equal((html.match(/data-stock-row=/g) ?? []).length, 3);
    assert.match(html, /Kainos Hoodie/);
    assert.match(html, /Clothing/);
  });

  it('highlights low-stock rows with a class and a text badge', () => {
    const html = renderStockTable(ITEMS, new Map(), new Set());
    const rows = html.split('<tr class="stock-row').slice(1);
    assert.doesNotMatch(rows[0] ?? '', /^ [^"]*is-low-stock/);
    assert.match(rows[1] ?? '', /^ is-low-stock/);
    assert.match(rows[1] ?? '', /Low stock<\/span>/);
    assert.match(rows[2] ?? '', /is-out-of-stock/);
    assert.match(rows[2] ?? '', /Out of stock<\/span>/);
  });

  it('offers to mark out of stock and to undo it from the same row', () => {
    const html = renderStockTable([item(), OUT], new Map(), new Set());
    assert.match(
      html,
      /data-out-of-stock="p-1" data-mark="true"[^>]*>Mark out of stock</,
    );
    assert.match(
      html,
      /data-out-of-stock="p-3" data-mark="false"[^>]*>Undo out of stock</,
    );
  });

  it('renders inline editing with the draft values and field errors', () => {
    const html = renderStockTable(
      [item()],
      new Map([
        [
          'p-1',
          draft({
            stock: '-4',
            errors: { stock: STOCK_RANGE_MESSAGE },
            formError: 'Unable to save.',
          }),
        ],
      ]),
      new Set(),
    );
    assert.match(html, /data-stock-input="stock"[^>]*value="-4"/);
    assert.match(
      html,
      /aria-invalid="true" aria-describedby="stock-p-1-error"/,
    );
    assert.match(
      html,
      /id="stock-p-1-error" role="alert">Enter a whole number from 0 to 1,000,000\./,
    );
    assert.match(html, /role="alert">Unable to save\./);
    assert.match(html, /data-save-stock="p-1"/);
    assert.doesNotMatch(html, /data-out-of-stock/);
  });

  it('disables the controls while saving or busy', () => {
    const saving = renderStockTable(
      [item()],
      new Map([['p-1', draft({ saving: true })]]),
      new Set(),
    );
    assert.match(saving, /data-save-stock="p-1"[^>]*disabled/);
    const busy = renderStockTable([item()], new Map(), new Set(['p-1']));
    assert.match(busy, /data-edit-stock="p-1"[^>]*disabled/);
    assert.match(busy, /data-out-of-stock="p-1"[^>]*disabled/);
  });

  it('escapes product text', () => {
    const html = renderStockTable(
      [item({ name: '<img src=x onerror=alert(1)>', category: '"><script>' })],
      new Map(),
      new Set(),
    );
    assert.doesNotMatch(html, /<img src=x|<script>/);
    assert.match(html, /&lt;img src=x/);
  });

  it('renders the empty, error and access denied states', () => {
    assert.match(
      renderStockEmpty(false),
      /There are no products to manage yet/,
    );
    assert.match(
      renderStockEmpty(true),
      /No products match your search or filters/,
    );
    const error = renderStockError('Unable to load', 'Try later <b>');
    assert.match(error, /role="alert"/);
    assert.match(error, /data-retry>Try again</);
    assert.match(error, /Try later &lt;b&gt;/);
    assert.match(renderStockAccessDenied(), />Access denied</);
  });
});

describe('return paths', () => {
  it('accepts same-origin paths only', () => {
    assert.equal(safeReturnPath('/admin/stock?low=1'), '/admin/stock?low=1');
    for (const value of [
      '//evil.example',
      'https://evil.example',
      '/\\evil.example',
      'admin',
      '/admin\n',
      '/<script>',
      42,
      undefined,
      `/${'a'.repeat(3000)}`,
    ]) {
      assert.equal(safeReturnPath(value), null, String(value));
    }
  });

  it('builds a login link that keeps the intended page', () => {
    assert.equal(
      loginUrl('/admin/stock?status=LOW_STOCK'),
      '/login?returnTo=%2Fadmin%2Fstock%3Fstatus%3DLOW_STOCK',
    );
    assert.equal(loginUrl('//evil.example'), '/login');
    assert.equal(loginUrl('/login'), '/login');
    assert.equal(
      loginRedirectFor({ pathname: '/admin/stock', search: '?q=hat' }),
      '/login?returnTo=%2Fadmin%2Fstock%3Fq%3Dhat',
    );
  });

  it('recognises admin paths', () => {
    assert.equal(isAdminPath('/admin'), true);
    assert.equal(isAdminPath('/admin/stock?x=1'), true);
    assert.equal(isAdminPath('/administrator'), false);
    assert.equal(isAdminPath('/account'), false);
  });
});

describe('stock API client', () => {
  interface Call {
    url: string;
    init: RequestInit;
  }

  function client(respond: (call: Call) => Response | Promise<Response>) {
    const calls: Call[] = [];
    const api = createStockApi({
      fetchImpl: async (input, init) => {
        const call = { url: String(input), init: init ?? {} };
        calls.push(call);
        return respond(call);
      },
    });
    return { api, calls };
  }

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    });

  it('loads the dashboard', async () => {
    const summary = {
      totalProducts: 3,
      inStock: 1,
      lowStock: 1,
      outOfStock: 1,
      totalUnits: 23,
    };
    const { api, calls } = client(() =>
      json({ summary, lowStockProducts: [LOW] }),
    );
    assert.deepEqual(await api.getDashboard(), {
      summary,
      lowStockProducts: [LOW],
    });
    assert.equal(calls[0]?.url, '/api/admin/inventory/dashboard');
    assert.equal(calls[0]?.init.method, 'GET');
  });

  it('lists products', async () => {
    const { api, calls } = client(() => json({ products: ITEMS }));
    assert.deepEqual(await api.listProducts(), ITEMS);
    assert.equal(calls[0]?.url, '/api/admin/inventory');
  });

  it('updates stock with an optional threshold', async () => {
    const updated = item({ stock: 9 });
    const { api, calls } = client(() => json({ product: updated }));
    assert.deepEqual(
      await api.updateStock('p 1', { stock: 9, lowStockThreshold: 2 }),
      updated,
    );
    assert.equal(calls[0]?.url, '/api/admin/inventory/p%201/stock');
    assert.equal(calls[0]?.init.method, 'PUT');
    assert.deepEqual(JSON.parse(String(calls[0]?.init.body)), {
      stock: 9,
      lowStockThreshold: 2,
    });

    await api.updateStock('p-1', { stock: 4 });
    assert.deepEqual(JSON.parse(String(calls[1]?.init.body)), { stock: 4 });
  });

  it('marks a product out of stock and undoes it', async () => {
    const { api, calls } = client(() => json({ product: OUT }));
    await api.setOutOfStock('p-3', true);
    await api.setOutOfStock('p-3', false);
    assert.equal(calls[0]?.url, '/api/admin/inventory/p-3/out-of-stock');
    assert.deepEqual(JSON.parse(String(calls[0]?.init.body)), {
      outOfStock: true,
    });
    assert.deepEqual(JSON.parse(String(calls[1]?.init.body)), {
      outOfStock: false,
    });
  });

  it('treats 401 as an expired session, for every call', async () => {
    const { api } = client(() => json({}, 401));
    await assert.rejects(api.getDashboard(), SessionExpiredError);
    await assert.rejects(api.listProducts(), SessionExpiredError);
    await assert.rejects(
      api.updateStock('p-1', { stock: 1 }),
      SessionExpiredError,
    );
    await assert.rejects(api.setOutOfStock('p-1', true), SessionExpiredError);
  });

  it('treats 403 as access denied, for every call', async () => {
    const { api } = client(() => json({}, 403));
    await assert.rejects(api.getDashboard(), AccessDeniedError);
    await assert.rejects(api.listProducts(), AccessDeniedError);
    await assert.rejects(
      api.updateStock('p-1', { stock: 1 }),
      AccessDeniedError,
    );
    await assert.rejects(api.setOutOfStock('p-1', true), AccessDeniedError);
  });

  it('turns 400 into field errors', async () => {
    const { api } = client(() =>
      json(
        {
          message: 'Validation failed',
          errors: [
            { field: 'stock', message: 'stock must be between 0 and 1000000' },
            { field: 'other', message: 'ignored' },
          ],
        },
        400,
      ),
    );
    await assert.rejects(api.updateStock('p-1', { stock: 5 }), (error) => {
      assert.ok(error instanceof StockValidationError);
      assert.equal(error.message, 'Validation failed');
      assert.deepEqual(error.fieldErrors, {
        stock: 'stock must be between 0 and 1000000',
      });
      return true;
    });
  });

  it('turns 404 into a not-found error', async () => {
    const { api } = client(() => json({ message: 'Not found' }, 404));
    await assert.rejects(
      api.updateStock('gone', { stock: 5 }),
      StockNotFoundError,
    );
  });

  it('reports 5xx, network failures and unreadable bodies as retryable', async () => {
    await assert.rejects(
      client(() => json({}, 500)).api.listProducts(),
      ServiceUnavailableError,
    );
    await assert.rejects(
      client(() => json({}, 503)).api.getDashboard(),
      ServiceUnavailableError,
    );

    const offline = createStockApi({
      fetchImpl: async () => {
        throw new TypeError('Failed to fetch');
      },
    });
    await assert.rejects(offline.listProducts(), ServiceUnavailableError);

    await assert.rejects(
      client(() => new Response('<html>', { status: 200 })).api.listProducts(),
      ServiceUnavailableError,
    );
    await assert.rejects(
      client(() => json({ products: [{ id: 1 }] })).api.listProducts(),
      ServiceUnavailableError,
    );
    await assert.rejects(
      client(() => json({ product: { id: 1 } })).api.updateStock('p-1', {
        stock: 1,
      }),
      ServiceUnavailableError,
    );
  });

  it('never leaks the request payload into errors', async () => {
    const { api } = client(() => json({}, 500));
    await assert.rejects(api.updateStock('p-1', { stock: 123456 }), (error) => {
      assert.ok(error instanceof Error);
      assert.doesNotMatch(error.message, /123456/);
      return true;
    });
  });
});
