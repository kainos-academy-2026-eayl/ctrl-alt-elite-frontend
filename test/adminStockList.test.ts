import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { describe, it, vi } from 'vitest';
import type { StockItem } from '../src/util/adminStock';

class ElementStub {
  innerHTML = '';
  textContent = '';
  hidden = false;
  value = '';
  checked = false;
  dataset: Record<string, string> = {};
  listeners = new Map<string, (event: unknown) => void>();

  addEventListener(type: string, listener: (event: unknown) => void): void {
    this.listeners.set(type, listener);
  }

  dispatch(type: string, target: ElementStub = this): void {
    this.listeners.get(type)?.({ target, preventDefault() {} });
  }

  closest(selector: string): ElementStub | null {
    const attribute = selector.slice(1, -1).replace(/^data-/, '');
    const key = attribute.replace(/-([a-z])/g, (_, letter: string) =>
      letter.toUpperCase(),
    );
    return key in this.dataset ? this : null;
  }

  contains(): boolean {
    return false;
  }

  querySelectorAll(): ElementStub[] {
    return [];
  }
}

class InputStub extends ElementStub {}

interface PendingRequest {
  url: string;
  method: string;
  body: string | undefined;
  reply: (body: unknown, status?: number) => void;
}

const product: StockItem = {
  id: 'p-1',
  name: 'Hoodie',
  category: 'Clothing',
  stock: 20,
  lowStockThreshold: 5,
  outOfStock: false,
  lowStock: false,
  status: 'IN_STOCK',
};

function dashboard(totalUnits: number) {
  return {
    summary: {
      totalProducts: 1,
      inStock: 1,
      lowStock: 0,
      outOfStock: 0,
      totalUnits,
    },
    lowStockProducts: [],
  };
}

const settle = () => new Promise<void>((resolve) => setImmediate(resolve));

function setup() {
  const results = new ElementStub();
  const summary = new ElementStub();
  const count = new ElementStub();
  const filters = new ElementStub();
  const search = new InputStub();
  const status = new ElementStub();
  const lowOnly = new InputStub();
  const elements: Record<string, ElementStub> = {
    '[data-stock-results]': results,
    '[data-stock-summary]': summary,
    '[data-stock-count]': count,
    '[data-stock-notice]': new ElementStub(),
    '[data-stock-error]': new ElementStub(),
    '[data-stock-filters]': filters,
    '#stock-search': search,
    '#stock-status': status,
    '#stock-low-only': lowOnly,
  };
  const requests: PendingRequest[] = [];
  runInNewContext(
    readFileSync('dist/public/controllers/adminStockList.js', 'utf8'),
    {
      document: {
        querySelector: (selector: string) => elements[selector],
        activeElement: null,
      },
      window: {
        location: { search: '', pathname: '/admin/stock', assign: vi.fn() },
        history: { replaceState: vi.fn() },
        confirm: () => true,
      },
      Element: ElementStub,
      HTMLInputElement: InputStub,
      HTMLButtonElement: ElementStub,
      URLSearchParams,
      AbortSignal,
      console: { error: vi.fn() },
      fetch: (url: string, init: { method: string; body?: string }) =>
        new Promise<Response>((resolve) => {
          requests.push({
            url,
            method: init.method,
            body: init.body,
            reply: (body, status = 200) =>
              resolve(new Response(JSON.stringify(body), { status })),
          });
        }),
    },
  );
  function click(dataset: Record<string, string>): void {
    const target = new ElementStub();
    target.dataset = dataset;
    results.dispatch('click', target);
  }
  async function load(items = [product]): Promise<void> {
    requests[0]?.reply({ products: items });
    requests[1]?.reply(dashboard(20));
    await settle();
  }
  function beginSave(id = product.id): PendingRequest {
    click({ editStock: id });
    click({ saveStock: id });
    return requests[requests.length - 1] as PendingRequest;
  }
  return {
    results,
    summary,
    count,
    filters,
    search,
    status,
    lowOnly,
    requests,
    click,
    load,
    beginSave,
  };
}

describe('stock list controller', () => {
  for (const status of [503, 403]) {
    it(`preserves the ${status} load error when filters change`, async () => {
      const page = setup();
      page.requests[0]?.reply({}, status);
      await settle();
      const error = page.results.innerHTML;
      assert.match(error, status === 403 ? /Access denied/ : /Try again/);

      page.search.value = 'hoodie';
      page.search.dispatch('input');
      page.status.value = 'LOW_STOCK';
      page.status.dispatch('change');
      page.lowOnly.checked = true;
      page.lowOnly.dispatch('change');
      page.filters.dispatch('submit');

      assert.equal(page.results.innerHTML, error);
      assert.equal(page.count.hidden, true);
    });
  }

  it('keeps the loading view and applies filters after a successful retry', async () => {
    const page = setup();
    page.search.value = 'missing';
    page.search.dispatch('input');
    assert.match(page.results.innerHTML, /Loading inventory/);
    page.requests[0]?.reply({}, 503);
    await settle();
    page.click({ retry: '' });
    page.requests[2]?.reply({ products: [product] });
    page.requests[3]?.reply(dashboard(20));
    await settle();
    assert.match(page.results.innerHTML, /No products match/);
    assert.equal(page.count.hidden, false);
    page.search.value = '';
    page.search.dispatch('input');
    assert.match(page.results.innerHTML, /Hoodie/);
  });

  for (const mutation of ['save', 'out-of-stock']) {
    it(`invalidates a pending refresh when a ${mutation} mutation starts`, async () => {
      const page = setup();
      await page.load();
      page.beginSave().reply({ product: { ...product, stock: 30 } });
      await settle();
      if (mutation === 'save') {
        page.beginSave();
      } else {
        page.click({ outOfStock: product.id, mark: 'true' });
      }
      const html = page.results.innerHTML;
      const summary = page.summary.innerHTML;
      page.requests[3]?.reply({ products: [product] });
      page.requests[4]?.reply(dashboard(20));
      await settle();
      assert.equal(page.results.innerHTML, html);
      assert.equal(page.summary.innerHTML, summary);

      page.requests[5]?.reply({ product: { ...product, stock: 40 } });
      await settle();
      page.requests[6]?.reply({ products: [{ ...product, stock: 40 }] });
      page.requests[7]?.reply(dashboard(40));
      await settle();
      page.click({ editStock: product.id });
      assert.match(page.results.innerHTML, /value="40"/);
      assert.notEqual(page.summary.innerHTML, summary);
    });
  }

  it('keeps the newest refresh when mutation completions overlap', async () => {
    const page = setup();
    const other = { ...product, id: 'p-2', name: 'Cap' };
    await page.load([product, other]);
    const first = page.beginSave();
    page.click({ outOfStock: other.id, mark: 'true' });
    const second = page.requests[3];
    first.reply({ product: { ...product, stock: 30 } });
    await settle();
    second?.reply({ product: { ...other, outOfStock: true } });
    await settle();
    const latest = [
      { ...product, stock: 30 },
      { ...other, outOfStock: true },
    ];
    page.requests[6]?.reply({ products: latest });
    page.requests[7]?.reply(dashboard(50));
    await settle();
    const html = page.results.innerHTML;
    const summary = page.summary.innerHTML;
    page.requests[4]?.reply({ products: [product, other] });
    page.requests[5]?.reply(dashboard(40));
    await settle();
    assert.equal(page.results.innerHTML, html);
    assert.equal(page.summary.innerHTML, summary);
    page.beginSave();
    assert.deepEqual(JSON.parse(page.requests[8]?.body ?? '{}'), {
      stock: 30,
      lowStockThreshold: 5,
    });
  });

  it('ignores access errors from invalidated refreshes', async () => {
    const page = setup();
    await page.load();
    page.beginSave().reply({ product });
    await settle();
    page.beginSave();
    const html = page.results.innerHTML;
    page.requests[3]?.reply({}, 403);
    await settle();
    assert.equal(page.results.innerHTML, html);
  });

  it('preserves access denial from a mutation when filters change', async () => {
    const page = setup();
    await page.load();
    page.beginSave().reply({}, 403);
    await settle();
    assert.match(page.results.innerHTML, /Access denied/);
    page.search.dispatch('input');
    assert.match(page.results.innerHTML, /Access denied/);
    assert.equal(page.count.hidden, true);
  });
});
