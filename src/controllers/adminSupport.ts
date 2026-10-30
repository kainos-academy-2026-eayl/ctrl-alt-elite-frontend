import {
  filterTickets,
  hasTicketFilters,
  listAdminTickets,
  readTicketQuery,
} from '../util/adminSupport';
import {
  renderAdminTicketList,
  renderAdminTicketsEmpty,
  renderAdminTicketsError,
  renderTicketCount,
} from '../util/adminSupportViews';
import { UnauthorisedError } from '../util/supportTickets';

function getElement<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) {
    throw new Error(`Element not found: ${selector}`);
  }
  return element;
}

const results = getElement<HTMLElement>('[data-tickets-results]');
const total = getElement<HTMLElement>('[data-total-tickets]');
const searchInput = getElement<HTMLInputElement>('#ticket-search');
const statusSelect = getElement<HTMLSelectElement>('#ticket-status-filter');
const categorySelect = getElement<HTMLSelectElement>('#ticket-category-filter');

const query = readTicketQuery(new URLSearchParams(window.location.search));
searchInput.value = query.search;
statusSelect.value = query.status;
categorySelect.value = query.category;

async function loadTickets(): Promise<void> {
  try {
    const tickets = await listAdminTickets();
    const matching = filterTickets(tickets, query);
    total.textContent = renderTicketCount(matching.length, tickets.length);
    total.hidden = false;
    results.innerHTML =
      matching.length === 0
        ? renderAdminTicketsEmpty(hasTicketFilters(query))
        : renderAdminTicketList(matching);
  } catch (error) {
    if (error instanceof UnauthorisedError) {
      window.location.assign('/login');
      return;
    }
    console.error('Unable to load tickets:', error);
    total.hidden = true;
    results.innerHTML = renderAdminTicketsError(
      window.location.pathname + window.location.search,
    );
  }
}

void loadTickets();
