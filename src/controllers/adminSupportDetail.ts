import { findAdminTicket, updateTicketStatus } from '../util/adminSupport';
import {
  renderAdminTicketDetail,
  renderAdminTicketMessage,
} from '../util/adminSupportViews';
import {
  TICKET_ID_PATTERN,
  UnauthorisedError,
  validateTicketStatus,
} from '../util/supportTickets';
import { renderStatus } from '../util/supportViews';

const container = document.querySelector<HTMLElement>('[data-ticket-detail]');
if (!container) {
  throw new Error('Element not found: [data-ticket-detail]');
}
const detail = container;

function getElement<T extends Element>(selector: string): T {
  const element = detail.querySelector<T>(selector);
  if (!element) throw new Error(`Element not found: ${selector}`);
  return element;
}

function redirectToLogin(): void {
  window.location.assign('/login');
}

function setUpStatusForm(ticketId: string): void {
  const form = getElement<HTMLFormElement>('[data-ticket-status-form]');
  const select = getElement<HTMLSelectElement>('#ticket-status');
  const save = getElement<HTMLButtonElement>('[data-ticket-status-save]');
  const error = getElement<HTMLElement>('[data-ticket-status-error]');
  const success = getElement<HTMLElement>('[data-ticket-status-success]');
  const display = getElement<HTMLElement>('[data-ticket-status]');

  function show(element: HTMLElement, message: string): void {
    error.hidden = true;
    success.hidden = true;
    element.textContent = message;
    element.hidden = false;
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const status = select.value;
    const problem = validateTicketStatus(status);
    if (problem) {
      show(error, problem);
      return;
    }

    save.disabled = true;
    const result = await updateTicketStatus(ticketId, status);
    save.disabled = false;

    if (result.ok) {
      display.innerHTML = renderStatus(result.ticket?.status ?? status);
      show(success, result.message);
    } else if (result.unauthorised) {
      redirectToLogin();
    } else {
      show(error, result.message);
    }
  });
}

async function loadTicket(): Promise<void> {
  const id = decodeURIComponent(
    window.location.pathname.split('/').filter(Boolean).pop() ?? '',
  );
  if (!TICKET_ID_PATTERN.test(id)) {
    detail.innerHTML = renderAdminTicketMessage(
      'Ticket not found',
      'We could not find a ticket with that ID.',
    );
    return;
  }

  try {
    const ticket = await findAdminTicket(id);
    if (!ticket) {
      detail.innerHTML = renderAdminTicketMessage(
        'Ticket not found',
        'We could not find a ticket with that ID.',
      );
      return;
    }
    detail.innerHTML = renderAdminTicketDetail(ticket);
    setUpStatusForm(ticket.id);
  } catch (error) {
    if (error instanceof UnauthorisedError) return redirectToLogin();
    console.error('Unable to load ticket:', error);
    detail.innerHTML = renderAdminTicketMessage(
      'Unable to load ticket',
      'Something went wrong while loading this ticket. Please try again.',
    );
  }
}

void loadTicket();
