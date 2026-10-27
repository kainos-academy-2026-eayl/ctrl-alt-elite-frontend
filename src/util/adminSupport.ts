import { failureMessage, submitJson } from './apiResponse';
import {
  categoryKey,
  DEFAULT_TIMEOUT_MS,
  getJson,
  newestFirst,
  parseTicket,
  parseTicketList,
  statusKey,
  TICKET_CATEGORIES,
  TICKET_STATUSES,
  type Ticket,
  type TicketApiOptions,
  unwrapTicket,
  validateTicketStatus,
} from './supportTickets';

export const ADMIN_TICKETS_PATH = '/api/admin/support/tickets';
export const ADMIN_SUPPORT_PATH = '/admin/support';
export const MAX_TICKET_SEARCH_LENGTH = 200;

export interface AdminTicket extends Ticket {
  customerId: string;
  customerName: string;
  customerEmail: string;
}

export interface TicketQuery {
  search: string;
  status: string;
  category: string;
}

export interface StatusUpdateResult {
  ok: boolean;
  message: string;
  ticket?: AdminTicket;
  unauthorised?: boolean;
}

const STATUS_SUCCESS_MESSAGE = 'Ticket status updated.';
const STATUS_ERROR_MESSAGE =
  'Unable to update this ticket. Please try again later.';

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function textOrNumber(value: unknown): string {
  return typeof value === 'number' ? String(value) : text(value);
}

// Customer details arrive either nested under `customer` or as flat fields.
export function parseAdminTicket(value: unknown): AdminTicket | null {
  const ticket = parseTicket(value);
  if (!ticket) return null;
  const record = value as Record<string, unknown>;
  const nested =
    typeof record.customer === 'object' && record.customer !== null
      ? (record.customer as Record<string, unknown>)
      : {};
  const nestedName = [text(nested.firstName), text(nested.lastName)]
    .filter(Boolean)
    .join(' ');
  return {
    ...ticket,
    customerId: textOrNumber(nested.id) || textOrNumber(record.customerId),
    customerName: nestedName || text(nested.name) || text(record.customerName),
    customerEmail: text(nested.email) || text(record.customerEmail),
  };
}

function parseFilter(
  value: string | null,
  allowed: readonly { value: string }[],
): string {
  const key = (value ?? '').trim().toUpperCase();
  return allowed.some((item) => item.value === key) ? key : '';
}

export function readTicketQuery(searchParams: URLSearchParams): TicketQuery {
  return {
    search: (searchParams.get('q') ?? '')
      .trim()
      .slice(0, MAX_TICKET_SEARCH_LENGTH),
    status: parseFilter(searchParams.get('status'), TICKET_STATUSES),
    category: parseFilter(searchParams.get('category'), TICKET_CATEGORIES),
  };
}

export function hasTicketFilters(query: TicketQuery): boolean {
  return Boolean(query.search || query.status || query.category);
}

// The search matches the ticket ID (with or without "#"), customer name or subject.
export function filterTickets(
  tickets: AdminTicket[],
  query: TicketQuery,
): AdminTicket[] {
  const term = query.search.trim().toLowerCase().replace(/^#/, '');
  return tickets.filter((ticket) => {
    if (query.status && statusKey(ticket.status) !== query.status) return false;
    if (query.category && categoryKey(ticket.category) !== query.category) {
      return false;
    }
    if (!term) return true;
    return (
      ticket.id.toLowerCase().includes(term) ||
      ticket.customerName.toLowerCase().includes(term) ||
      ticket.subject.toLowerCase().includes(term)
    );
  });
}

export function adminTicketPath(id: string): string {
  return `${ADMIN_TICKETS_PATH}/${encodeURIComponent(id)}`;
}

export async function listAdminTickets(
  options: TicketApiOptions = {},
): Promise<AdminTicket[]> {
  const response = await getJson(ADMIN_TICKETS_PATH, options);
  if (!response.ok) {
    throw new Error(`Tickets request failed with status ${response.status}`);
  }
  return newestFirst(parseTicketList(await response.json(), parseAdminTicket));
}

// Resolves to undefined when the ticket does not exist.
export async function findAdminTicket(
  id: string,
  options: TicketApiOptions = {},
): Promise<AdminTicket | undefined> {
  const response = await getJson(adminTicketPath(id), options);
  if (response.status === 404) {
    await response.body?.cancel();
    return undefined;
  }
  if (!response.ok) {
    throw new Error(`Ticket request failed with status ${response.status}`);
  }
  const ticket = parseAdminTicket(unwrapTicket(await response.json()));
  if (!ticket) {
    throw new Error('Ticket response was not in the expected format.');
  }
  return ticket;
}

// Never throws: a failure is returned as a result. When the backend does not
// echo the ticket back, the caller keeps the one it already has.
export async function updateTicketStatus(
  id: string,
  status: string,
  {
    fetchImpl = (input, init) => fetch(input, init),
    timeoutMs = DEFAULT_TIMEOUT_MS,
  }: TicketApiOptions = {},
): Promise<StatusUpdateResult> {
  const problem = validateTicketStatus(status);
  if (problem) return { ok: false, message: problem };
  const result = await submitJson(
    `${adminTicketPath(id)}/status`,
    'PATCH',
    { status },
    fetchImpl,
    timeoutMs,
  );
  if (result?.ok) {
    const ticket = parseAdminTicket(unwrapTicket(result.body));
    return {
      ok: true,
      message: result.message ?? STATUS_SUCCESS_MESSAGE,
      ...(ticket ? { ticket } : {}),
    };
  }
  if (result?.status === 401) {
    return {
      ok: false,
      message: 'Your session has expired. Please log in again.',
      unauthorised: true,
    };
  }
  return { ok: false, message: failureMessage(result, STATUS_ERROR_MESSAGE) };
}
