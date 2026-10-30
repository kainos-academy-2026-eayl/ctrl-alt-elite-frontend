import { escapeHtml } from './customerViews';
import {
  categoryLabel,
  formatTicketDate,
  formatTicketId,
  statusKey,
  statusLabel,
  type Ticket,
} from './supportTickets';

export const SUPPORT_PATH = '/account/support';

function ticketPath(ticket: Ticket): string {
  return `${SUPPORT_PATH}/${encodeURIComponent(ticket.id)}`;
}

function dateHtml(ticket: Ticket): string {
  return `<time datetime="${escapeHtml(ticket.createdAt)}">${escapeHtml(formatTicketDate(ticket.createdAt))}</time>`;
}

export function renderStatus(status: string): string {
  return `<span class="ticket-status ticket-status-${statusKey(status).toLowerCase().replaceAll('_', '-')}">${escapeHtml(statusLabel(status))}</span>`;
}

export function renderTicketList(tickets: Ticket[]): string {
  if (tickets.length === 0) {
    return `<section class="support-card support-state" aria-labelledby="tickets-empty-heading"><h2 id="tickets-empty-heading">No tickets yet</h2><p class="support-muted">You have not submitted any support tickets.</p><p><a class="support-button" href="${SUPPORT_PATH}/new">Create a ticket</a></p></section>`;
  }
  const rows = tickets
    .map((ticket) => {
      const href = escapeHtml(ticketPath(ticket));
      return `<tr><td data-label="Ticket ID"><a href="${href}">${escapeHtml(formatTicketId(ticket.id))}</a></td><td data-label="Subject"><a href="${href}">${escapeHtml(ticket.subject)}</a></td><td data-label="Status">${renderStatus(ticket.status)}</td><td data-label="Created">${dateHtml(ticket)}</td></tr>`;
    })
    .join('');
  return `<div class="support-card support-table-card"><table class="support-table"><caption class="visually-hidden">Your support tickets</caption><thead><tr><th scope="col">Ticket ID</th><th scope="col">Subject</th><th scope="col">Status</th><th scope="col">Created</th></tr></thead><tbody>${rows}</tbody></table></div>`;
}

export function renderTicketDetail(ticket: Ticket): string {
  const category = ticket.category
    ? `<div><dt>Category</dt><dd>${escapeHtml(categoryLabel(ticket.category))}</dd></div>`
    : '';
  return `<section class="support-card" aria-labelledby="ticket-heading"><h2 id="ticket-heading">${escapeHtml(ticket.subject)}</h2><dl class="ticket-details"><div><dt>Ticket ID</dt><dd>${escapeHtml(formatTicketId(ticket.id))}</dd></div><div><dt>Status</dt><dd data-ticket-status>${renderStatus(ticket.status)}</dd></div><div><dt>Created</dt><dd>${dateHtml(ticket)}</dd></div>${category}<div><dt>Description</dt><dd class="ticket-description">${escapeHtml(ticket.description)}</dd></div></dl></section>`;
}

export function renderSupportMessage(title: string, message: string): string {
  return `<section class="support-card support-state" role="alert" aria-labelledby="support-message-heading"><h2 id="support-message-heading">${escapeHtml(title)}</h2><p class="support-muted">${escapeHtml(message)}</p><p><a href="${SUPPORT_PATH}">Back to my tickets</a></p></section>`;
}
