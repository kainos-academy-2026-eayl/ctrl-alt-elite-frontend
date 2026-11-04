import {
  deleteProduct,
  filterProducts,
  hasInventoryFilters,
  listProducts,
  type Product,
  readInventoryQuery,
} from '../util/adminInventory';
import {
  renderCategoryOptions,
  renderInventoryCount,
  renderInventoryEmpty,
  renderInventoryError,
  renderInventoryList,
} from '../util/adminInventoryViews';
import { UnauthorisedError } from '../util/supportTickets';

const NOTICES: Record<string, string> = {
  created: 'Product added.',
  deleted: 'Product deleted.',
};

function getElement<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`Element not found: ${selector}`);
  return element;
}

const results = getElement<HTMLElement>('[data-inventory-results]');
const total = getElement<HTMLElement>('[data-total-products]');
const notice = getElement<HTMLElement>('[data-inventory-notice]');
const errorBox = getElement<HTMLElement>('[data-inventory-error]');
const searchInput = getElement<HTMLInputElement>('#inventory-search');
const categorySelect = getElement<HTMLSelectElement>('#inventory-category');

const params = new URLSearchParams(window.location.search);
const query = readInventoryQuery(params);
searchInput.value = query.search;

let products: Product[] = [];

function show(element: HTMLElement, message: string): void {
  notice.hidden = true;
  errorBox.hidden = true;
  element.textContent = message;
  element.hidden = false;
}

function render(): void {
  const matching = filterProducts(products, query);
  categorySelect.innerHTML = renderCategoryOptions(products, query.category);
  total.textContent = renderInventoryCount(matching.length, products.length);
  total.hidden = false;
  results.innerHTML =
    matching.length === 0
      ? renderInventoryEmpty(hasInventoryFilters(query))
      : renderInventoryList(matching);
}

async function load(): Promise<void> {
  try {
    products = await listProducts();
    render();
  } catch (error) {
    if (error instanceof UnauthorisedError) {
      window.location.assign('/login');
      return;
    }
    console.error('Unable to load products:', error);
    total.hidden = true;
    results.innerHTML = renderInventoryError(
      window.location.pathname + window.location.search,
    );
  }
}

results.addEventListener('click', async (event) => {
  const target = event.target;
  const button =
    target instanceof Element
      ? target.closest<HTMLButtonElement>('[data-delete-product]')
      : null;
  if (!button) return;
  const id = button.dataset.deleteProduct ?? '';
  const name = button.dataset.productName ?? 'this product';
  if (!window.confirm(`Delete "${name}"? This cannot be undone.`)) return;

  button.disabled = true;
  const result = await deleteProduct(id);
  if (result.ok) {
    products = products.filter((product) => product.id !== id);
    render();
    show(notice, NOTICES.deleted ?? result.message);
  } else if (result.unauthorised) {
    window.location.assign('/login');
  } else {
    button.disabled = false;
    show(errorBox, result.message);
  }
});

const flash = NOTICES[params.get('notice') ?? ''];
if (flash) show(notice, flash);

void load();
