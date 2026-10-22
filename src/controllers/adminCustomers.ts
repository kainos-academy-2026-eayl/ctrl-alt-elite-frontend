import { CUSTOMERS_PER_PAGE, readCustomerQuery } from '../util/customers';
import {
  renderCustomersResults,
  renderErrorState,
  renderTotal,
} from '../util/customerViews';
import { createApiCustomerSource } from './customerApi';

function getElement<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) {
    throw new Error(`Element not found: ${selector}`);
  }
  return element;
}

const results = getElement<HTMLElement>('[data-customers-results]');
const total = getElement<HTMLElement>('[data-total-customers]');
const searchInput = getElement<HTMLInputElement>('#customer-search');
const emailInput = getElement<HTMLInputElement>('#customer-email');
const sortSelect = getElement<HTMLSelectElement>('#customer-sort');

const query = readCustomerQuery(new URLSearchParams(window.location.search));
searchInput.value = query.search;
emailInput.value = query.email;
sortSelect.value = query.sort;

async function loadCustomers(): Promise<void> {
  try {
    const page = await createApiCustomerSource().query({
      ...query,
      pageSize: CUSTOMERS_PER_PAGE,
    });
    total.textContent = renderTotal(page.totalCustomers);
    total.hidden = false;
    results.innerHTML = renderCustomersResults(page, query);
  } catch (error) {
    console.error('Unable to load customers:', error);
    total.hidden = true;
    results.innerHTML = renderErrorState(
      window.location.pathname + window.location.search,
    );
  }
}

void loadCustomers();
