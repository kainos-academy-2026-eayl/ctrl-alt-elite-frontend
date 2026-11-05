import { ORDERS_PER_PAGE, readOrderQuery } from '../util/adminOrders';
import { createOrdersApi } from '../util/adminOrdersApi';
import {
  renderOrdersAccessDenied,
  renderOrdersError,
  renderOrdersResults,
  renderOrdersTotal,
} from '../util/adminOrderViews';
import {
  AccessDeniedError,
  loginRedirectFor,
  SessionExpiredError,
} from '../util/apiErrors';

function getElement<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) {
    throw new Error(`Element not found: ${selector}`);
  }
  return element;
}

const results = getElement<HTMLElement>('[data-orders-results]');
const total = getElement<HTMLElement>('[data-total-orders]');
const searchInput = getElement<HTMLInputElement>('#order-search');
const statusSelect = getElement<HTMLSelectElement>('#order-status');
const sortSelect = getElement<HTMLSelectElement>('#order-sort');

const query = readOrderQuery(new URLSearchParams(window.location.search));
searchInput.value = query.search;
statusSelect.value = query.status;
sortSelect.value = query.sort;

async function loadOrders(): Promise<void> {
  const api = createOrdersApi();
  try {
    let page = await api.listOrders(query, ORDERS_PER_PAGE);
    // A page past the end returns nothing, so fall back to the last real page.
    if (
      page.orders.length === 0 &&
      page.total > 0 &&
      query.page > page.totalPages
    ) {
      page = await api.listOrders(
        { ...query, page: page.totalPages },
        ORDERS_PER_PAGE,
      );
    }
    total.textContent = renderOrdersTotal(page.total);
    total.hidden = false;
    results.innerHTML = renderOrdersResults(page, {
      ...query,
      page: page.page,
    });
  } catch (error) {
    total.hidden = true;
    if (error instanceof SessionExpiredError) {
      window.location.assign(loginRedirectFor(window.location));
      return;
    }
    if (error instanceof AccessDeniedError) {
      results.innerHTML = renderOrdersAccessDenied();
      return;
    }
    console.error('Unable to load orders:', error);
    results.innerHTML = renderOrdersError(
      window.location.pathname + window.location.search,
    );
  }
}

void loadOrders();
