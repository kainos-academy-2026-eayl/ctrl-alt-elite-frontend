import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import {
  buildCustomersUrl,
  type CustomerPage,
  readCustomerQuery,
} from '../src/util/customers';
import {
  escapeHtml,
  renderCustomerDetail,
  renderCustomerMessage,
  renderCustomersResults,
  renderEmptyState,
  renderErrorState,
  renderTotal,
} from '../src/util/customerViews';
import { createInMemoryCustomerSource } from './customerFixtures';

const NO_FILTERS = { search: '', email: '', sort: 'nameAsc' as const };

async function pageFor(
  query: Partial<
    Parameters<ReturnType<typeof createInMemoryCustomerSource>['query']>[0]
  > = {},
): Promise<CustomerPage> {
  return createInMemoryCustomerSource().query({
    ...NO_FILTERS,
    page: 1,
    pageSize: 10,
    ...query,
  });
}

describe('reading the customer query from the URL', () => {
  it('parses name, email, sort and page', () => {
    assert.deepEqual(
      readCustomerQuery(
        new URLSearchParams('q=ben&email=okafor&sort=oldest&page=3'),
      ),
      { search: 'ben', email: 'okafor', sort: 'oldest', page: 3 },
    );
  });

  it('falls back to defaults for missing or invalid values', () => {
    assert.deepEqual(
      readCustomerQuery(new URLSearchParams('sort=bogus&page=-2&q=%20%20')),
      { search: '', email: '', sort: 'nameAsc', page: 1 },
    );
  });

  it('truncates over-long search values to the backend limits', () => {
    const query = readCustomerQuery(
      new URLSearchParams({ q: 'a'.repeat(300), email: 'b'.repeat(300) }),
    );
    assert.equal(query.search.length, 200);
    assert.equal(query.email.length, 254);
  });

  it('builds list URLs that keep filters, omitting defaults', () => {
    assert.equal(buildCustomersUrl({ ...NO_FILTERS }), '/admin/customers');
    assert.equal(
      buildCustomersUrl({
        search: 'ben',
        email: 'x',
        sort: 'newest',
        page: 2,
      }),
      '/admin/customers?q=ben&email=x&sort=newest&page=2',
    );
  });
});

describe('customer list rendering', () => {
  it('renders the table columns, links, dates and total', async () => {
    const html = renderCustomersResults(await pageFor(), NO_FILTERS);
    for (const text of [
      'Customer Name',
      'Email Address',
      'Registration Date',
    ]) {
      assert.ok(html.includes(text), `missing "${text}"`);
    }
    assert.equal((html.match(/<tr><td/g) ?? []).length, 10);
    assert.match(html, /<a href="\/admin\/customers\/c-1">Amelia Hart<\/a>/);
    assert.match(html, /8 Jan 2026/);
    assert.equal(renderTotal(27), 'Total Customers: 27');
  });

  it('renders Previous | 1 | 2 | 3 | Next with the current page marked', async () => {
    const html = renderCustomersResults(await pageFor({ page: 2 }), {
      ...NO_FILTERS,
      sort: 'newest',
    });
    assert.match(html, /rel="prev">Previous/);
    assert.match(html, /rel="next">Next/);
    assert.match(html, /is-current" aria-current="page">2</);
    assert.match(html, /href="\/admin\/customers\?sort=newest"/);
    assert.match(html, /href="\/admin\/customers\?sort=newest&amp;page=3"/);
  });

  it('disables Previous on the first page and Next on the last', async () => {
    const first = renderCustomersResults(await pageFor(), NO_FILTERS);
    assert.match(first, /is-disabled" aria-disabled="true">Previous/);
    const last = renderCustomersResults(await pageFor({ page: 3 }), NO_FILTERS);
    assert.match(last, /is-disabled" aria-disabled="true">Next/);
    assert.equal((last.match(/<tr><td/g) ?? []).length, 7);
  });

  it('omits pagination for a single page', async () => {
    const html = renderCustomersResults(await pageFor({ search: 'amelia' }), {
      ...NO_FILTERS,
      search: 'amelia',
    });
    assert.doesNotMatch(html, /customer-pagination/);
    assert.match(html, /1 matching customer</);
  });

  it('renders the no results and no customers empty states', async () => {
    const noMatch = renderCustomersResults(await pageFor({ search: 'zzzz' }), {
      ...NO_FILTERS,
      search: 'zzzz',
    });
    assert.match(noMatch, /No customers found/);
    assert.match(noMatch, /Clear search/);
    const none = renderEmptyState(false);
    assert.match(none, /Customers will appear here once they register\./);
  });

  it('renders the error state with a retry link', () => {
    const html = renderErrorState('/admin/customers?q=a&page=2');
    assert.match(html, /Unable to load customers/);
    assert.match(html, /role="alert"/);
    assert.match(html, /href="\/admin\/customers\?q=a&amp;page=2"/);
  });

  it('escapes customer-supplied values', async () => {
    const hostile = {
      id: 'x"><img src=x>',
      firstName: '<script>alert(1)</script>',
      lastName: '&',
      email: '"><b>@x.com',
      registrationDate: '2026-10-21',
    };
    const page: CustomerPage = {
      customers: [hostile],
      totalCustomers: 1,
      matchingCustomers: 1,
      page: 1,
      totalPages: 1,
    };
    for (const html of [
      renderCustomersResults(page, NO_FILTERS),
      renderCustomerDetail(hostile),
    ]) {
      assert.doesNotMatch(html, /<script>|<img|<b>@/);
      assert.match(html, /&lt;script&gt;/);
    }
  });

  it('escapes the search term used in retry URLs and html helpers', () => {
    assert.equal(
      escapeHtml(`<a href="x">&'`),
      '&lt;a href=&quot;x&quot;&gt;&amp;&#39;',
    );
  });
});

describe('customer detail rendering', () => {
  it('shows name, email and registration date', async () => {
    const customer = await createInMemoryCustomerSource().findById('c-2');
    assert.ok(customer);
    const html = renderCustomerDetail(customer);
    assert.match(html, /<h1[^>]*>Ben Okafor<\/h1>/);
    assert.match(html, /ben\.okafor@example\.com/);
    assert.match(html, /19 Jan 2026/);
    for (const label of [
      'Customer Name',
      'Email Address',
      'Registration Date',
    ]) {
      assert.ok(html.includes(label), `missing "${label}"`);
    }
  });

  it('renders not found and error messages', () => {
    const html = renderCustomerMessage(
      'Customer not found',
      'No such customer.',
    );
    assert.match(html, /Customer not found/);
    assert.match(html, /role="alert"/);
  });
});
