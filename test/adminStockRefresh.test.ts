import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { describe, it } from 'vitest';
import type { StockItem } from '../src/util/adminStock';
import { renderSummaryCards } from '../src/util/adminStockViews';

const controller = readFileSync(
  new URL('../dist/public/controllers/adminStockList.js', import.meta.url),
  'utf8',
);

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

class TestElement {
  innerHTML = '';
  textContent = '';
  hidden = false;
  value = '';
  checked = false;
  listeners = new Map<string, (event: unknown) => void>();

  constructor(
    readonly selector = '',
    readonly dataset: Record<string, string> = {},
  ) {}

  addEventListener(type: string, listener: (event: unknown) => void) {
    this.listeners.set(type, listener);
  }

  closest(selector: string) {
    return selector === this.selector ? this : null;
  }

  querySelectorAll() {
    return [];
  }
}

function item(stock: number, lowStockThreshold = 5): StockItem {
  return {
    id: 'p-1',
    name: 'Hoodie',
    category: 'Clothing',
    stock,
    lowStockThreshold,
    outOfStock: false,
    lowStock: false,
    status: 'IN_STOCK',
  };
}

function dashboard(product: StockItem) {
  return {
    summary: {
      totalProducts: 1,
      inStock: 1,
      lowStock: 0,
      outOfStock: 0,
      totalUnits: product.stock,
    },
    lowStockProducts: [],
  };
}

const settle = () => new Promise<void>((resolve) => setImmediate(resolve));

async function setup() {
  const elements = new Map<string, TestElement>();
  const lists: ReturnType<typeof deferred<Response>>[] = [];
  const dashboards: ReturnType<typeof deferred<Response>>[] = [];
  const writes: {
    response: ReturnType<typeof deferred<Response>>;
    body: string;
  }[] = [];
  runInNewContext(controller, {
    URLSearchParams,
    AbortSignal,
    console,
    Element: TestElement,
    HTMLInputElement: TestElement,
    HTMLButtonElement: TestElement,
    document: {
      activeElement: null,
      querySelector(selector: string) {
        const element = new TestElement();
        elements.set(selector, element);
        return element;
      },
    },
    window: {
      location: { search: '', pathname: '/admin/stock' },
      confirm: () => true,
    },
    fetch(url: string, init: { method: string; body: string }) {
      const response = deferred<Response>();
      if (init.method === 'PATCH') writes.push({ response, body: init.body });
      else if (url.endsWith('/dashboard')) dashboards.push(response);
      else lists.push(response);
      return response.promise;
    },
  });
  const results = elements.get('[data-stock-results]');
  const summary = elements.get('[data-stock-summary]');
  assert.ok(results);
  assert.ok(summary);

  function click(action: string) {
    results?.listeners.get('click')?.({
      target: new TestElement(`[data-${action}]`, {
        [action.replace(/-([a-z])/g, (_, letter: string) =>
          letter.toUpperCase(),
        )]: 'p-1',
        mark: 'true',
      }),
    });
  }

  function completeRead(index: number, product: StockItem) {
    assert.ok(lists[index]);
    assert.ok(dashboards[index]);
    lists[index].resolve(Response.json({ products: [product] }));
    dashboards[index].resolve(Response.json(dashboard(product)));
  }

  function completeWrite(index: number, product: StockItem) {
    assert.ok(writes[index]);
    writes[index].response.resolve(Response.json({ product }));
  }

  function mutate(action: 'save' | 'toggle') {
    if (action === 'save') {
      click('edit-stock');
      click('save-stock');
    } else {
      click('out-of-stock');
    }
  }

  completeRead(0, item(20));
  await settle();
  return {
    results,
    summary,
    lists,
    writes,
    click,
    mutate,
    completeRead,
    completeWrite,
  };
}

describe('stock refresh generations', () => {
  it.each(['save', 'toggle'] as const)(
    'invalidates outstanding reads as soon as a %s starts',
    async (action) => {
      const page = await setup();
      page.mutate('save');
      page.completeWrite(0, item(30, 7));
      await settle();
      page.mutate(action);
      const pendingView = page.results.innerHTML;
      const pendingSummary = page.summary.innerHTML;
      page.completeRead(1, item(20));
      await settle();
      assert.equal(page.results.innerHTML, pendingView);
      assert.equal(page.summary.innerHTML, pendingSummary);
      page.completeWrite(1, item(40, 9));
      await settle();
      page.completeRead(2, item(40, 9));
      await settle();
      assert.equal(
        page.summary.innerHTML,
        renderSummaryCards(dashboard(item(40)).summary),
      );
    },
  );

  it.each(['save', 'toggle'] as const)(
    'keeps the newest %s refresh and uses its values for the next edit',
    async (action) => {
      const page = await setup();
      page.mutate('save');
      page.completeWrite(0, item(30, 7));
      await settle();
      page.mutate(action);
      page.completeWrite(1, item(40, 9));
      await settle();
      page.completeRead(2, item(40, 9));
      await settle();
      const latestView = page.results.innerHTML;
      const latestSummary = page.summary.innerHTML;
      page.completeRead(1, item(30, 7));
      await settle();
      assert.equal(page.results.innerHTML, latestView);
      assert.equal(page.summary.innerHTML, latestSummary);
      page.mutate('save');
      assert.deepEqual(JSON.parse(page.writes[2]?.body ?? ''), {
        stock: 40,
        lowStockThreshold: 9,
      });
    },
  );

  it('ignores stale access-denied responses after a new mutation starts', async () => {
    const page = await setup();
    page.mutate('save');
    page.completeWrite(0, item(30));
    await settle();
    page.mutate('toggle');
    const pendingView = page.results.innerHTML;
    assert.ok(page.lists[1]);
    page.lists[1].resolve(new Response(null, { status: 403 }));
    await settle();
    assert.equal(page.results.innerHTML, pendingView);
  });

  it('refreshes the final state when overlapping mutations finish out of order', async () => {
    const page = await setup();
    page.mutate('save');
    page.mutate('toggle');
    page.completeWrite(1, item(20));
    await settle();
    page.completeWrite(0, item(40, 9));
    await settle();
    page.completeRead(2, item(40, 9));
    await settle();
    page.completeRead(1, item(20));
    await settle();
    assert.equal(
      page.summary.innerHTML,
      renderSummaryCards(dashboard(item(40)).summary),
    );
    page.mutate('save');
    assert.deepEqual(JSON.parse(page.writes[2]?.body ?? ''), {
      stock: 40,
      lowStockThreshold: 9,
    });
  });
});
