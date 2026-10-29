import { ADMIN_SUPPORT_PATH, type AdminTicket } from './adminSupport';
import { escapeHtml } from './customerViews';
import {
  categoryLabel,
  formatTicketDate,
  formatTicketId,
  statusKey,
  TICKET_STATUSES,
} from './supportTickets';
import { renderStatus } from './supportViews';

const UNKNOWN_CUSTOMER = 'Unknown customer';

function ticketHref(ticket: AdminTicket): string {
  return escapeHtml(`${ADMIN_SUPPORT_PATH}/${encodeURIComponent(ticket.id)}`);
}

function dateHtml(ticket: AdminTicket): string {
  return `<time datetime="${escapeHtml(ticket.createdAt)}">${escapeHtml(formatTicketDate(ticket.createdAt))}</time>`;
}

function customerName(ticket: AdminTicket): string {
  return ticket.customerName || ticket.customerEmail || UNKNOWN_CUSTOMER;
}

export function renderAdminTicketsEmpty(hasFilters: boolean): string {
  const message = hasFilters
    ? '<p class="admin-empty">No tickets match your search or filters.</p><p><a href="/admin/support">Clear search and filters</a></p>'
    : '<p class="admin-empty">Support tickets will appear here once customers submit them.</p>';
  return `<section class="admin-card customer-state" aria-labelledby="tickets-empty-heading"><h2 id="tickets-empty-heading">No tickets found</h2>${message}</section>`;
}

export function renderAdminTicketsError(retryUrl: string): string {
  return `<section class="admin-card customer-state" role="alert" aria-labelledby="tickets-error-heading"><h2 id="tickets-error-heading">Unable to load tickets</h2><p class="admin-empty">Something went wrong while loading support tickets. Please try again.</p><p><a class="admin-action customer-state-action" href="${escapeHtml(retryUrl)}">Try again</a></p></section>`;
}

export function renderTicketCount(matching: number, total: number): string {
  const noun = total === 1 ? 'ticket' : 'tickets';
  return matching === total
    ? `Total Tickets: ${total}`
    : `${matching} of ${total} ${noun} shown`;
}

export function renderAdminTicketList(tickets: AdminTicket[]): string {
  const rows = tickets
    .map(
      (ticket) =>
        `<tr><td data-label="Ticket ID"><a href="${ticketHref(ticket)}">${escapeHtml(formatTicketId(ticket.id))}</a></td><td data-label="Customer Name">${escapeHtml(customerName(ticket))}</td><td data-label="Subject"><a href="${ticketHref(ticket)}">${escapeHtml(ticket.subject)}</a></td><td data-label="Category">${escapeHtml(categoryLabel(ticket.category))}</td><td data-label="Status">${renderStatus(ticket.status)}</td><td data-label="Date Created">${dateHtml(ticket)}</td></tr>`,
    )
    .join('');
  return `<div class="admin-card customer-table-card"><table class="customer-table"><caption class="visually-hidden">Support tickets</caption><thead><tr><th scope="col">Ticket ID</th><th scope="col">Customer Name</th><th scope="col">Subject</th><th scope="col">Category</th><th scope="col">Status</th><th scope="col">Date Created</th></tr></thead><tbody>${rows}</tbody></table></div>`;
}

function renderCustomer(ticket: AdminTicket): string {
  const name = escapeHtml(customerName(ticket));
  const linked = /^[A-Za-z0-9-]{1,64}$/.test(ticket.customerId)
    ? `<a href="/admin/customers/${encodeURIComponent(ticket.customerId)}">${name}</a>`
    : name;
  const email =
    ticket.customerName && ticket.customerEmail
      ? `<br />${escapeHtml(ticket.customerEmail)}`
      : '';
  return `${linked}${email}`;
}

export function renderAdminTicketDetail(ticket: AdminTicket): string {
  const current = statusKey(ticket.status);
  const options = TICKET_STATUSES.map(
    (item) =>
      `<option value="${item.value}"${item.value === current ? ' selected' : ''}>${escapeHtml(item.label)}</option>`,
  ).join('');
  const category = ticket.category
    ? escapeHtml(categoryLabel(ticket.category))
    : 'Not specified';
  const details = `<section class="admin-card" aria-labelledby="ticket-details-heading"><h2 id="ticket-details-heading">${escapeHtml(ticket.subject)}</h2><dl class="customer-details"><div><dt>Ticket ID</dt><dd>${escapeHtml(formatTicketId(ticket.id))}</dd></div><div><dt>Customer</dt><dd>${renderCustomer(ticket)}</dd></div><div><dt>Category</dt><dd>${category}</dd></div><div><dt>Date Created</dt><dd>${dateHtml(ticket)}</dd></div><div><dt>Status</dt><dd data-ticket-status>${renderStatus(ticket.status)}</dd></div><div><dt>Description</dt><dd class="ticket-description">${escapeHtml(ticket.description)}</dd></div></dl></section>`;
  const update = `<section class="admin-card" aria-labelledby="ticket-status-heading"><h2 id="ticket-status-heading">Update status</h2><form class="admin-form" novalidate data-ticket-status-form><div class="admin-field"><label for="ticket-status">Status</label><select id="ticket-status" name="status">${options}</select></div><p class="admin-error" role="alert" hidden data-ticket-status-error></p><p class="admin-success" role="status" hidden data-ticket-status-success></p><button class="customer-button" type="submit" data-ticket-status-save>Update Status</button></form></section>`;
  return `<header class="admin-page-header"><h1>Ticket ${escapeHtml(formatTicketId(ticket.id))}</h1></header><div class="customer-manage">${details}${update}</div>`;
}

export function renderAdminTicketMessage(
  title: string,
  message: string,
): string {
  return `<header class="admin-page-header"><h1>Ticket details</h1></header><section class="admin-card customer-state" role="alert" aria-labelledby="ticket-message-heading"><h2 id="ticket-message-heading">${escapeHtml(title)}</h2><p class="admin-empty">${escapeHtml(message)}</p></section>`;
}
