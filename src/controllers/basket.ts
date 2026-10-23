/*
 * KAN-28 Shopping basket – browser controller.
 *
 * This file only handles the page: "Add to Basket" clicks, the basket page
 * (/basket, rendered from src/views/basket.njk), the item count badges and
 * notifications. Loading, saving and changing the basket is done by
 * BasketService (src/services/basketService.ts), which talks to the backend
 * basket API and keeps the basket id in sessionStorage.
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
  addedMessage,
  type BasketLine,
  type BasketResponse,
  type BasketTotals,
  calculateTotals,
  formatItemCount,
  formatPrice,
  MAX_QUANTITY,
  nextAddCount,
  type ProductInput,
  parseProduct,
  type RecentAdd,
} from '../models/basket';
import {
  BasketApiError,
  BasketService,
  isMissingBasket,
} from '../services/basketService';

declare global {
  interface Window {
    Basket: {
      add: (product: ProductInput) => Promise<boolean>;
      getItems: () => BasketTotals;
    };
  }
}

const TOAST_DURATION_MS = 3000;

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

const service = new BasketService(() => sessionStorage);

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

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof BasketApiError ? error.message : fallback;
}

async function addToBasket(input: ProductInput): Promise<boolean> {
  const product = parseProduct(input);
  if (!product) {
    console.error('Invalid product passed to addToBasket:', input);
    showToast(ADD_FAILED_MESSAGE, true);
    return false;
  }

  let updated: BasketResponse;
  try {
    updated = await service.addItem(product.id);
  } catch (error) {
    console.error('Unable to add to the basket:', error);
    showToast(errorMessage(error, ADD_FAILED_MESSAGE), true);
    return false;
  }
  renderBasketPage();

  const name =
    updated.items.find((item) => item.id === product.id)?.name ?? product.name;
  const addedCount = nextAddCount(recentAdd, product.id);
  showToast(addedMessage(name, addedCount));
  recentAdd = { productId: product.id, count: addedCount };
  return true;
}

function showUpdateError(error: unknown): void {
  // A missing basket is explained by the reset alert instead.
  if (!isMissingBasket(error)) {
    showToast(errorMessage(error, UPDATE_FAILED_MESSAGE), true);
  }
}

async function changeQuantity(
  productId: string,
  change: number,
): Promise<void> {
  try {
    await service.changeQuantity(productId, change);
  } catch (error) {
    showUpdateError(error);
  }
  renderBasketPage();
}

async function removeItem(productId: string): Promise<void> {
  try {
    const removed = await service.removeItem(productId);
    if (removed) {
      showToast(`${removed.name} removed from your basket`);
    }
  } catch (error) {
    showUpdateError(error);
  }
  renderBasketPage();
}

function updateBadges(): void {
  const { basket } = service;
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
  if (service.basket === null) {
    return LOAD_FAILED_ALERT;
  }
  if (!service.storageWorks) {
    return STORAGE_BLOCKED_ALERT;
  }
  if (service.checkoutFailed) {
    return CHECKOUT_FAILED_ALERT;
  }
  return service.basketWasReset ? BASKET_RESET_ALERT : '';
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
  if (!page || !service.isLoaded) {
    return;
  }

  const { basket } = service;

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

async function goToCheckout(): Promise<void> {
  const result = await service.prepareCheckout(new Date());
  renderBasketPage();
  if (result === 'saved') {
    showToast('Your basket is ready for checkout');
  }
}

async function refreshBasket(): Promise<void> {
  await service.refresh();
  renderBasketPage();
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
  getItems: () => calculateTotals(service.basket?.items ?? []),
};

service.removeLegacyBasket();
void refreshBasket();
