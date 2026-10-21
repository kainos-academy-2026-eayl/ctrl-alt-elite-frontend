/*
 * KAN-28 Shopping basket.
 *
 * The basket lives in sessionStorage, so it survives page navigation and
 * refreshes in the same browser tab but is cleared when the tab is closed.
 * The basket page (/basket) is rendered from src/views/basket.njk.
 *
 * Product pages – add this markup to get a working "Add to Basket" button:
 *   <link rel="stylesheet" href="/Basket.css" />
 *   <script src="/Basket.js" defer></script>
 *   <button type="button" data-add-to-basket data-product-id="lamp-01"
 *     data-product-name="Desk Lamp" data-product-price="24.99">Add to Basket</button>
 * Any element with a [data-basket-count] attribute shows the live item count,
 * and [data-basket-link-label] gets screen reader text like "Basket, 2 items".
 *
 * Checkout page – read the snapshot saved when "Checkout" was clicked:
 *   JSON.parse(sessionStorage.getItem('ctrl-alt-elite:checkout'))
 *   => { version, createdAt, itemCount, totalPence,
 *        items: [{ id, name, unitPricePence, quantity, lineTotalPence }] }
 * Prices are whole pence to avoid floating point rounding errors.
 */
(() => {
  const BASKET_KEY = 'ctrl-alt-elite:basket';
  const CHECKOUT_KEY = 'ctrl-alt-elite:checkout';
  const DEFAULT_CHECKOUT_URL = '/checkout';
  const MAX_QUANTITY = 99;
  const TOAST_DURATION_MS = 3000;

  const currency = new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: 'GBP',
  });

  // Used when sessionStorage is blocked (e.g. strict privacy settings).
  let memoryBasket = [];
  let storageWorks = true;
  let basketWasRepaired = false;

  function formatPrice(pence) {
    return currency.format(pence / 100);
  }

  function isValidItem(item) {
    return (
      item !== null &&
      typeof item === 'object' &&
      typeof item.id === 'string' &&
      item.id !== '' &&
      typeof item.name === 'string' &&
      Number.isInteger(item.unitPricePence) &&
      item.unitPricePence >= 0 &&
      Number.isInteger(item.quantity) &&
      item.quantity >= 1 &&
      item.quantity <= MAX_QUANTITY
    );
  }

  function readBasket() {
    if (!storageWorks) {
      return memoryBasket.map((item) => ({ ...item }));
    }

    let raw;
    try {
      raw = sessionStorage.getItem(BASKET_KEY);
    } catch (error) {
      console.error('Basket storage is unavailable:', error);
      storageWorks = false;
      return memoryBasket.map((item) => ({ ...item }));
    }

    if (raw === null) {
      return [];
    }

    try {
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) {
        throw new Error('Saved basket is not a list');
      }
      const items = parsed.filter(isValidItem);
      if (items.length !== parsed.length) {
        basketWasRepaired = true;
        writeBasket(items);
      }
      return items;
    } catch (error) {
      console.error('Saved basket was unreadable, starting fresh:', error);
      basketWasRepaired = true;
      writeBasket([]);
      return [];
    }
  }

  function writeBasket(items) {
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

  function calculateTotals(items) {
    const lines = items.map((item) => ({
      ...item,
      lineTotalPence: item.unitPricePence * item.quantity,
    }));
    return {
      lines,
      itemCount: lines.reduce((sum, line) => sum + line.quantity, 0),
      totalPence: lines.reduce((sum, line) => sum + line.lineTotalPence, 0),
    };
  }

  function addToBasket({ id, name, price }) {
    const productId = String(id ?? '').trim();
    const productName = String(name ?? '').trim();
    const unitPricePence = Math.round(Number.parseFloat(price) * 100);

    if (
      productId === '' ||
      productName === '' ||
      !Number.isFinite(unitPricePence) ||
      unitPricePence < 0
    ) {
      console.error('Invalid product passed to addToBasket:', {
        id,
        name,
        price,
      });
      showToast('Sorry, we could not add that item. Please try again.', true);
      return false;
    }

    const items = readBasket();
    const existing = items.find((item) => item.id === productId);
    if (existing) {
      existing.quantity = Math.min(existing.quantity + 1, MAX_QUANTITY);
    } else {
      items.push({
        id: productId,
        name: productName,
        unitPricePence,
        quantity: 1,
      });
    }
    writeBasket(items);
    updateBadges();
    showToast(`${productName} added to your basket`);
    return true;
  }

  function changeQuantity(id, change) {
    const items = readBasket();
    const item = items.find((entry) => entry.id === id);
    if (!item) {
      return;
    }
    item.quantity = Math.min(Math.max(item.quantity + change, 1), MAX_QUANTITY);
    writeBasket(items);
    renderBasketPage();
  }

  function removeItem(id) {
    const items = readBasket();
    const removed = items.find((item) => item.id === id);
    writeBasket(items.filter((item) => item.id !== id));
    renderBasketPage();
    if (removed) {
      showToast(`${removed.name} removed from your basket`);
    }
  }

  function updateBadges() {
    const { itemCount } = calculateTotals(readBasket());
    for (const badge of document.querySelectorAll('[data-basket-count]')) {
      badge.textContent = String(itemCount);
    }
    for (const label of document.querySelectorAll('[data-basket-link-label]')) {
      label.textContent = `Basket, ${itemCount} ${itemCount === 1 ? 'item' : 'items'}`;
    }
  }

  let toastTimer;
  function showToast(message, isError = false) {
    let toast = document.querySelector('[data-basket-toast]');
    if (!toast) {
      toast = document.createElement('div');
      toast.className = 'basket-toast';
      toast.setAttribute('data-basket-toast', '');
      toast.setAttribute('role', 'status');
      document.body.append(toast);
    }
    toast.textContent = message;
    toast.classList.toggle('basket-toast--error', isError);
    toast.classList.add('basket-toast--visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      toast.classList.remove('basket-toast--visible');
    }, TOAST_DURATION_MS);
  }

  function showAlert(message) {
    const alert = document.querySelector('[data-basket-alert]');
    if (!alert) {
      return;
    }
    alert.textContent = message;
    alert.hidden = message === '';
  }

  function createButton(text, label, onClick) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = text;
    button.setAttribute('aria-label', label);
    button.addEventListener('click', onClick);
    return button;
  }

  function createCell(label, content, className) {
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

  function createRow(line) {
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
      () => changeQuantity(line.id, -1),
    );
    decrease.disabled = line.quantity <= 1;
    const value = document.createElement('span');
    value.className = 'basket-quantity__value';
    value.textContent = String(line.quantity);
    const increase = createButton(
      '+',
      `Increase quantity of ${line.name}`,
      () => changeQuantity(line.id, 1),
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

  function renderBasketPage() {
    updateBadges();

    const page = document.querySelector('[data-basket]');
    if (!page) {
      return;
    }

    const { lines, itemCount, totalPence } = calculateTotals(readBasket());
    const isEmpty = lines.length === 0;

    page.querySelector('[data-basket-empty]').hidden = !isEmpty;
    page.querySelector('[data-basket-contents]').hidden = isEmpty;
    page.querySelector('[data-basket-checkout]').disabled = isEmpty;

    page
      .querySelector('[data-basket-items]')
      .replaceChildren(...lines.map(createRow));
    page.querySelector('[data-basket-total]').textContent =
      formatPrice(totalPence);
    page.querySelector('[data-basket-item-count]').textContent =
      `${itemCount} ${itemCount === 1 ? 'item' : 'items'}`;

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

  function goToCheckout() {
    const { lines, itemCount, totalPence } = calculateTotals(readBasket());
    if (lines.length === 0) {
      renderBasketPage();
      return;
    }

    const snapshot = JSON.stringify({
      version: 1,
      createdAt: new Date().toISOString(),
      itemCount,
      totalPence,
      items: lines,
    });

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

    const checkoutUrl =
      document.querySelector('[data-basket]')?.dataset.checkoutUrl ||
      DEFAULT_CHECKOUT_URL;
    window.location.assign(checkoutUrl);
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
})();
