import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, it } from 'vitest';
import { createApp } from '../src/app';
import { createApiCustomerSource } from '../src/util/customerApi';
import {
  createInMemoryCustomerSource,
  FIXTURE_CUSTOMERS,
} from './customerFixtures';

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

describe('customer API source', () => {
  let backend: Server;
  let backendOrigin: string;
  const requests: string[] = [];
  let mode: 'ok' | 'error' | 'malformed' = 'ok';

  beforeAll(async () => {
    const reference = createInMemoryCustomerSource();
    backend = createServer(async (req, res) => {
      const url = new URL(req.url ?? '/', 'http://localhost');
      requests.push(`${url.pathname}${url.search}`);
      res.setHeader('content-type', 'application/json');

      if (mode === 'error') {
        res.statusCode = 503;
        res.end(
          JSON.stringify({ message: 'Service temporarily unavailable.' }),
        );
        return;
      }
      if (mode === 'malformed') {
        res.end(JSON.stringify({ unexpected: true }));
        return;
      }

      if (url.pathname === '/api/customers') {
        const pageSize = Number(url.searchParams.get('pageSize') ?? 10);
        const requestedPage = Number(url.searchParams.get('page') ?? 1);
        const query = {
          search: url.searchParams.get('search') ?? '',
          email: url.searchParams.get('email') ?? '',
          sort: (url.searchParams.get('sort') ?? 'newest') as 'newest',
          pageSize,
        };
        const everything = await reference.query({
          ...query,
          page: 1,
          pageSize: 1000,
        });
        const total = everything.matchingCustomers;
        const totalPages = Math.ceil(total / pageSize);
        // Like the real backend, a page past the end is returned as-is and empty.
        const start = (requestedPage - 1) * pageSize;
        res.end(
          JSON.stringify({
            customers: everything.customers.slice(start, start + pageSize),
            page: requestedPage,
            pageSize,
            total,
            totalPages,
          }),
        );
        return;
      }

      const id = url.pathname.replace('/api/customers/', '');
      const customer = await reference.findById(decodeURIComponent(id));
      if (!customer) {
        res.statusCode = 404;
        res.end(JSON.stringify({ message: 'Customer not found.' }));
        return;
      }
      res.end(JSON.stringify({ customer }));
    });
    backendOrigin = await listen(backend);
  });

  afterAll(async () => {
    await close(backend);
  });

  const baseQuery = {
    search: '',
    email: '',
    sort: 'nameAsc' as const,
    page: 1,
    pageSize: 10,
  };

  it('sends the contract query parameters and maps the list response', async () => {
    mode = 'ok';
    requests.length = 0;
    const source = createApiCustomerSource(backendOrigin);
    const result = await source.query({
      ...baseQuery,
      search: 'ben',
      email: 'okafor',
      sort: 'newest',
      page: 1,
    });
    const params = new URL(requests[0] as string, 'http://x').searchParams;
    assert.equal(params.get('search'), 'ben');
    assert.equal(params.get('email'), 'okafor');
    assert.equal(params.get('sort'), 'newest');
    assert.equal(params.get('page'), '1');
    assert.equal(params.get('pageSize'), '10');
    assert.equal(result.matchingCustomers, 1);
    assert.equal(result.customers[0]?.lastName, 'Okafor');
  });

  it('omits empty search and email parameters', async () => {
    mode = 'ok';
    requests.length = 0;
    await createApiCustomerSource(backendOrigin).query(baseQuery);
    const params = new URL(requests[0] as string, 'http://x').searchParams;
    assert.equal(params.has('search'), false);
    assert.equal(params.has('email'), false);
  });

  it('uses a single request for the total when unfiltered', async () => {
    mode = 'ok';
    requests.length = 0;
    const result =
      await createApiCustomerSource(backendOrigin).query(baseQuery);
    assert.equal(requests.length, 1);
    assert.equal(result.totalCustomers, FIXTURE_CUSTOMERS.length);
    assert.equal(result.totalPages, 3);
  });

  it('fetches the overall total separately when filtered', async () => {
    mode = 'ok';
    requests.length = 0;
    const result = await createApiCustomerSource(backendOrigin).query({
      ...baseQuery,
      search: 'amelia',
    });
    assert.equal(requests.length, 2);
    assert.equal(result.matchingCustomers, 1);
    assert.equal(result.totalCustomers, FIXTURE_CUSTOMERS.length);
  });

  it('falls back to the last page when the requested page is past the end', async () => {
    mode = 'ok';
    const result = await createApiCustomerSource(backendOrigin).query({
      ...baseQuery,
      page: 99,
    });
    assert.equal(result.page, 3);
    assert.equal(result.customers.length, 7);
  });

  it('reports one empty page when nothing matches', async () => {
    mode = 'ok';
    const result = await createApiCustomerSource(backendOrigin).query({
      ...baseQuery,
      search: 'zzzz',
    });
    assert.equal(result.customers.length, 0);
    assert.equal(result.totalPages, 1);
  });

  it('finds a customer by id and returns undefined on 404', async () => {
    mode = 'ok';
    const source = createApiCustomerSource(backendOrigin);
    assert.equal((await source.findById('c-1'))?.firstName, 'Amelia');
    assert.equal(await source.findById('missing'), undefined);
  });

  it('rejects on backend errors and unexpected response shapes', async () => {
    const source = createApiCustomerSource(backendOrigin);
    mode = 'error';
    await assert.rejects(source.query(baseQuery), /status 503/);
    await assert.rejects(source.findById('c-1'), /status 503/);
    mode = 'malformed';
    await assert.rejects(source.query(baseQuery), /expected format/);
    await assert.rejects(source.findById('c-1'), /expected format/);
    mode = 'ok';
  });

  it('powers the admin pages through createApp by default', async () => {
    mode = 'ok';
    const app = createServer(createApp(backendOrigin));
    const origin = await listen(app);
    try {
      const list = await (
        await fetch(`${origin}/admin/customers?q=ben`)
      ).text();
      assert.match(list, /Ben Okafor/);
      const detail = await (
        await fetch(`${origin}/admin/customers/c-2`)
      ).text();
      assert.match(detail, /ben\.okafor@example\.com/);
      assert.equal((await fetch(`${origin}/admin/customers/nope`)).status, 404);

      mode = 'error';
      const originalError = console.error;
      console.error = () => {};
      try {
        const failed = await fetch(`${origin}/admin/customers`);
        assert.equal(failed.status, 503);
        assert.match(await failed.text(), /Unable to load customers/);
      } finally {
        console.error = originalError;
      }
    } finally {
      mode = 'ok';
      await close(app);
    }
  });
});
