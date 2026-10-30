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
  const firstPage = Math.max(1, Math.min(page - 3, totalPages - 6));
  const numbers = Array.from(
    { length: Math.min(7, totalPages) },
    (_, index) => {
      const number = firstPage + index;
      return number === page
        ? `<span class="is-current" aria-current="page">${number}</span>`
        : `<a href="${escapeHtml(urlForPage(number))}" aria-label="Page ${number}">${number}</a>`;
    },
  );
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
  const first = escapeHtml(customer.firstName);
  const last = escapeHtml(customer.lastName);
  const email = escapeHtml(customer.email);
  const details = `<section class="admin-card" aria-labelledby="customer-details-heading"><div class="admin-card-header"><h2 id="customer-details-heading">Customer details</h2><button class="admin-link-button" type="button" data-customer-edit>Edit</button></div><dl class="customer-details" data-customer-view><div><dt>Customer Name</dt><dd data-customer-name>${name}</dd></div><div><dt>Email Address</dt><dd data-customer-email>${email}</dd></div><div><dt>Registration Date</dt><dd>${dateHtml(customer)}</dd></div></dl><form class="admin-form" novalidate hidden data-customer-form><div class="admin-field"><label for="customer-first-name">First Name</label><input id="customer-first-name" name="firstName" type="text" maxlength="100" value="${first}" required /></div><div class="admin-field"><label for="customer-last-name">Last Name</label><input id="customer-last-name" name="lastName" type="text" maxlength="100" value="${last}" /></div><div class="admin-field"><label for="customer-email">Email Address</label><input id="customer-email" name="email" type="email" maxlength="254" value="${email}" required /></div><p class="admin-error" role="alert" hidden data-customer-error></p><div class="admin-form-actions"><button class="customer-button" type="submit" data-customer-save>Save Changes</button><button class="admin-secondary-button" type="button" data-customer-cancel>Cancel</button></div></form><p class="admin-success" role="status" hidden data-customer-success></p></section>`;
  const password = `<section class="admin-card" aria-labelledby="customer-password-heading"><h2 id="customer-password-heading">Reset password</h2><p class="admin-empty">Set a new password for this customer. They will use it the next time they sign in.</p><form class="admin-form" novalidate data-customer-password-form><div class="admin-field"><label for="customer-new-password">New Password</label><input id="customer-new-password" name="newPassword" type="password" autocomplete="new-password" required /></div><div class="admin-field"><label for="customer-confirm-password">Confirm Password</label><input id="customer-confirm-password" name="confirmPassword" type="password" autocomplete="new-password" required /></div><p class="admin-error" role="alert" hidden data-customer-password-error></p><p class="admin-success" role="status" hidden data-customer-password-success></p><button class="customer-button" type="submit" data-customer-password-save>Reset Password</button></form></section>`;
  return `<header class="admin-page-header"><h1 data-customer-heading>${name}</h1></header><div class="customer-manage">${details}${password}</div>`;
}

export function renderCustomerMessage(title: string, message: string): string {
  return `<header class="admin-page-header"><h1>Customer details</h1></header><section class="admin-card customer-state" role="alert" aria-labelledby="customer-error-heading"><h2 id="customer-error-heading">${escapeHtml(title)}</h2><p class="admin-empty">${escapeHtml(message)}</p></section>`;
}
