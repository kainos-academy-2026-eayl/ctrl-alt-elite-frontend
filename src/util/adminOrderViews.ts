import {
  buildOrdersUrl,
  formatOrderDate,
  formatPence,
  type OrderDetail,
  type OrderPage,
  type OrderQuery,
  type OrderSummary,
  orderReference,
  orderStatusLabel,
} from './adminOrders';
import { escapeHtml, renderPagination } from './customerViews';

// Colour is never the only signal: every badge also has an icon and a label.
const STATUS_BADGES: Readonly<Record<string, { icon: string; css: string }>> = {
  PENDING: { icon: '\u23F3', css: 'is-low-stock' },
  PROCESSING: { icon: '\u2699', css: 'is-low-stock' },
  SHIPPED: { icon: '\u2192', css: '' },
  DELIVERED: { icon: '\u2713', css: '' },
  CANCELLED: { icon: '\u2715', css: 'is-out-of-stock' },
};

export function renderOrderStatusBadge(status: string): string {
  const badge = STATUS_BADGES[status] ?? { icon: '\u2022', css: '' };
  return `<span class="stock-badge ${badge.css}"><span class="stock-badge-icon" aria-hidden="true">${badge.icon}</span>${escapeHtml(orderStatusLabel(status))}</span>`;
}

function dateHtml(isoDate: string): string {
  return `<time datetime="${escapeHtml(isoDate)}">${escapeHtml(formatOrderDate(isoDate))}</time>`;
}

export function renderOrdersTotal(total: number, hasFilters = false): string {
  return `${hasFilters ? 'Matching' : 'Total'} Orders: ${total}`;
}

export function renderOrdersEmpty(hasFilters: boolean): string {
  const message = hasFilters
    ? '<p class="admin-empty">No orders match your filters. Try a different search or status.</p><p><a href="/admin/orders">Clear filters</a></p>'
    : '<p class="admin-empty">Orders will appear here once customers place them.</p>';
  return `<section class="admin-card customer-state" aria-labelledby="orders-empty-heading"><h2 id="orders-empty-heading">No orders found</h2>${message}</section>`;
}

export function renderOrdersError(retryUrl: string): string {
  return `<section class="admin-card customer-state" role="alert" aria-labelledby="orders-error-heading"><h2 id="orders-error-heading">Unable to load orders</h2><p class="admin-empty">Something went wrong while loading order data. Please try again.</p><p><a class="admin-action customer-state-action" href="${escapeHtml(retryUrl)}">Try again</a></p></section>`;
}

export function renderOrdersAccessDenied(): string {
  return '<section class="admin-card customer-state" role="alert" aria-labelledby="orders-denied-heading"><h2 id="orders-denied-heading">Access denied</h2><p class="admin-empty">You do not have permission to view orders.</p><p><a href="/">Return to the homepage</a></p></section>';
}

function orderRow(order: OrderSummary): string {
  const reference = escapeHtml(orderReference(order.id));
  return `<tr><td data-label="Order"><a href="/admin/orders/${encodeURIComponent(order.id)}">${reference}</a></td><td data-label="Customer">${escapeHtml(order.customerName)}<br /><span class="admin-empty">${escapeHtml(order.customerEmail)}</span></td><td data-label="Placed">${dateHtml(order.createdAt)}</td><td data-label="Items">${order.itemCount}</td><td data-label="Total">${escapeHtml(formatPence(order.totalPence))}</td><td data-label="Status">${renderOrderStatusBadge(order.status)}</td></tr>`;
}

export function renderOrdersResults(
  result: OrderPage,
  query: OrderQuery,
): string {
  const hasFilters = Boolean(query.search || query.status);
  if (result.orders.length === 0) return renderOrdersEmpty(hasFilters);

  const noun = result.total === 1 ? 'order' : 'orders';
  const summary = hasFilters
    ? `<p class="admin-subtitle" data-matching-orders>${result.total} matching ${noun}</p>`
    : '';
  const head = ['Order', 'Customer', 'Placed', 'Items', 'Total', 'Status']
    .map((label) => `<th scope="col">${label}</th>`)
    .join('');
  const table = `<div class="admin-card customer-table-card"><table class="customer-table"><thead><tr>${head}</tr></thead><tbody>${result.orders.map(orderRow).join('')}</tbody></table></div>`;
  const pagination = renderPagination(
    result.page,
    Math.max(1, result.totalPages),
    (page) => buildOrdersUrl({ ...query, page }),
    'Order pages',
  );
  return `${summary}${table}${pagination}`;
}

export function renderOrderMessage(title: string, message: string): string {
  return `<header class="admin-page-header"><h1>Order details</h1></header><section class="admin-card customer-state" role="alert" aria-labelledby="order-error-heading"><h2 id="order-error-heading">${escapeHtml(title)}</h2><p class="admin-empty">${escapeHtml(message)}</p></section>`;
}

function renderAddress(delivery: OrderDetail['delivery']): string {
  const lines = [
    delivery.addressLine1,
    delivery.addressLine2,
    delivery.town,
    delivery.postcode,
  ].filter((line): line is string => Boolean(line));
  if (lines.length === 0) return 'Not recorded';
  return lines.map(escapeHtml).join('<br />');
}

export function renderOrderDetail(order: OrderDetail): string {
  const reference = escapeHtml(orderReference(order.id));
  const customerLink = `<a href="/admin/customers/${encodeURIComponent(order.customer.id)}">${escapeHtml(order.customer.name)}</a>`;
  const subtotal = order.items.reduce(
    (sum, item) => sum + item.unitPricePence * item.quantity,
    0,
  );
  const rows = order.items
    .map(
      (item) =>
        `<tr><td data-label="Product">${escapeHtml(item.name)}</td><td data-label="Quantity">${item.quantity}</td><td data-label="Unit price">${escapeHtml(formatPence(item.unitPricePence))}</td><td data-label="Line total">${escapeHtml(formatPence(item.unitPricePence * item.quantity))}</td></tr>`,
    )
    .join('');
  const items = `<section class="admin-card" aria-labelledby="order-items-heading"><h2 id="order-items-heading">Items</h2><div class="customer-table-card"><table class="customer-table"><thead><tr><th scope="col">Product</th><th scope="col">Quantity</th><th scope="col">Unit price</th><th scope="col">Line total</th></tr></thead><tbody>${rows}</tbody></table></div><dl class="customer-details"><div><dt>Subtotal</dt><dd>${escapeHtml(formatPence(subtotal))}</dd></div><div><dt>Delivery</dt><dd>${escapeHtml(formatPence(order.delivery.pricePence))}</dd></div><div><dt>Total</dt><dd data-order-total>${escapeHtml(formatPence(order.totalPence))}</dd></div></dl></section>`;
  const phone = order.customer.phone
    ? `<div><dt>Phone</dt><dd>${escapeHtml(order.customer.phone)}</dd></div>`
    : '';
  const summary = `<section class="admin-card" aria-labelledby="order-summary-heading"><h2 id="order-summary-heading">Order summary</h2><dl class="customer-details"><div><dt>Status</dt><dd>${renderOrderStatusBadge(order.status)}</dd></div><div><dt>Placed</dt><dd>${dateHtml(order.createdAt)}</dd></div><div><dt>Customer</dt><dd>${customerLink}</dd></div><div><dt>Email Address</dt><dd>${escapeHtml(order.customer.email)}</dd></div>${phone}</dl></section>`;
  const delivery = `<section class="admin-card" aria-labelledby="order-delivery-heading"><h2 id="order-delivery-heading">Delivery</h2><dl class="customer-details"><div><dt>Method</dt><dd>${order.delivery.option ? escapeHtml(order.delivery.option) : 'Not recorded'}</dd></div><div><dt>Address</dt><dd>${renderAddress(order.delivery)}</dd></div></dl></section>`;
  return `<header class="admin-page-header"><h1 data-order-heading>Order ${reference}</h1></header><div class="customer-manage">${summary}${delivery}${items}</div>`;
}
