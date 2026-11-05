import { formatPence, orderStatusLabel } from './adminOrders';
import type { SalesReport } from './adminReports';
import { escapeHtml } from './customerViews';

function formatCount(value: number): string {
  return value.toLocaleString('en-GB');
}

function formatDay(isoDate: string): string {
  const date = new Date(`${isoDate}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return isoDate;
  return date.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

export function renderReportError(retryUrl: string): string {
  return `<section class="admin-card customer-state" role="alert" aria-labelledby="report-error-heading"><h2 id="report-error-heading">Unable to load the report</h2><p class="admin-empty">Something went wrong while loading sales data. Please try again.</p><p><a class="admin-action customer-state-action" href="${escapeHtml(retryUrl)}">Try again</a></p></section>`;
}

export function renderReportAccessDenied(): string {
  return '<section class="admin-card customer-state" role="alert" aria-labelledby="report-denied-heading"><h2 id="report-denied-heading">Access denied</h2><p class="admin-empty">You do not have permission to view reports.</p><p><a href="/">Return to the homepage</a></p></section>';
}

function summaryCards(report: SalesReport): string {
  const entries: Array<[string, string]> = [
    ['Total orders', formatCount(report.summary.totalOrders)],
    ['Total revenue', formatPence(report.summary.totalRevenuePence)],
    ['Average order value', formatPence(report.summary.averageOrderValuePence)],
    ['Units sold', formatCount(report.summary.unitsSold)],
  ];
  const cards = entries
    .map(
      ([label, value]) =>
        `<li class="admin-card admin-summary-card"><span class="admin-summary-label">${label}</span><span class="admin-summary-value" data-report-card="${label}">${escapeHtml(value)}</span></li>`,
    )
    .join('');
  return `<ul class="admin-summary-grid">${cards}</ul>`;
}

function statusTable(report: SalesReport): string {
  if (report.ordersByStatus.length === 0) {
    return '<p class="admin-empty">No orders in this period.</p>';
  }
  const max = Math.max(...report.ordersByStatus.map((row) => row.count), 1);
  const rows = report.ordersByStatus
    .map(
      (row) =>
        `<tr><td data-label="Status">${escapeHtml(orderStatusLabel(row.status))}</td><td data-label="Orders">${formatCount(row.count)} <meter class="report-meter" min="0" max="${max}" value="${row.count}" aria-label="${escapeHtml(orderStatusLabel(row.status))} orders">${row.count}</meter></td></tr>`,
    )
    .join('');
  return `<div class="customer-table-card"><table class="customer-table"><thead><tr><th scope="col">Status</th><th scope="col">Orders</th></tr></thead><tbody>${rows}</tbody></table></div>`;
}

function topProductsTable(report: SalesReport): string {
  if (report.topProducts.length === 0) {
    return '<p class="admin-empty">No products were sold in this period.</p>';
  }
  const rows = report.topProducts
    .map(
      (product) =>
        `<tr><td data-label="Product">${escapeHtml(product.name)}</td><td data-label="Units sold">${formatCount(product.unitsSold)}</td><td data-label="Revenue">${escapeHtml(formatPence(product.revenuePence))}</td></tr>`,
    )
    .join('');
  return `<div class="customer-table-card"><table class="customer-table"><thead><tr><th scope="col">Product</th><th scope="col">Units sold</th><th scope="col">Revenue</th></tr></thead><tbody>${rows}</tbody></table></div>`;
}

function dailySalesTable(report: SalesReport): string {
  if (report.dailySales.length === 0) {
    return '<p class="admin-empty">No sales in this period.</p>';
  }
  const max = Math.max(...report.dailySales.map((day) => day.revenuePence), 1);
  const rows = report.dailySales
    .map(
      (day) =>
        `<tr><td data-label="Date"><time datetime="${escapeHtml(day.date)}">${escapeHtml(formatDay(day.date))}</time></td><td data-label="Orders">${formatCount(day.orders)}</td><td data-label="Revenue">${escapeHtml(formatPence(day.revenuePence))} <meter class="report-meter" min="0" max="${max}" value="${day.revenuePence}" aria-label="Revenue on ${escapeHtml(formatDay(day.date))}">${escapeHtml(formatPence(day.revenuePence))}</meter></td></tr>`,
    )
    .join('');
  return `<div class="customer-table-card"><table class="customer-table"><thead><tr><th scope="col">Date</th><th scope="col">Orders</th><th scope="col">Revenue</th></tr></thead><tbody>${rows}</tbody></table></div>`;
}

export function renderSalesReport(report: SalesReport): string {
  return `${summaryCards(report)}<div class="admin-grid"><section class="admin-card" aria-labelledby="report-status-heading"><h2 id="report-status-heading">Orders by status</h2>${statusTable(report)}</section><section class="admin-card" aria-labelledby="report-top-heading"><h2 id="report-top-heading">Top products</h2>${topProductsTable(report)}</section></div><section class="admin-card report-daily" aria-labelledby="report-daily-heading"><h2 id="report-daily-heading">Daily sales</h2>${dailySalesTable(report)}</section>`;
}
