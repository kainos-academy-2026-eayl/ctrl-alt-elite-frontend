import {
  STOCK_STATUS_LABELS,
  type StockFieldErrors,
  type StockItem,
  type StockStatus,
  type StockSummary,
} from './adminStock';
import { escapeHtml } from './customerViews';

// Colour is never the only signal: every badge has an icon and a text label.
const STATUS_ICONS: Readonly<Record<StockStatus, string>> = {
  IN_STOCK: '\u2713',
  LOW_STOCK: '\u26A0',
  OUT_OF_STOCK: '\u2715',
};

const STATUS_CLASSES: Readonly<Record<StockStatus, string>> = {
  IN_STOCK: 'is-in-stock',
  LOW_STOCK: 'is-low-stock',
  OUT_OF_STOCK: 'is-out-of-stock',
};

export function renderStatusBadge(status: StockStatus): string {
  return `<span class="stock-badge ${STATUS_CLASSES[status]}"><span class="stock-badge-icon" aria-hidden="true">${STATUS_ICONS[status]}</span>${STOCK_STATUS_LABELS[status]}</span>`;
}

function formatCount(value: number): string {
  return value.toLocaleString('en-GB');
}

const SUMMARY_CARDS: ReadonlyArray<{ key: keyof StockSummary; label: string }> =
  [
    { key: 'totalProducts', label: 'Total products' },
    { key: 'inStock', label: 'In stock' },
    { key: 'lowStock', label: 'Low stock' },
    { key: 'outOfStock', label: 'Out of stock' },
    { key: 'totalUnits', label: 'Total units' },
  ];

export function renderSummaryCards(summary: StockSummary): string {
  const cards = SUMMARY_CARDS.map(
    ({ key, label }) =>
      `<li class="admin-card admin-summary-card"><span class="admin-summary-label">${label}</span><span class="admin-summary-value" data-summary-card="${label}">${formatCount(summary[key])}</span></li>`,
  ).join('');
  return `<ul class="admin-summary-grid">${cards}</ul>`;
}

function rowClasses(item: StockItem): string {
  return [
    item.lowStock ? 'is-low-stock' : '',
    item.status === 'OUT_OF_STOCK' ? 'is-out-of-stock' : '',
  ]
    .filter(Boolean)
    .join(' ');
}

export function renderLowStockTable(products: readonly StockItem[]): string {
  if (products.length === 0) {
    return '<p class="admin-empty">No products are low on stock.</p>';
  }
  const rows = products
    .map(
      (item) =>
        `<tr class="stock-row ${rowClasses(item)}" data-low-stock-row="${escapeHtml(item.id)}"><td data-label="Name">${escapeHtml(item.name)}</td><td data-label="Category">${escapeHtml(item.category)}</td><td data-label="Stock">${formatCount(item.stock)}</td><td data-label="Threshold">${formatCount(item.lowStockThreshold)}</td><td data-label="Status">${renderStatusBadge(item.status)}</td></tr>`,
    )
    .join('');
  return `<div class="customer-table-card"><table class="customer-table"><caption class="visually-hidden">Low-stock products</caption><thead><tr><th scope="col">Name</th><th scope="col">Category</th><th scope="col">Stock</th><th scope="col">Threshold</th><th scope="col">Status</th></tr></thead><tbody>${rows}</tbody></table></div>`;
}

// What the user has typed into a row that is being edited.
export interface StockDraft {
  stock: string;
  lowStockThreshold: string;
  errors: StockFieldErrors;
  formError: string;
  saving: boolean;
}

function renderInput(
  item: StockItem,
  field: 'stock' | 'lowStockThreshold',
  label: string,
  draft: StockDraft,
): string {
  const id = `${field}-${item.id}`;
  const error = draft.errors[field];
  return `<input class="stock-input" id="${escapeHtml(id)}" type="text" inputmode="numeric" autocomplete="off" data-stock-input="${field}" data-id="${escapeHtml(item.id)}" value="${escapeHtml(draft[field])}" aria-label="${label} for ${escapeHtml(item.name)}"${error ? ` aria-invalid="true" aria-describedby="${escapeHtml(id)}-error"` : ''}${draft.saving ? ' disabled' : ''} />${error ? `<p class="admin-error stock-field-error" id="${escapeHtml(id)}-error" role="alert">${escapeHtml(error)}</p>` : ''}`;
}

function renderActions(
  item: StockItem,
  draft: StockDraft | undefined,
  busy: boolean,
): string {
  const id = escapeHtml(item.id);
  const name = escapeHtml(item.name);
  if (draft) {
    const disabled = draft.saving ? ' disabled' : '';
    const formError = draft.formError
      ? `<p class="admin-error stock-field-error" role="alert">${escapeHtml(draft.formError)}</p>`
      : '';
    return `<div class="inventory-actions"><button class="customer-button" type="button" data-save-stock="${id}" aria-label="Save stock for ${name}"${disabled}>${draft.saving ? 'Saving&hellip;' : 'Save'}</button><button class="customer-button customer-button-secondary" type="button" data-cancel-stock="${id}" aria-label="Cancel editing ${name}"${disabled}>Cancel</button></div>${formError}`;
  }
  const disabled = busy ? ' disabled' : '';
  const toggle = item.outOfStock
    ? `<button class="customer-button customer-button-secondary" type="button" data-out-of-stock="${id}" data-mark="false" aria-label="Undo out of stock for ${name}"${disabled}>Undo out of stock</button>`
    : `<button class="customer-button customer-button-danger" type="button" data-out-of-stock="${id}" data-mark="true" aria-label="Mark ${name} as out of stock"${disabled}>Mark out of stock</button>`;
  return `<div class="inventory-actions"><button class="customer-button customer-button-secondary" type="button" data-edit-stock="${id}" aria-label="Edit stock for ${name}"${disabled}>Edit</button>${toggle}</div>`;
}

export function renderStockTable(
  items: readonly StockItem[],
  drafts: ReadonlyMap<string, StockDraft>,
  busyIds: ReadonlySet<string>,
): string {
  const rows = items
    .map((item) => {
      const draft = drafts.get(item.id);
      const stock = draft
        ? renderInput(item, 'stock', 'Stock', draft)
        : formatCount(item.stock);
      const threshold = draft
        ? renderInput(item, 'lowStockThreshold', 'Low-stock threshold', draft)
        : formatCount(item.lowStockThreshold);
      return `<tr class="stock-row ${rowClasses(item)}" data-stock-row="${escapeHtml(item.id)}"><td data-label="Name">${escapeHtml(item.name)}</td><td data-label="Category">${escapeHtml(item.category)}</td><td data-label="Stock">${stock}</td><td data-label="Threshold">${threshold}</td><td data-label="Status">${renderStatusBadge(item.status)}</td><td data-label="Actions">${renderActions(item, draft, busyIds.has(item.id))}</td></tr>`;
    })
    .join('');
  return `<div class="admin-card customer-table-card"><table class="customer-table"><caption class="visually-hidden">Inventory</caption><thead><tr><th scope="col">Name</th><th scope="col">Category</th><th scope="col">Stock</th><th scope="col">Threshold</th><th scope="col">Status</th><th scope="col">Actions</th></tr></thead><tbody>${rows}</tbody></table></div>`;
}

export function renderStockEmpty(hasFilters: boolean): string {
  const message = hasFilters
    ? 'No products match your search or filters.'
    : 'There are no products to manage yet.';
  const action = hasFilters
    ? '<p><a href="/admin/stock">Clear search and filters</a></p>'
    : '';
  return `<section class="admin-card customer-state" aria-labelledby="stock-empty-heading"><h2 id="stock-empty-heading">No products found</h2><p class="admin-empty">${message}</p>${action}</section>`;
}

export function renderStockError(title: string, message: string): string {
  return `<section class="admin-card customer-state" role="alert" aria-labelledby="stock-error-heading"><h2 id="stock-error-heading">${escapeHtml(title)}</h2><p class="admin-empty">${escapeHtml(message)}</p><p><button class="customer-button" type="button" data-retry>Try again</button></p></section>`;
}

export function renderStockAccessDenied(): string {
  return '<section class="admin-card customer-state" role="alert" aria-labelledby="stock-denied-heading"><h2 id="stock-denied-heading">Access denied</h2><p class="admin-empty">You do not have permission to use the inventory.</p><p><a href="/">Return to the homepage</a></p></section>';
}

export const LOAD_ERROR_TITLE = 'Unable to load the inventory';
export const LOAD_ERROR_MESSAGE =
  'Something went wrong while loading the inventory. Check your connection and try again.';
