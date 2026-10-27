import {
  createTicket,
  findTicket,
  listTickets,
  TICKET_ID_PATTERN,
  UnauthorisedError,
  validateTicketForm,
} from '../util/supportTickets';
import {
  renderSupportMessage,
  renderTicketDetail,
  renderTicketList,
  SUPPORT_PATH,
} from '../util/supportViews';

function redirectToLogin(): void {
  window.location.assign('/login');
}

function getElement<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`Element not found: ${selector}`);
  return element;
}

async function showList(): Promise<void> {
  const container = getElement<HTMLElement>('[data-support-list]');
  try {
    container.innerHTML = renderTicketList(await listTickets());
  } catch (error) {
    if (error instanceof UnauthorisedError) return redirectToLogin();
    console.error('Unable to load tickets:', error);
    container.innerHTML = renderSupportMessage(
      'Unable to load your tickets',
      'Something went wrong while loading your tickets. Please try again.',
    );
  }
}

async function showDetail(): Promise<void> {
  const container = getElement<HTMLElement>('[data-support-detail]');
  const id = decodeURIComponent(
    window.location.pathname.split('/').filter(Boolean).pop() ?? '',
  );
  const notFound = renderSupportMessage(
    'Ticket not found',
    'We could not find a ticket with that ID.',
  );
  if (!TICKET_ID_PATTERN.test(id)) {
    container.innerHTML = notFound;
    return;
  }
  try {
    const ticket = await findTicket(id);
    container.innerHTML = ticket ? renderTicketDetail(ticket) : notFound;
  } catch (error) {
    if (error instanceof UnauthorisedError) return redirectToLogin();
    console.error('Unable to load ticket:', error);
    container.innerHTML = renderSupportMessage(
      'Unable to load this ticket',
      'Something went wrong while loading this ticket. Please try again.',
    );
  }
}

function setUpCreateForm(): void {
  const form = getElement<HTMLFormElement>('[data-ticket-form]');
  const submit = getElement<HTMLButtonElement>('[data-ticket-submit]');
  const error = getElement<HTMLElement>('[data-ticket-error]');

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const data = new FormData(form);
    const values = {
      subject: String(data.get('subject') ?? ''),
      category: String(data.get('category') ?? ''),
      description: String(data.get('description') ?? ''),
    };

    const problem = validateTicketForm(values);
    if (problem) {
      error.textContent = problem;
      error.hidden = false;
      return;
    }

    error.hidden = true;
    submit.disabled = true;
    const result = await createTicket(values);
    if (result.ok) {
      window.location.assign(
        result.ticket
          ? `${SUPPORT_PATH}/${encodeURIComponent(result.ticket.id)}`
          : SUPPORT_PATH,
      );
      return;
    }
    submit.disabled = false;
    if (result.unauthorised) return redirectToLogin();
    error.textContent = result.message;
    error.hidden = false;
  });
}

const page = document.querySelector<HTMLElement>('[data-support-page]')?.dataset
  .supportPage;
if (page === 'list') void showList();
else if (page === 'detail') void showDetail();
else if (page === 'new') setUpCreateForm();
