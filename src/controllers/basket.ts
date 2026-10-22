/*
 * KAN-28 Shopping basket.
 *
 * The basket is stored by the backend (/api/baskets, reached through this
 * server's /api proxy). The browser only keeps the basket id in
 * sessionStorage, so the basket survives page navigation and refreshes in the
 * same tab but a new basket is started when the tab is closed. The backend
 * owns the prices, quantity limits (1–99) and totals; this file only displays
 * what the server returns. The basket page (/basket) is rendered from
 * src/views/basket.njk.
 *
 * Product pages – add this markup to get a working "Add to Basket" button:
 *   <link rel="stylesheet" href="/assets/basket.css" />
 *   <script src="/controllers/basket.js" defer></script>
 *   <button type="button" data-add-to-basket data-product-id="lamp-01"
 *     data-product-name="Desk Lamp" data-product-price="24.99">Add to Basket</button>
 * Only data-product-id is sent to the server; the name and price are checked
 * for display but the backend always uses its own catalogue price.
 * Any element with a [data-basket-count] attribute shows the live item count,
 * and [data-basket-link-label] gets screen reader text like "Basket, 2 items".
 *
 * Checkout – clicking "Checkout" re-reads the basket from the server, saves a
 * snapshot of it, but stays on the basket page; navigating to the checkout
 * page is a separate ticket. The checkout page can read the snapshot:
 *   JSON.parse(sessionStorage.getItem('ctrl-alt-elite:checkout'))
 *   => { version, createdAt, itemCount, totalPence,
 *        items: [{ id, name, unitPricePence, quantity, lineTotalPence }] }
 * Prices are whole pence to avoid floating point rounding errors.
 */

import {
  addBasketItem,
  BasketApiError,
  changeBasketItemQuantity,
  createBasket,
  getBasket,
  removeBasketItem,
} from './lib/basketApi';
import {
  addedMessage,
  type BasketLine,
  type BasketResponse,
  type BasketTotals,
  calculateTotals,
  createCheckoutSnapshot,
  formatItemCount,
  formatPrice,
  MAX_QUANTITY,
  nextAddCount,
  type ProductInput,
  parseProduct,
  type RecentAdd,
} from './lib/basketLogic';

declare global {
  interface Window {
    Basket: {
      add: (product: ProductInput) => Promise<boolean>;
      getItems: () => BasketTotals;
    };
  }
}

const BASKET_ID_KEY = 'ctrl-alt-elite:basket-id';
// The basket used to live in the browser under this key; it is now ignored.
const LEGACY_BASKET_KEY = 'ctrl-alt-elite:basket';
const CHECKOUT_KEY = 'ctrl-alt-elite:checkout';
const TOAST_DURATION_MS = 3000;

const EMPTY_BASKET: BasketResponse = {
  id: '',
  items: [],
  itemCount: 0,
  totalPence: 0,
  maxQuantity: MAX_QUANTITY,
};

const ADD_FAILED_MESSAGE =
  'Sorry, we could not add that item. Please try again.';
const UPDATE_FAILED_MESSAGE =
  'Sorry, we could not update your basket. Please try again.';
const LOAD_FAILED_ALERT =
  "We couldn't load your basket. Please check your connection and refresh the page.";
const STORAGE_BLOCKED_ALERT =
  'Your browser is blocking storage, so your basket will be lost if you leave this page and checkout is unavailable. Please allow site data and refresh the page.';
const BASKET_RESET_ALERT =
  'We could not find your previous basket, so a new one has been started. Please check your basket before continuing.';
const CHECKOUT_FAILED_ALERT =
  "We couldn't take your basket to checkout. Your items are still in your basket – please try again. If this keeps happening, refresh the page or allow site data in your browser settings.";

/** The latest basket from the server, or null when it could not be loaded. */
let basket: BasketResponse | null = null;
let isLoaded = false;
// Used when sessionStorage is blocked (e.g. strict privacy settings).
let memoryBasketId: string | null = null;
let storageWorks = true;
let basketWasReset = false;
let checkoutFailed = false;

function getElement<T extends Element>(
  selector: string,
  parent: ParentNode = document,
): T {
  const element = parent.querySelector<T>(selector);
  if (!element) {
    throw new Error(`Element not found: ${selector}`);
  }
  return element;
}

// Runs basket changes one at a time, in click order, so a slow response can
// never overwrite the result of a later click.
let pendingWork: Promise<unknown> = Promise.resolve();
function runInOrder<T>(task: () => Promise<T>): Promise<T> {
  const result = pendingWork.then(task, task);
  pendingWork = result.catch(() => undefined);
  return result;
}

function readBasketId(): string | null {
  if (!storageWorks) {
    return memoryBasketId;
  }
  try {
    return sessionStorage.getItem(BASKET_ID_KEY);
  } catch (error) {
    console.error('Basket storage is unavailable:', error);
    storageWorks = false;
    return memoryBasketId;
  }
}

function saveBasketId(basketId: string | null): void {
  memoryBasketId = basketId;
  if (!storageWorks) {
    return;
  }
  try {
    if (basketId === null) {
      sessionStorage.removeItem(BASKET_ID_KEY);
    } else {
      sessionStorage.setItem(BASKET_ID_KEY, basketId);
    }
  } catch (error) {
    console.error('Unable to save the basket id:', error);
    storageWorks = false;
  }
}

/** The basket changed, so any earlier checkout snapshot is now out of date. */
function clearCheckoutSnapshot(): void {
  checkoutFailed = false;
  if (!storageWorks) {
    return;
  }
  try {
    sessionStorage.removeItem(CHECKOUT_KEY);
  } catch (error) {
    console.error('Unable to clear the checkout snapshot:', error);
  }
}

function removeLegacyBasket(): void {
  try {
    sessionStorage.removeItem(LEGACY_BASKET_KEY);
  } catch {
    // Storage is blocked; readBasketId() reports this when it is first used.
  }
}

async function loadBasket(): Promise<void> {
  const basketId = readBasketId();
  isLoaded = true;
  if (basketId === null) {
    basket = EMPTY_BASKET;
    return;
  }
  try {
    basket = await getBasket(basketId);
  } catch (error) {
    if (
      error instanceof BasketApiError &&
      (error.isNotFound || error.status === 400)
    ) {
      saveBasketId(null);
      basketWasReset = true;
      basket = EMPTY_BASKET;
      return;
    }
    console.error('Unable to load the basket:', error);
    basket = null;
  }
}

async function ensureBasketId(): Promise<string> {
  const existingId = readBasketId();
  if (existingId !== null) {
    return existingId;
  }
  const created = await createBasket();
  saveBasketId(created.id);
  return created.id;
}

async function addItemToCurrentBasket(
  productId: string,
): Promise<BasketResponse> {
  try {
    return await addBasketItem(await ensureBasketId(), productId);
  } catch (error) {
    if (!(error instanceof BasketApiError && error.isNotFound)) {
      throw error;
    }
    // The saved basket no longer exists, so start a new one and try once more.
    saveBasketId(null);
    return addBasketItem(await ensureBasketId(), productId);
  }
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof BasketApiError ? error.message : fallback;
}

function addToBasket(input: ProductInput): Promise<boolean> {
  return runInOrder(async () => {
    const product = parseProduct(input);
    if (!product) {
      console.error('Invalid product passed to addToBasket:', input);
      showToast(ADD_FAILED_MESSAGE, true);
      return false;
    }

    let updated: BasketResponse;
    try {
      updated = await addItemToCurrentBasket(product.id);
    } catch (error) {
      console.error('Unable to add to the basket:', error);
      showToast(errorMessage(error, ADD_FAILED_MESSAGE), true);
      return false;
    }
    basket = updated;
    clearCheckoutSnapshot();
    renderBasketPage();

    const name =
      updated.items.find((item) => item.id === product.id)?.name ??
      product.name;
    const addedCount = nextAddCount(recentAdd, product.id);
    showToast(addedMessage(name, addedCount));
    recentAdd = { productId: product.id, count: addedCount };
    return true;
  });
}

async function recoverFromFailedUpdate(error: unknown): Promise<void> {
  console.error('Unable to update the basket:', error);
  if (!(error instanceof BasketApiError && error.isNotFound)) {
    showToast(errorMessage(error, UPDATE_FAILED_MESSAGE), true);
  }
  // Reload so the page always shows what the server really holds.
  await loadBasket();
}

function changeQuantity(productId: string, change: number): Promise<void> {
  return runInOrder(async () => {
    const basketId = readBasketId();
    try {
      if (basketId === null) {
        throw new BasketApiError(404, 'Basket not found.');
      }
      basket = await changeBasketItemQuantity(basketId, productId, change);
      clearCheckoutSnapshot();
    } catch (error) {
      await recoverFromFailedUpdate(error);
    }
    renderBasketPage();
  });
}

function removeItem(productId: string): Promise<void> {
  return runInOrder(async () => {
    const removed = basket?.items.find((item) => item.id === productId);
    const basketId = readBasketId();
    try {
      if (basketId === null) {
        throw new BasketApiError(404, 'Basket not found.');
      }
      await removeBasketItem(basketId, productId);
      clearCheckoutSnapshot();
      await loadBasket();
      if (removed) {
        showToast(`${removed.name} removed from your basket`);
      }
    } catch (error) {
      await recoverFromFailedUpdate(error);
    }
    renderBasketPage();
  });
}

function updateBadges(): void {
  if (basket === null) {
    return;
  }
  const { itemCount } = basket;
  for (const badge of document.querySelectorAll('[data-basket-count]')) {
    badge.textContent = String(itemCount);
  }
  for (const label of document.querySelectorAll('[data-basket-link-label]')) {
    label.textContent = `Basket, ${formatItemCount(itemCount)}`;
  }
}

let toastTimer: ReturnType<typeof setTimeout> | undefined;
let recentAdd: RecentAdd | null = null;
function showToast(message: string, isError = false): void {
  recentAdd = null;
  let toast = document.querySelector<HTMLElement>('[data-basket-toast]');
  if (!toast) {
    toast = document.createElement('div');
    toast.className = 'basket-toast';
    toast.setAttribute('data-basket-toast', '');
    toast.setAttribute('role', 'status');
    document.body.append(toast);
  }
  const visibleToast = toast;
  visibleToast.textContent = message;
  visibleToast.classList.toggle('basket-toast--error', isError);
  visibleToast.classList.add('basket-toast--visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    visibleToast.classList.remove('basket-toast--visible');
    recentAdd = null;
  }, TOAST_DURATION_MS);
}

function showAlert(message: string): void {
  const alert = document.querySelector<HTMLElement>('[data-basket-alert]');
  if (!alert) {
    return;
  }
  alert.textContent = message;
  alert.hidden = message === '';
}

function currentAlertMessage(): string {
  if (basket === null) {
    return LOAD_FAILED_ALERT;
  }
  if (!storageWorks) {
    return STORAGE_BLOCKED_ALERT;
  }
  if (checkoutFailed) {
    return CHECKOUT_FAILED_ALERT;
  }
  return basketWasReset ? BASKET_RESET_ALERT : '';
}

function createButton(
  text: string,
  label: string,
  onClick: () => void,
): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = text;
  button.setAttribute('aria-label', label);
  button.addEventListener('click', onClick);
  return button;
}

function createCell(
  label: string,
  content: string | Node,
  className?: string,
): HTMLTableCellElement {
  const cell = document.createElement('td');
  cell.dataset.label = label;
  if (className) {
    cell.className = className;
  }
  if (typeof content === 'string') {
    cell.textContent = content;
  } else {
    cell.append(content);
  }
  return cell;
}

function createRow(line: BasketLine, maxQuantity: number): HTMLTableRowElement {
  const row = document.createElement('tr');

  const name = document.createElement('th');
  name.scope = 'row';
  name.textContent = line.name;
  row.append(name);

  row.append(createCell('Unit price', formatPrice(line.unitPricePence)));

  const quantity = document.createElement('div');
  quantity.className = 'basket-quantity';
  const decrease = createButton(
    '−',
    `Decrease quantity of ${line.name}`,
    () => {
      void changeQuantity(line.id, -1);
    },
  );
  decrease.disabled = line.quantity <= 1;
  const value = document.createElement('span');
  value.className = 'basket-quantity__value';
  value.textContent = String(line.quantity);
  const increase = createButton(
    '+',
    `Increase quantity of ${line.name}`,
    () => {
      void changeQuantity(line.id, 1);
    },
  );
  increase.disabled = line.quantity >= maxQuantity;
  quantity.append(decrease, value, increase);
  row.append(createCell('Quantity', quantity));

  row.append(
    createCell(
      'Line total',
      formatPrice(line.lineTotalPence),
      'basket-line-total',
    ),
  );

  const remove = createButton('Remove', `Remove ${line.name}`, () => {
    void removeItem(line.id);
  });
  remove.className = 'basket-remove';
  row.append(createCell('', remove));

  return row;
}

function renderBasketPage(): void {
  updateBadges();

  const page = document.querySelector<HTMLElement>('[data-basket]');
  if (!page || !isLoaded) {
    return;
  }

  // When the basket could not be loaded, show neither the contents nor the
  // empty message so the customer never sees wrong information.
  const lines = basket?.items ?? [];
  const isEmpty = basket !== null && lines.length === 0;

  getElement<HTMLElement>('[data-basket-empty]', page).hidden = !isEmpty;
  getElement<HTMLElement>('[data-basket-contents]', page).hidden =
    basket === null || isEmpty;
  getElement<HTMLButtonElement>('[data-basket-checkout]', page).disabled =
    basket === null || isEmpty;

  const maxQuantity = basket?.maxQuantity ?? MAX_QUANTITY;
  getElement('[data-basket-items]', page).replaceChildren(
    ...lines.map((line) => createRow(line, maxQuantity)),
  );
  getElement('[data-basket-total]', page).textContent = formatPrice(
    basket?.totalPence ?? 0,
  );
  getElement('[data-basket-item-count]', page).textContent = formatItemCount(
    basket?.itemCount ?? 0,
  );

  showAlert(currentAlertMessage());
}

function goToCheckout(): Promise<void> {
  return runInOrder(async () => {
    // Re-read the basket so the snapshot is exactly what the server holds now.
    await loadBasket();
    if (basket === null || basket.items.length === 0) {
      renderBasketPage();
      return;
    }

    const snapshot = JSON.stringify(
      createCheckoutSnapshot(basket.items, new Date()),
    );

    try {
      if (!storageWorks) {
        throw new Error('Basket storage is unavailable');
      }
      sessionStorage.setItem(CHECKOUT_KEY, snapshot);
      if (sessionStorage.getItem(CHECKOUT_KEY) !== snapshot) {
        throw new Error('Checkout snapshot did not save correctly');
      }
    } catch (error) {
      console.error('Unable to send the basket to checkout:', error);
      // Never leave a stale or partial snapshot for the checkout page to show.
      try {
        sessionStorage.removeItem(CHECKOUT_KEY);
      } catch {
        // Storage is unusable, so there is nothing to clean up.
      }
      checkoutFailed = true;
      renderBasketPage();
      return;
    }

    checkoutFailed = false;
    renderBasketPage();
    showToast('Your basket is ready for checkout');
  });
}

function refreshBasket(): Promise<void> {
  return runInOrder(async () => {
    await loadBasket();
    renderBasketPage();
  });
}

document.addEventListener('click', (event) => {
  if (!(event.target instanceof Element)) {
    return;
  }
  const addButton = event.target.closest('[data-add-to-basket]');
  if (addButton) {
    void addToBasket({
      id: addButton.getAttribute('data-product-id'),
      name: addButton.getAttribute('data-product-name'),
      price: addButton.getAttribute('data-product-price'),
    });
    return;
  }
  if (event.target.closest('[data-basket-checkout]')) {
    void goToCheckout();
  }
});

// Re-load when returning via the back button so the page is never stale.
window.addEventListener('pageshow', (event) => {
  if (event.persisted) {
    void refreshBasket();
  }
});

window.Basket = {
  add: addToBasket,
  getItems: () => calculateTotals(basket?.items ?? []),
};

removeLegacyBasket();
void refreshBasket();
