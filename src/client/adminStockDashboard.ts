import {
  LOAD_ERROR_MESSAGE,
  LOAD_ERROR_TITLE,
  renderLowStockTable,
  renderStockAccessDenied,
  renderStockError,
  renderSummaryCards,
} from '../util/adminStockViews';
import {
  AccessDeniedError,
  loginRedirectFor,
  SessionExpiredError,
} from '../util/apiErrors';
import { createStockApi } from '../util/stockApi';

function getElement<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`Element not found: ${selector}`);
  return element;
}

const state = getElement<HTMLElement>('[data-stock-state]');
const content = getElement<HTMLElement>('[data-stock-content]');
const summary = getElement<HTMLElement>('[data-stock-summary]');
const lowStock = getElement<HTMLElement>('[data-stock-low]');

const api = createStockApi();

function showState(html: string): void {
  content.hidden = true;
  state.innerHTML = html;
  state.hidden = false;
}

async function load(): Promise<void> {
  showState('<p class="admin-empty">Loading inventory&hellip;</p>');
  try {
    const dashboard = await api.getDashboard();
    summary.innerHTML = renderSummaryCards(dashboard.summary);
    lowStock.innerHTML = renderLowStockTable(dashboard.lowStockProducts);
    state.hidden = true;
    content.hidden = false;
  } catch (error) {
    if (error instanceof SessionExpiredError) {
      window.location.assign(loginRedirectFor(window.location));
    } else if (error instanceof AccessDeniedError) {
      showState(renderStockAccessDenied());
    } else {
      console.error('Unable to load the inventory dashboard:', error);
      showState(renderStockError(LOAD_ERROR_TITLE, LOAD_ERROR_MESSAGE));
    }
  }
}

state.addEventListener('click', (event) => {
  if (event.target instanceof Element && event.target.closest('[data-retry]')) {
    void load();
  }
});

void load();
