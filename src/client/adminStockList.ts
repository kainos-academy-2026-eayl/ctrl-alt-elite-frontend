import {
  filterStock,
  hasStockFilters,
  readStockQuery,
  type StockItem,
  type StockQuery,
  type StockStatus,
  stockQueryParams,
  validateStockForm,
} from '../util/adminStock';
import {
  LOAD_ERROR_MESSAGE,
  LOAD_ERROR_TITLE,
  renderStockAccessDenied,
  renderStockEmpty,
  renderStockError,
  renderStockTable,
  renderSummaryCards,
  type StockDraft,
} from '../util/adminStockViews';
import {
  AccessDeniedError,
  loginRedirectFor,
  SessionExpiredError,
} from '../util/apiErrors';
import {
  createStockApi,
  StockNotFoundError,
  StockValidationError,
} from '../util/stockApi';

const SAVE_ERROR_MESSAGE =
  'Unable to save. Check your connection and try again. Your changes have been kept.';
const TOGGLE_ERROR_MESSAGE =
  'Unable to update the out-of-stock status. Check your connection and try again.';
const NOT_FOUND_MESSAGE =
  'This product no longer exists. Reload the page to see the latest list.';

function getElement<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`Element not found: ${selector}`);
  return element;
}

const results = getElement<HTMLElement>('[data-stock-results]');
const summary = getElement<HTMLElement>('[data-stock-summary]');
const count = getElement<HTMLElement>('[data-stock-count]');
const notice = getElement<HTMLElement>('[data-stock-notice]');
const errorBox = getElement<HTMLElement>('[data-stock-error]');
const filters = getElement<HTMLFormElement>('[data-stock-filters]');
const searchInput = getElement<HTMLInputElement>('#stock-search');
const statusSelect = getElement<HTMLSelectElement>('#stock-status');
const lowOnlyInput = getElement<HTMLInputElement>('#stock-low-only');

const api = createStockApi();

let products: StockItem[] = [];
let loaded = false;
let mutationGeneration = 0;
let refreshGeneration = 0;
// Edits survive filtering, refreshes and failed saves so no input is lost.
const drafts = new Map<string, StockDraft>();
const busyIds = new Set<string>();
let query: StockQuery = readStockQuery(
  new URLSearchParams(window.location.search),
);

searchInput.value = query.search;
statusSelect.value = query.status;
lowOnlyInput.checked = query.lowStockOnly;

function show(element: HTMLElement, message: string): void {
  notice.hidden = true;
  errorBox.hidden = true;
  element.textContent = message;
  element.hidden = false;
}

function clearMessages(): void {
  notice.hidden = true;
  errorBox.hidden = true;
}

interface FocusedInput {
  id: string | undefined;
  field: string | undefined;
  start: number | null;
  end: number | null;
}

function readFocusedInput(): FocusedInput | null {
  const focused = document.activeElement;
  if (
    !(focused instanceof HTMLInputElement) ||
    !results.contains(focused) ||
    !focused.dataset.stockInput
  ) {
    return null;
  }
  return {
    id: focused.dataset.id,
    field: focused.dataset.stockInput,
    start: focused.selectionStart,
    end: focused.selectionEnd,
  };
}

// Re-rendering replaces the table, so put the cursor back where it was.
function restoreFocusedInput(focused: FocusedInput): void {
  const replacement = Array.from(
    results.querySelectorAll<HTMLInputElement>('[data-stock-input]'),
  ).find(
    (input) =>
      input.dataset.id === focused.id &&
      input.dataset.stockInput === focused.field,
  );
  if (!replacement) return;
  replacement.focus();
  replacement.setSelectionRange(focused.start, focused.end);
}

function render(): void {
  if (!loaded) return;
  const focused = readFocusedInput();
  const focusedButton =
    document.activeElement instanceof HTMLButtonElement &&
    results.contains(document.activeElement)
      ? document.activeElement
      : null;
  const action = [
    'data-edit-stock',
    'data-save-stock',
    'data-cancel-stock',
    'data-out-of-stock',
  ].find((attribute) => focusedButton?.hasAttribute(attribute));
  const matching = filterStock(products, query);
  count.textContent =
    matching.length === products.length
      ? `${products.length} ${products.length === 1 ? 'product' : 'products'}`
      : `${matching.length} of ${products.length} products shown`;
  count.hidden = false;
  results.innerHTML =
    matching.length === 0
      ? renderStockEmpty(hasStockFilters(query))
      : renderStockTable(matching, drafts, busyIds);
  if (focused) {
    restoreFocusedInput(focused);
  } else if (action && focusedButton) {
    const id = focusedButton.getAttribute(action);
    Array.from(results.querySelectorAll<HTMLButtonElement>(`button[${action}]`))
      .find((button) => button.getAttribute(action) === id)
      ?.focus();
  }
}

function focusRow(id: string, selector: string): void {
  const row = Array.from(
    results.querySelectorAll<HTMLElement>('[data-stock-row]'),
  ).find((candidate) => candidate.dataset.stockRow === id);
  row?.querySelector<HTMLElement>(selector)?.focus();
}

// Returns true when the failure was a shared one that has been dealt with.
function handleSharedFailure(error: unknown): boolean {
  if (error instanceof SessionExpiredError) {
    loaded = false;
    refreshGeneration++;
    window.location.assign(loginRedirectFor(window.location));
    return true;
  }
  if (error instanceof AccessDeniedError) {
    loaded = false;
    refreshGeneration++;
    clearMessages();
    count.hidden = true;
    results.innerHTML = renderStockAccessDenied();
    return true;
  }
  return false;
}

async function load(): Promise<void> {
  loaded = false;
  const mutation = mutationGeneration;
  const generation = ++refreshGeneration;
  results.innerHTML = '<p class="admin-empty">Loading inventory&hellip;</p>';
  try {
    const [list, dashboard] = await Promise.all([
      api.listProducts(),
      api.getDashboard(),
    ]);
    if (mutation !== mutationGeneration || generation !== refreshGeneration)
      return;
    products = list;
    for (const id of drafts.keys()) {
      if (!list.some((product) => product.id === id)) drafts.delete(id);
    }
    summary.innerHTML = renderSummaryCards(dashboard.summary);
    loaded = true;
    render();
  } catch (error) {
    if (mutation !== mutationGeneration || generation !== refreshGeneration)
      return;
    if (handleSharedFailure(error)) return;
    console.error('Unable to load the inventory:', error);
    count.hidden = true;
    results.innerHTML = renderStockError(LOAD_ERROR_TITLE, LOAD_ERROR_MESSAGE);
  }
}

// Quietly brings the list and the summary counts up to date after a change.
async function refresh(): Promise<void> {
  const mutation = mutationGeneration;
  const generation = ++refreshGeneration;
  try {
    const [list, dashboard] = await Promise.all([
      api.listProducts(),
      api.getDashboard(),
    ]);
    if (mutation !== mutationGeneration || generation !== refreshGeneration)
      return;
    products = list;
    summary.innerHTML = renderSummaryCards(dashboard.summary);
    render();
  } catch (error) {
    if (mutation !== mutationGeneration || generation !== refreshGeneration)
      return;
    if (handleSharedFailure(error)) return;
    console.error('Unable to refresh the inventory:', error);
  }
}

function replaceProduct(updated: StockItem): void {
  products = products.map((product) =>
    product.id === updated.id ? updated : product,
  );
}

function findProduct(id: string): StockItem | undefined {
  return products.find((product) => product.id === id);
}

function startEditing(id: string): void {
  const product = findProduct(id);
  if (!product || drafts.has(id)) return;
  drafts.set(id, {
    stock: String(product.stock),
    lowStockThreshold: String(product.lowStockThreshold),
    errors: {},
    formError: '',
    saving: false,
  });
  render();
  focusRow(id, '[data-stock-input="stock"]');
}

function stopEditing(id: string): void {
  drafts.delete(id);
  render();
  focusRow(id, '[data-edit-stock]');
}

async function save(id: string): Promise<void> {
  const product = findProduct(id);
  const draft = drafts.get(id);
  if (!product || !draft || draft.saving) return;

  const validation = validateStockForm(draft);
  if (!validation.ok) {
    draft.errors = validation.errors;
    draft.formError = '';
    render();
    focusRow(
      id,
      validation.errors.stock
        ? '[data-stock-input="stock"]'
        : '[data-stock-input="lowStockThreshold"]',
    );
    return;
  }

  draft.errors = {};
  draft.formError = '';
  draft.saving = true;
  mutationGeneration++;
  render();

  try {
    const updated = await api.updateStock(id, validation.value);
    mutationGeneration++;
    replaceProduct(updated);
    drafts.delete(id);
    render();
    focusRow(id, '[data-edit-stock]');
    show(notice, `Stock for ${updated.name} updated.`);
    void refresh();
  } catch (error) {
    if (handleSharedFailure(error)) return;
    draft.saving = false;
    if (error instanceof StockValidationError) {
      draft.errors = error.fieldErrors;
      draft.formError =
        error.fieldErrors.stock || error.fieldErrors.lowStockThreshold
          ? ''
          : error.message;
    } else if (error instanceof StockNotFoundError) {
      draft.formError = NOT_FOUND_MESSAGE;
    } else {
      console.error('Unable to save the stock:', error);
      draft.formError = SAVE_ERROR_MESSAGE;
    }
    render();
    focusRow(
      id,
      draft.errors.lowStockThreshold && !draft.errors.stock
        ? '[data-stock-input="lowStockThreshold"]'
        : '[data-stock-input="stock"]',
    );
  }
}

async function setOutOfStock(id: string, outOfStock: boolean): Promise<void> {
  const product = findProduct(id);
  if (!product || busyIds.has(id)) return;
  if (
    outOfStock &&
    !window.confirm(`Mark "${product.name}" as out of stock?`)
  ) {
    return;
  }

  busyIds.add(id);
  mutationGeneration++;
  render();
  try {
    const updated = await api.setOutOfStock(id, outOfStock);
    mutationGeneration++;
    replaceProduct(updated);
    busyIds.delete(id);
    render();
    focusRow(id, '[data-out-of-stock]');
    show(
      notice,
      outOfStock
        ? `${updated.name} marked as out of stock.`
        : `Out-of-stock status removed for ${updated.name}.`,
    );
    void refresh();
  } catch (error) {
    busyIds.delete(id);
    if (handleSharedFailure(error)) return;
    console.error('Unable to change the out-of-stock status:', error);
    render();
    focusRow(id, '[data-out-of-stock]');
    show(
      errorBox,
      error instanceof StockNotFoundError
        ? NOT_FOUND_MESSAGE
        : TOGGLE_ERROR_MESSAGE,
    );
  }
}

function closestWithData(event: Event, selector: string): HTMLElement | null {
  return event.target instanceof Element
    ? event.target.closest<HTMLElement>(selector)
    : null;
}

results.addEventListener('click', (event) => {
  if (closestWithData(event, '[data-retry]')) {
    void load();
    return;
  }
  const edit = closestWithData(event, '[data-edit-stock]');
  if (edit) {
    startEditing(edit.dataset.editStock ?? '');
    return;
  }
  const cancel = closestWithData(event, '[data-cancel-stock]');
  if (cancel) {
    stopEditing(cancel.dataset.cancelStock ?? '');
    return;
  }
  const saveButton = closestWithData(event, '[data-save-stock]');
  if (saveButton) {
    void save(saveButton.dataset.saveStock ?? '');
    return;
  }
  const toggle = closestWithData(event, '[data-out-of-stock]');
  if (toggle) {
    void setOutOfStock(
      toggle.dataset.outOfStock ?? '',
      toggle.dataset.mark === 'true',
    );
  }
});

results.addEventListener('input', (event) => {
  const input = closestWithData(event, '[data-stock-input]');
  if (!(input instanceof HTMLInputElement)) return;
  const draft = drafts.get(input.dataset.id ?? '');
  if (!draft) return;
  if (input.dataset.stockInput === 'stock') draft.stock = input.value;
  else draft.lowStockThreshold = input.value;
});

results.addEventListener('keydown', (event) => {
  const input = closestWithData(event, '[data-stock-input]');
  if (!input) return;
  const id = input.dataset.id ?? '';
  if (event.key === 'Enter') {
    event.preventDefault();
    void save(id);
  } else if (event.key === 'Escape' && !drafts.get(id)?.saving) {
    stopEditing(id);
  }
});

function applyFilters(): void {
  query = {
    search: searchInput.value.trim(),
    status: statusSelect.value as StockStatus | '',
    lowStockOnly: lowOnlyInput.checked,
  };
  const search = stockQueryParams(query).toString();
  window.history.replaceState(
    null,
    '',
    `${window.location.pathname}${search ? `?${search}` : ''}`,
  );
  render();
}

filters.addEventListener('submit', (event) => {
  event.preventDefault();
  applyFilters();
});
searchInput.addEventListener('input', applyFilters);
statusSelect.addEventListener('change', applyFilters);
lowOnlyInput.addEventListener('change', applyFilters);

void load();
