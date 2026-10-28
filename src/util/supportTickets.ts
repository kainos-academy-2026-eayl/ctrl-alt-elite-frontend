import { failureMessage, submitJson } from './apiResponse';

export const TICKETS_PATH = '/api/support/tickets';
export const MAX_SUBJECT_LENGTH = 150;
export const MAX_DESCRIPTION_LENGTH = 2000;
export const TICKET_ID_PATTERN = /^[A-Za-z0-9-]{1,64}$/;

export const TICKET_CATEGORIES = [
  { value: 'ACCOUNT_ISSUE', label: 'Account Issue' },
  { value: 'ORDER_ISSUE', label: 'Order Issue' },
  { value: 'DELIVERY_ISSUE', label: 'Delivery Issue' },
  { value: 'RETURNS_REFUNDS', label: 'Returns & Refunds' },
  { value: 'PRODUCT_ENQUIRY', label: 'Product Enquiry' },
  { value: 'OTHER', label: 'Other' },
] as const;

export const TICKET_STATUSES = [
  { value: 'OPEN', label: 'Open' },
  { value: 'IN_PROGRESS', label: 'In Progress' },
  { value: 'RESOLVED', label: 'Resolved' },
  { value: 'CLOSED', label: 'Closed' },
] as const;

export interface Ticket {
  id: string;
  subject: string;
  description: string;
  category: string;
  status: string;
  createdAt: string;
}

export interface TicketForm {
  subject: string;
  category: string;
  description: string;
}

export interface CreateTicketResult {
  ok: boolean;
  message: string;
  ticket?: Ticket;
  // The session has expired, so the customer needs to log in again.
  unauthorised?: boolean;
}

export class UnauthorisedError extends Error {
  constructor() {
    super('The customer session is not authorised.');
    this.name = 'UnauthorisedError';
  }
}

const CREATE_ERROR_MESSAGE =
  'Unable to submit your ticket. Please try again later.';

function normaliseKey(value: string): string {
  return value
    .trim()
    .toUpperCase()
    .replaceAll(/[\s-]+/g, '_');
}

// The backend may send "IN_PROGRESS" or "In Progress"; unknown values are shown as sent.
export function statusLabel(status: string): string {
  const key = normaliseKey(status);
  return TICKET_STATUSES.find((item) => item.value === key)?.label ?? status;
}

export function statusKey(status: string): string {
  const key = normaliseKey(status);
  return TICKET_STATUSES.some((item) => item.value === key) ? key : 'UNKNOWN';
}

export function categoryKey(category: string): string {
  return normaliseKey(category.replaceAll('&', ''));
}

export function categoryLabel(category: string): string {
  const key = categoryKey(category);
  return (
    TICKET_CATEGORIES.find((item) => item.value === key)?.label ?? category
  );
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Display only: UUIDs are shortened to their first segment, while links and
// API calls keep using the full ID.
export function formatTicketId(id: string): string {
  const display = UUID_PATTERN.test(id) ? id.slice(0, 8).toUpperCase() : id;
  return `#${display}`;
}

export function formatTicketDate(isoDate: string): string {
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) return isoDate;
  return date.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

// Returns a user-facing message, or null when the form can be submitted.
export function validateTicketForm(form: TicketForm): string | null {
  const subject = form.subject.trim();
  const description = form.description.trim();
  if (!subject) return 'Enter a subject.';
  if (subject.length > MAX_SUBJECT_LENGTH) {
    return `The subject must be ${MAX_SUBJECT_LENGTH} characters or fewer.`;
  }
  if (!TICKET_CATEGORIES.some((item) => item.value === form.category)) {
    return 'Select an issue category.';
  }
  if (!description) return 'Enter a description.';
  if (description.length > MAX_DESCRIPTION_LENGTH) {
    return `The description must be ${MAX_DESCRIPTION_LENGTH} characters or fewer.`;
  }
  return null;
}

// Returns a user-facing message, or null when the status is one of the four.
export function validateTicketStatus(status: string): string | null {
  return TICKET_STATUSES.some((item) => item.value === status)
    ? null
    : 'Select a valid status.';
}

function text(value: unknown): string | undefined {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return undefined;
}

export function parseTicket(value: unknown): Ticket | null {
  if (typeof value !== 'object' || value === null) return null;
  const record = value as Record<string, unknown>;
  const id = text(record.id);
  const subject = text(record.subject);
  const status = text(record.status);
  const createdAt = text(record.createdAt);
  if (
    id === undefined ||
    !TICKET_ID_PATTERN.test(id) ||
    subject === undefined ||
    status === undefined ||
    createdAt === undefined
  ) {
    return null;
  }
  return {
    id,
    subject,
    description: text(record.description) ?? '',
    category: text(record.category) ?? '',
    status,
    createdAt,
  };
}

// The backend returns either the ticket itself or { ticket }.
export function unwrapTicket(body: unknown): unknown {
  return typeof body === 'object' && body !== null && 'ticket' in body
    ? body.ticket
    : body;
}

// The backend returns either an array or { tickets }. Any malformed entry fails
// the whole list rather than silently hiding tickets.
export function parseTicketList<T>(
  body: unknown,
  parse: (value: unknown) => T | null,
): T[] {
  const list =
    typeof body === 'object' && body !== null && 'tickets' in body
      ? body.tickets
      : body;
  if (!Array.isArray(list)) {
    throw new Error('Tickets response was not in the expected format.');
  }
  const tickets: T[] = [];
  for (const entry of list) {
    const ticket = parse(entry);
    if (ticket === null) {
      throw new Error('Tickets response was not in the expected format.');
    }
    tickets.push(ticket);
  }
  return tickets;
}

export function newestFirst<T extends { createdAt: string }>(
  tickets: T[],
): T[] {
  return tickets.sort(
    (a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt) || 0,
  );
}

export interface TicketApiOptions {
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

export const DEFAULT_TIMEOUT_MS = 10_000;

export async function getJson(
  path: string,
  {
    fetchImpl = (input, init) => fetch(input, init),
    timeoutMs,
  }: TicketApiOptions,
): Promise<Response> {
  const response = await fetchImpl(path, {
    headers: { accept: 'application/json' },
    signal: AbortSignal.timeout(timeoutMs ?? DEFAULT_TIMEOUT_MS),
  });
  if (response.status === 401) throw new UnauthorisedError();
  return response;
}

export async function listTickets(
  options: TicketApiOptions = {},
): Promise<Ticket[]> {
  const response = await getJson(TICKETS_PATH, options);
  if (!response.ok) {
    throw new Error(`Tickets request failed with status ${response.status}`);
  }
  return newestFirst(parseTicketList(await response.json(), parseTicket));
}

// Resolves to undefined when the ticket does not exist (or belongs to someone else).
export async function findTicket(
  id: string,
  options: TicketApiOptions = {},
): Promise<Ticket | undefined> {
  const response = await getJson(
    `${TICKETS_PATH}/${encodeURIComponent(id)}`,
    options,
  );
  if (response.status === 404 || response.status === 403) {
    await response.body?.cancel();
    return undefined;
  }
  if (!response.ok) {
    throw new Error(`Ticket request failed with status ${response.status}`);
  }
  const ticket = parseTicket(unwrapTicket(await response.json()));
  if (!ticket) {
    throw new Error('Ticket response was not in the expected format.');
  }
  return ticket;
}

// Never throws: a failure is returned as a result.
export async function createTicket(
  form: TicketForm,
  {
    fetchImpl = (input, init) => fetch(input, init),
    timeoutMs,
  }: TicketApiOptions = {},
): Promise<CreateTicketResult> {
  const result = await submitJson(
    TICKETS_PATH,
    'POST',
    {
      subject: form.subject.trim(),
      category: form.category,
      description: form.description.trim(),
    },
    fetchImpl,
    timeoutMs ?? DEFAULT_TIMEOUT_MS,
  );
  if (result?.ok) {
    const ticket = parseTicket(unwrapTicket(result.body));
    return {
      ok: true,
      message: result.message ?? 'Your ticket has been submitted.',
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
  return { ok: false, message: failureMessage(result, CREATE_ERROR_MESSAGE) };
}
