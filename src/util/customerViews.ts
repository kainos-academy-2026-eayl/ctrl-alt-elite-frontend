import {
  buildCustomersUrl,
  type Customer,
  type CustomerPage,
  type CustomerSort,
  customerFullName,
  formatRegistrationDate,
} from './customers';

export function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export interface CustomerListParams {
  search: string;
  email: string;
  sort: CustomerSort;
}

function dateHtml(customer: Customer): string {
  return `<time datetime="${escapeHtml(customer.registrationDate)}">${escapeHtml(formatRegistrationDate(customer.registrationDate))}</time>`;
}

export function renderTotal(totalCustomers: number): string {
  return `Total Customers: ${totalCustomers}`;
}

export function renderEmptyState(hasFilters: boolean): string {
  const message = hasFilters
    ? '<p class="admin-empty">No customers match your search. Try a different name or email address.</p><p><a href="/admin/customers">Clear search</a></p>'
    : '<p class="admin-empty">Customers will appear here once they register.</p>';
  return `<section class="admin-card customer-state" aria-labelledby="customers-empty-heading"><h2 id="customers-empty-heading">No customers found</h2>${message}</section>`;
}

export function renderErrorState(retryUrl: string): string {
  return `<section class="admin-card customer-state" role="alert" aria-labelledby="customers-error-heading"><h2 id="customers-error-heading">Unable to load customers</h2><p class="admin-empty">Something went wrong while loading customer data. Please try again.</p><p><a class="admin-action customer-state-action" href="${escapeHtml(retryUrl)}">Try again</a></p></section>`;
}

function renderPagination(
  page: number,
  totalPages: number,
  urlForPage: (page: number) => string,
): string {
  if (totalPages <= 1) return '';
  const previous =
    page > 1
      ? `<a href="${escapeHtml(urlForPage(page - 1))}" rel="prev">Previous</a>`
      : '<span class="is-disabled" aria-disabled="true">Previous</span>';
  const next =
    page < totalPages
      ? `<a href="${escapeHtml(urlForPage(page + 1))}" rel="next">Next</a>`
      : '<span class="is-disabled" aria-disabled="true">Next</span>';
  const numbers = Array.from({ length: totalPages }, (_, index) => {
    const number = index + 1;
    return number === page
      ? `<span class="is-current" aria-current="page">${number}</span>`
      : `<a href="${escapeHtml(urlForPage(number))}" aria-label="Page ${number}">${number}</a>`;
  });
  const items = [previous, ...numbers, next]
    .map((item) => `<li>${item}</li>`)
    .join('');
  return `<nav class="customer-pagination" aria-label="Customer pages"><ul>${items}</ul></nav>`;
}

export function renderCustomersResults(
  result: CustomerPage,
  params: CustomerListParams,
): string {
  const hasFilters = Boolean(params.search || params.email);
  if (result.customers.length === 0) return renderEmptyState(hasFilters);

  const noun = result.matchingCustomers === 1 ? 'customer' : 'customers';
  const summary = hasFilters
    ? `<p class="admin-subtitle" data-matching-customers>${result.matchingCustomers} matching ${noun}</p>`
    : '';
  const rows = result.customers
    .map(
      (customer) =>
        `<tr><td data-label="Customer Name"><a href="/admin/customers/${encodeURIComponent(customer.id)}">${escapeHtml(customerFullName(customer))}</a></td><td data-label="Email Address">${escapeHtml(customer.email)}</td><td data-label="Registration Date">${dateHtml(customer)}</td></tr>`,
    )
    .join('');
  const table = `<div class="admin-card customer-table-card"><table class="customer-table"><thead><tr><th scope="col">Customer Name</th><th scope="col">Email Address</th><th scope="col">Registration Date</th></tr></thead><tbody>${rows}</tbody></table></div>`;
  const pagination = renderPagination(result.page, result.totalPages, (page) =>
    buildCustomersUrl({ ...params, page }),
  );
  return `${summary}${table}${pagination}`;
}

export function renderCustomerDetail(customer: Customer): string {
  const name = escapeHtml(customerFullName(customer));
  return `<header class="admin-page-header"><h1>${name}</h1></header><section class="admin-card" aria-labelledby="customer-details-heading"><h2 id="customer-details-heading">Customer details</h2><dl class="customer-details"><div><dt>Customer Name</dt><dd>${name}</dd></div><div><dt>Email Address</dt><dd>${escapeHtml(customer.email)}</dd></div><div><dt>Registration Date</dt><dd>${dateHtml(customer)}</dd></div></dl></section>`;
}

export function renderCustomerMessage(title: string, message: string): string {
  return `<header class="admin-page-header"><h1>Customer details</h1></header><section class="admin-card customer-state" role="alert" aria-labelledby="customer-error-heading"><h2 id="customer-error-heading">${escapeHtml(title)}</h2><p class="admin-empty">${escapeHtml(message)}</p></section>`;
}
