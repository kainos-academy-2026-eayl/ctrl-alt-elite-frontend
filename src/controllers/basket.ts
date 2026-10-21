/*
 * KAN-28 Shopping basket.
 *
 * The basket lives in sessionStorage, so it survives page navigation and
 * refreshes in the same browser tab but is cleared when the tab is closed.
 * The basket page (/basket) is rendered from src/views/basket.njk.
 *
 * Product pages – add this markup to get a working "Add to Basket" button:
 *   <link rel="stylesheet" href="/assets/basket.css" />
 *   <script src="/controllers/basket.js" defer></script>
 *   <button type="button" data-add-to-basket data-product-id="lamp-01"
 *     data-product-name="Desk Lamp" data-product-price="24.99">Add to Basket</button>
 * Any element with a [data-basket-count] attribute shows the live item count,
 * and [data-basket-link-label] gets screen reader text like "Basket, 2 items".
 *
 * Checkout – clicking "Checkout" saves a snapshot of the basket but stays on
 * the basket page; navigating to the checkout page is a separate ticket.
 * The checkout page can read the snapshot saved when "Checkout" was clicked:
 *   JSON.parse(sessionStorage.getItem('ctrl-alt-elite:checkout'))
 *   => { version, createdAt, itemCount, totalPence,
 *        items: [{ id, name, unitPricePence, quantity, lineTotalPence }] }
 * Prices are whole pence to avoid floating point rounding errors.
 */

import {
  addedMessage,
  addItem,
  type BasketItem,
  type BasketLine,
  type BasketTotals,
  calculateTotals,
  changeQuantity as changeItemQuantity,
  createCheckoutSnapshot,
  formatItemCount,
  formatPrice,
  MAX_QUANTITY,
  maxQuantityMessage,
  nextAddCount,
  type ProductInput,
  parseProduct,
  parseSavedBasket,
  type RecentAdd,
  removeItem as removeBasketItem,
} from './lib/basketLogic';

declare global {
  interface Window {
    Basket: {
      add: (product: ProductInput) => boolean;
      getItems: () => BasketTotals;
    };
  }
}

const BASKET_KEY = 'ctrl-alt-elite:basket';
const CHECKOUT_KEY = 'ctrl-alt-elite:checkout';
const TOAST_DURATION_MS = 3000;

// Used when sessionStorage is blocked (e.g. strict privacy settings).
let memoryBasket: BasketItem[] = [];
let storageWorks = true;
let basketWasRepaired = false;

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

function readBasket(): BasketItem[] {
  if (!storageWorks) {
    return memoryBasket.map((item) => ({ ...item }));
  }

  let raw: string | null;
  try {
    raw = sessionStorage.getItem(BASKET_KEY);
  } catch (error) {
    console.error('Basket storage is unavailable:', error);
    storageWorks = false;
    return memoryBasket.map((item) => ({ ...item }));
  }

  const { items, repaired } = parseSavedBasket(raw);
  if (repaired) {
    console.error('Saved basket was unreadable or invalid, so it was repaired');
    basketWasRepaired = true;
    writeBasket(items);
  }
  return items;
}

function writeBasket(items: BasketItem[]): void {
  memoryBasket = items.map((item) => ({ ...item }));
  if (!storageWorks) {
    return;
  }
  try {
    sessionStorage.setItem(BASKET_KEY, JSON.stringify(items));
    // The basket changed, so any earlier checkout snapshot is now out of date.
    sessionStorage.removeItem(CHECKOUT_KEY);
  } catch (error) {
    console.error('Unable to save the basket:', error);
    storageWorks = false;
  }
}

function addToBasket(input: ProductInput): boolean {
  const product = parseProduct(input);
  if (!product) {
    console.error('Invalid product passed to addToBasket:', input);
    showToast('Sorry, we could not add that item. Please try again.', true);
    return false;
  }

  const result = addItem(readBasket(), product);
  if (result.status === 'at-max') {
    showToast(maxQuantityMessage(product.name), true);
    return false;
  }
  writeBasket(result.items);
  updateBadges();

  const addedCount = nextAddCount(recentAdd, product.id);
  showToast(addedMessage(product.name, addedCount));
  recentAdd = { productId: product.id, count: addedCount };
  return true;
}

function changeQuantity(id: string, change: number): void {
  writeBasket(changeItemQuantity(readBasket(), id, change));
  renderBasketPage();
}

function removeItem(id: string): void {
  const items = readBasket();
  const removed = items.find((item) => item.id === id);
  writeBasket(removeBasketItem(items, id));
  renderBasketPage();
  if (removed) {
    showToast(`${removed.name} removed from your basket`);
  }
}

function updateBadges(): void {
  const { itemCount } = calculateTotals(readBasket());
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

function createRow(line: BasketLine): HTMLTableRowElement {
  const row = document.createElement('tr');

  const name = document.createElement('th');
  name.scope = 'row';
  name.textContent = line.name;
  row.append(name);

  row.append(createCell('Unit price', formatPrice(line.unitPricePence)));

  const quantity = document.createElement('div');
  quantity.className = 'basket-quantity';
  const decrease = createButton('−', `Decrease quantity of ${line.name}`, () =>
    changeQuantity(line.id, -1),
  );
  decrease.disabled = line.quantity <= 1;
  const value = document.createElement('span');
  value.className = 'basket-quantity__value';
  value.textContent = String(line.quantity);
  const increase = createButton('+', `Increase quantity of ${line.name}`, () =>
    changeQuantity(line.id, 1),
  );
  increase.disabled = line.quantity >= MAX_QUANTITY;
  quantity.append(decrease, value, increase);
  row.append(createCell('Quantity', quantity));

  row.append(
    createCell(
      'Line total',
      formatPrice(line.lineTotalPence),
      'basket-line-total',
    ),
  );

  const remove = createButton('Remove', `Remove ${line.name}`, () =>
    removeItem(line.id),
  );
  remove.className = 'basket-remove';
  row.append(createCell('', remove));

  return row;
}

function renderBasketPage(): void {
  updateBadges();

  const page = document.querySelector<HTMLElement>('[data-basket]');
  if (!page) {
    return;
  }

  const { lines, itemCount, totalPence } = calculateTotals(readBasket());
  const isEmpty = lines.length === 0;

  getElement<HTMLElement>('[data-basket-empty]', page).hidden = !isEmpty;
  getElement<HTMLElement>('[data-basket-contents]', page).hidden = isEmpty;
  getElement<HTMLButtonElement>('[data-basket-checkout]', page).disabled =
    isEmpty;

  getElement('[data-basket-items]', page).replaceChildren(
    ...lines.map(createRow),
  );
  getElement('[data-basket-total]', page).textContent = formatPrice(totalPence);
  getElement('[data-basket-item-count]', page).textContent =
    formatItemCount(itemCount);

  if (!storageWorks) {
    showAlert(
      'Your browser is blocking storage, so your basket will be lost if you leave this page and checkout is unavailable. Please allow site data and refresh the page.',
    );
  } else if (basketWasRepaired) {
    showAlert(
      'Some items in your basket could not be loaded and have been removed. Please check your basket before continuing.',
    );
  }
}

function goToCheckout(): void {
  const items = readBasket();
  if (items.length === 0) {
    renderBasketPage();
    return;
  }

  const snapshot = JSON.stringify(createCheckoutSnapshot(items, new Date()));

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
    showAlert(
      "We couldn't take your basket to checkout. Your items are still in your basket – please try again. If this keeps happening, refresh the page or allow site data in your browser settings.",
    );
    return;
  }

  showAlert('');
  showToast('Your basket is ready for checkout');
}

document.addEventListener('click', (event) => {
  if (!(event.target instanceof Element)) {
    return;
  }
  const addButton = event.target.closest('[data-add-to-basket]');
  if (addButton) {
    addToBasket({
      id: addButton.getAttribute('data-product-id'),
      name: addButton.getAttribute('data-product-name'),
      price: addButton.getAttribute('data-product-price'),
    });
    return;
  }
  if (event.target.closest('[data-basket-checkout]')) {
    goToCheckout();
  }
});

// Re-render when returning via the back button so the page is never stale.
window.addEventListener('pageshow', (event) => {
  if (event.persisted) {
    renderBasketPage();
  }
});

window.Basket = {
  add: addToBasket,
  getItems: () => calculateTotals(readBasket()),
};

renderBasketPage();
