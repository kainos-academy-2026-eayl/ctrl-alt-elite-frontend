import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, it, vi } from 'vitest';
import { createApp } from '../src/app';
import {
  buildProductPayload,
  deleteProduct,
  emptyProductForm,
  filterProducts,
  findProduct,
  listProducts,
  type Product,
  type ProductForm,
  parseProduct,
  parseProductList,
  readInventoryQuery,
  safeImageSource,
  saveProduct,
  stockLevel,
  validateImageFile,
  validateProductForm,
} from '../src/util/adminInventory';
import {
  renderInventoryList,
  renderProductForm,
} from '../src/util/adminInventoryViews';
import { UnauthorisedError } from '../src/util/supportTickets';

const PNG = 'data:image/png;base64,iVBORw0KGgo=';

function product(overrides: Partial<Product> = {}): Product {
  return {
    id: 'p-1',
    name: 'Desk Lamp',
    category: 'Home',
    description: 'A lamp.',
    price: 24.99,
    stock: 8,
    image: PNG,
    ...overrides,
  };
}

function validForm(overrides: Partial<ProductForm> = {}): ProductForm {
  return {
    name: 'Mug',
    category: 'Kitchen',
    description: '',
    price: '5.50',
    stock: '12',
    ...overrides,
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('parsing products', () => {
  it('accepts a product, defaulting optional fields', () => {
    assert.deepEqual(
      parseProduct({ id: 7, name: ' Mug ', price: '5.5', stock: 3 }),
      {
        id: '7',
        name: 'Mug',
        category: 'Uncategorised',
        description: '',
        price: 5.5,
        stock: 3,
        image: '',
      },
    );
  });

  it('rejects malformed products', () => {
    for (const value of [
      null,
      'x',
      { id: 'p-1', price: 1, stock: 1 },
      { id: 'bad id', name: 'x', price: 1, stock: 1 },
      { id: 'p-1', name: 'x', price: 'abc', stock: 1 },
      { id: 'p-1', name: 'x', price: 1 },
    ]) {
      assert.equal(parseProduct(value), null, JSON.stringify(value));
    }
  });

  it('accepts an array or { products } and fails the whole list on a bad entry', () => {
    const entry = { id: 'p-1', name: 'x', price: 1, stock: 1 };
    assert.equal(parseProductList([entry]).length, 1);
    assert.equal(parseProductList({ products: [entry] }).length, 1);
    assert.throws(() => parseProductList({ products: [entry, {}] }));
    assert.throws(() => parseProductList({ nope: true }));
  });

  it('only keeps embedded or https images', () => {
    assert.equal(safeImageSource(PNG), PNG);
    assert.equal(
      safeImageSource('https://cdn.example.com/a.png'),
      'https://cdn.example.com/a.png',
    );
    for (const bad of [
      'javascript:alert(1)',
      'data:text/html;base64,PHNjcmlwdD4=',
      'http://insecure.example.com/a.png',
      'https://x.com/a" onerror="x',
      42,
    ]) {
      assert.equal(safeImageSource(bad), '', String(bad));
    }
  });
});

describe('filtering and stock', () => {
  const products = [
    product(),
    product({ id: 'p-2', name: 'Mug', category: 'Kitchen', stock: 0 }),
  ];

  it('filters by name, category and both', () => {
    const none = { search: '', category: '' };
    assert.equal(filterProducts(products, none).length, 2);
    assert.equal(
      filterProducts(products, { search: 'LAMP', category: '' })[0]?.id,
      'p-1',
    );
    assert.equal(
      filterProducts(products, { search: 'kitch', category: '' })[0]?.id,
      'p-2',
    );
    assert.equal(
      filterProducts(products, { search: 'lamp', category: 'Kitchen' }).length,
      0,
    );
  });

  it('reads and bounds the query string', () => {
    const query = readInventoryQuery(
      new URLSearchParams({ q: ` ${'a'.repeat(300)} `, category: ' Home ' }),
    );
    assert.equal(query.search.length, 200);
    assert.equal(query.category, 'Home');
  });

  it('classifies stock levels', () => {
    assert.equal(stockLevel(0), 'out');
    assert.equal(stockLevel(5), 'low');
    assert.equal(stockLevel(6), 'in');
  });
});

describe('validating the product form', () => {
  const create = { imageRequired: true, image: PNG };

  it('accepts a valid product and builds a trimmed payload', () => {
    const form = validForm({ name: ' Mug ', description: ' Holds tea ' });
    assert.deepEqual(validateProductForm(form, create), {});
    assert.deepEqual(buildProductPayload(form, PNG), {
      name: 'Mug',
      category: 'Kitchen',
      description: 'Holds tea',
      price: 5.5,
      stock: 12,
      image: PNG,
    });
  });

  it('omits the image from the payload when none was chosen', () => {
    assert.equal('image' in buildProductPayload(validForm(), undefined), false);
  });

  it('flags each invalid field', () => {
    const errors = validateProductForm(
      validForm({ name: ' ', category: '', price: '1.234', stock: '-1' }),
      { imageRequired: true, image: undefined },
    );
    assert.deepEqual(Object.keys(errors).sort(), [
      'category',
      'image',
      'name',
      'price',
      'stock',
    ]);
    for (const price of ['', 'abc', '-5', '1,5', '1000000.01', '5.']) {
      assert.ok(
        validateProductForm(validForm({ price }), create).price,
        `price ${price}`,
      );
    }
    for (const stock of ['', '1.5', 'x', '1000001']) {
      assert.ok(
        validateProductForm(validForm({ stock }), create).stock,
        `stock ${stock}`,
      );
    }
  });

  it('only requires an image when creating', () => {
    const edit = { imageRequired: false, image: undefined };
    assert.deepEqual(validateProductForm(validForm(), edit), {});
    assert.deepEqual(emptyProductForm().stock, '0');
  });

  it('validates image files', () => {
    assert.equal(validateImageFile({ type: 'image/png', size: 1000 }), null);
    assert.ok(validateImageFile({ type: 'image/gif', size: 1000 }));
    assert.ok(validateImageFile({ type: 'image/png', size: 1_000_001 }));
    assert.ok(validateImageFile({ type: 'image/png', size: 0 }));
  });
});

describe('inventory API calls', () => {
  it('lists products sorted by name', async () => {
    const fetchImpl = vi.fn(async (_url: string) =>
      jsonResponse({
        products: [
          { id: 'b', name: 'Zebra', price: 1, stock: 1 },
          { id: 'a', name: 'Apple', price: 1, stock: 1 },
        ],
      }),
    );
    const products = await listProducts({
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    assert.deepEqual(
      products.map((item) => item.name),
      ['Apple', 'Zebra'],
    );
    assert.equal(fetchImpl.mock.calls[0]?.[0], '/api/admin/products');
  });

  it('redirects 401s and throws on server errors', async () => {
    const respond = (status: number) =>
      (async () => jsonResponse({}, status)) as unknown as typeof fetch;
    await assert.rejects(
      listProducts({ fetchImpl: respond(401) }),
      UnauthorisedError,
    );
    await assert.rejects(listProducts({ fetchImpl: respond(500) }));
  });

  it('finds a product, returning undefined for 404', async () => {
    const found = await findProduct('p 1', {
      fetchImpl: (async (url: string) => {
        assert.equal(url, '/api/admin/products/p%201');
        return jsonResponse({
          product: { id: 'p-1', name: 'x', price: 1, stock: 1 },
        });
      }) as unknown as typeof fetch,
    });
    assert.equal(found?.id, 'p-1');
    assert.equal(
      await findProduct('missing', {
        fetchImpl: (async () =>
          jsonResponse({}, 404)) as unknown as typeof fetch,
      }),
      undefined,
    );
  });

  it('creates with POST and updates with PUT', async () => {
    const calls: { url: string; method: string; body: unknown }[] = [];
    const fetchImpl = (async (url: string, init: RequestInit) => {
      calls.push({
        url,
        method: String(init.method),
        body: JSON.parse(String(init.body)),
      });
      return jsonResponse(
        { product: { id: 'p-9', name: 'Mug', price: 5.5, stock: 12 } },
        init.method === 'POST' ? 201 : 200,
      );
    }) as unknown as typeof fetch;
    const payload = buildProductPayload(validForm(), PNG);

    const created = await saveProduct(null, payload, { fetchImpl });
    assert.equal(created.ok, true);
    assert.equal(created.product?.id, 'p-9');
    const updated = await saveProduct('p-9', payload, { fetchImpl });
    assert.equal(updated.ok, true);

    assert.deepEqual(
      calls.map((call) => [call.method, call.url]),
      [
        ['POST', '/api/admin/products'],
        ['PUT', '/api/admin/products/p-9'],
      ],
    );
    assert.equal((calls[0]?.body as { price: number } | undefined)?.price, 5.5);
  });

  it('shows backend 4xx messages but hides server errors and network failures', async () => {
    const payload = buildProductPayload(validForm(), PNG);
    const run = (response: () => Promise<Response>) =>
      saveProduct(null, payload, {
        fetchImpl: response as unknown as typeof fetch,
      });
    assert.equal(
      (await run(async () => jsonResponse({ message: 'Price is wrong.' }, 400)))
        .message,
      'Price is wrong.',
    );
    assert.match(
      (await run(async () => jsonResponse({ message: 'SQL exploded' }, 500)))
        .message,
      /Unable to save/,
    );
    assert.match(
      (
        await run(async () => {
          throw new Error('offline');
        })
      ).message,
      /Unable to save/,
    );
    const expired = await run(async () => jsonResponse({}, 401));
    assert.equal(expired.unauthorised, true);
  });

  it('deletes with DELETE and surfaces the in-use conflict', async () => {
    const calls: string[] = [];
    const ok = await deleteProduct('p-1', {
      fetchImpl: (async (url: string, init: RequestInit) => {
        calls.push(`${init.method} ${url}`);
        return jsonResponse({ message: 'Product deleted.' });
      }) as unknown as typeof fetch,
    });
    assert.equal(ok.ok, true);
    assert.deepEqual(calls, ['DELETE /api/admin/products/p-1']);

    const conflict = await deleteProduct('p-1', {
      fetchImpl: (async () =>
        jsonResponse(
          { message: 'This product has been ordered and cannot be deleted.' },
          409,
        )) as unknown as typeof fetch,
    });
    assert.equal(conflict.ok, false);
    assert.match(conflict.message, /has been ordered/);
  });
});

describe('inventory views', () => {
  it('escapes product text everywhere it is rendered', () => {
    const hostile = product({
      name: '<img src=x onerror=alert(1)>',
      category: '"><script>1</script>',
      description: '<b>hi</b>',
    });
    const list = renderInventoryList([hostile]);
    const form = renderProductForm(
      {
        name: hostile.name,
        category: hostile.category,
        description: hostile.description,
        price: '1.00',
        stock: '1',
      },
      hostile,
      [hostile.category],
    );
    for (const html of [list, form]) {
      assert.doesNotMatch(html, /<img src=x|<script>1|<b>hi/);
    }
    assert.match(list, /&lt;img src=x onerror=alert\(1\)&gt;/);
  });

  it('links each row to its edit page and exposes a delete button', () => {
    const html = renderInventoryList([product({ id: 'p-1', stock: 0 })]);
    assert.match(html, /href="\/admin\/inventory\/p-1"/);
    assert.match(html, /data-delete-product="p-1"/);
    assert.match(html, /is-out/);
  });

  it('requires an image on create but not on edit', () => {
    const create = renderProductForm(emptyProductForm(), undefined, []);
    assert.match(create, /id="image"[^>]*required/);
    assert.match(create, /Add product<\/button>/);
    const edit = renderProductForm(validForm(), product(), []);
    assert.doesNotMatch(edit, /id="image"[^>]*required/);
    assert.match(edit, /Save changes<\/button>/);
    assert.match(edit, /Current product image/);
  });
});

describe('inventory pages', () => {
  let backend: Server;
  let frontend: Server;
  let base: string;

  function listen(server: Server): Promise<string> {
    return new Promise((resolve) => {
      server.listen(0, '127.0.0.1', () => {
        resolve(`http://127.0.0.1:${(server.address() as AddressInfo).port}`);
      });
    });
  }

  beforeAll(async () => {
    backend = createServer((req, res) => {
      const ok = req.headers.authorization?.endsWith('admin-token');
      if (req.url === '/api/admin/profile' && ok) {
        res.end(
          JSON.stringify({
            name: 'Ada Lovelace',
            email: 'ada@example.com',
            role: 'ADMIN',
          }),
        );
        return;
      }
      res.statusCode =
        req.url === '/api/admin/customers?pageSize=1' && ok ? 200 : 401;
      res.end('{}');
    });
    frontend = createServer(createApp(await listen(backend)));
    base = await listen(frontend);
  });

  afterAll(() => {
    backend.close();
    frontend.close();
  });

  const admin = { headers: { cookie: 'auth_token=admin-token' } };

  it('serves the list shell with its controller and add link', async () => {
    const res = await fetch(`${base}/admin/inventory`, admin);
    assert.equal(res.status, 200);
    const html = await res.text();
    assert.match(html, /<h1>Inventory<\/h1>/);
    assert.match(html, /href="\/admin\/inventory\/new"/);
    assert.match(html, /\/controllers\/adminInventory\.js/);
    assert.match(html, /data-inventory-results/);
    assert.match(html, /admin-nav-link is-active" href="\/admin\/inventory"/);
  });

  it('serves the form shell for new and existing products', async () => {
    for (const path of ['/admin/inventory/new', '/admin/inventory/p-1']) {
      const res = await fetch(`${base}${path}`, admin);
      assert.equal(res.status, 200, path);
      const html = await res.text();
      assert.match(html, /\/controllers\/adminInventoryForm\.js/);
      assert.match(html, /data-product-page/);
    }
  });

  it('requires an admin session', async () => {
    for (const path of ['/admin/inventory', '/admin/inventory/new']) {
      const res = await fetch(`${base}${path}`, { redirect: 'manual' });
      assert.equal(res.status, 303, path);
      const bad = await fetch(`${base}${path}`, {
        headers: { cookie: 'auth_token=customer-token' },
        redirect: 'manual',
      });
      assert.equal(bad.status, 303, path);
    }
  });
});
