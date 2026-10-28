import { ADMIN_TICKETS_PATH } from './adminSupport';
import { failureMessage, submitJson } from './apiResponse';
import { escapeHtml } from './customerViews';
import {
  DEFAULT_TIMEOUT_MS,
  getJson,
  statusKey,
  TICKETS_PATH,
  type TicketApiOptions,
} from './supportTickets';

export const MAX_COMMENT_LENGTH = 2000;
export const COMMENT_POLL_INTERVAL_MS = 10_000;

export type CommentAudience = 'customer' | 'admin';

export interface TicketComment {
  id: string;
  body: string;
  authorName: string;
  isStaff: boolean;
  createdAt: string;
}

export interface AddCommentResult {
  ok: boolean;
  message: string;
  comment?: TicketComment;
  unauthorised?: boolean;
}

const ADD_ERROR_MESSAGE =
  'Unable to post your comment. Please try again later.';
const STAFF_ROLES = new Set(['ADMIN', 'ADMINISTRATOR', 'STAFF', 'SUPPORT']);

export function commentsPath(
  audience: CommentAudience,
  ticketId: string,
): string {
  const base = audience === 'admin' ? ADMIN_TICKETS_PATH : TICKETS_PATH;
  return `${base}/${encodeURIComponent(ticketId)}/comments`;
}

function text(value: unknown): string {
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return '';
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null
    ? (value as Record<string, unknown>)
    : {};
}

// The author arrives either nested under `author` or as flat fields.
export function parseComment(value: unknown): TicketComment | null {
  if (typeof value !== 'object' || value === null) return null;
  const record = value as Record<string, unknown>;
  const body = text(record.body ?? record.message ?? record.content);
  const createdAt = text(record.createdAt);
  if (!body || !createdAt) return null;

  const author = asRecord(record.author);
  const nestedName = [text(author.firstName), text(author.lastName)]
    .filter(Boolean)
    .join(' ');
  const role = text(
    record.authorRole ?? record.role ?? author.role,
  ).toUpperCase();
  return {
    id: text(record.id),
    body,
    authorName: nestedName || text(author.name) || text(record.authorName),
    isStaff: STAFF_ROLES.has(role),
    createdAt,
  };
}

// The backend returns either an array or { comments }.
export function parseCommentList(body: unknown): TicketComment[] {
  const list =
    typeof body === 'object' && body !== null && 'comments' in body
      ? body.comments
      : body;
  if (!Array.isArray(list)) {
    throw new Error('Comments response was not in the expected format.');
  }
  const comments: TicketComment[] = [];
  for (const entry of list) {
    const comment = parseComment(entry);
    if (comment === null) {
      throw new Error('Comments response was not in the expected format.');
    }
    comments.push(comment);
  }
  return comments.sort(
    (a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt) || 0,
  );
}

// Closed tickets are read-only: the thread stays visible but nobody can reply.
export function isTicketClosed(status: string): boolean {
  return statusKey(status) === 'CLOSED';
}

// Lets the page tell whether a refresh actually changed anything.
export function commentsSignature(comments: TicketComment[]): string {
  return comments
    .map((c) => `${c.id}|${c.createdAt}|${c.authorName}|${c.body}`)
    .join('\n');
}

export function validateComment(body: string): string | null {
  const trimmed = body.trim();
  if (!trimmed) return 'Enter a comment before posting.';
  if (trimmed.length > MAX_COMMENT_LENGTH) {
    return `The comment must be ${MAX_COMMENT_LENGTH} characters or fewer.`;
  }
  return null;
}

export async function listComments(
  audience: CommentAudience,
  ticketId: string,
  options: TicketApiOptions = {},
): Promise<TicketComment[]> {
  const response = await getJson(commentsPath(audience, ticketId), options);
  if (!response.ok) {
    throw new Error(`Comments request failed with status ${response.status}`);
  }
  return parseCommentList(await response.json());
}

// Never throws: a failure is returned as a result.
export async function addComment(
  audience: CommentAudience,
  ticketId: string,
  body: string,
  {
    fetchImpl = (input, init) => fetch(input, init),
    timeoutMs = DEFAULT_TIMEOUT_MS,
  }: TicketApiOptions = {},
): Promise<AddCommentResult> {
  const problem = validateComment(body);
  if (problem) return { ok: false, message: problem };
  const result = await submitJson(
    commentsPath(audience, ticketId),
    'POST',
    { body: body.trim() },
    fetchImpl,
    timeoutMs,
  );
  if (result?.ok) {
    const payload = result.body;
    const comment = parseComment(
      typeof payload === 'object' && payload !== null && 'comment' in payload
        ? payload.comment
        : payload,
    );
    return {
      ok: true,
      message: result.message ?? 'Your comment has been posted.',
      ...(comment ? { comment } : {}),
    };
  }
  if (result?.status === 401) {
    return {
      ok: false,
      message: 'Your session has expired. Please log in again.',
      unauthorised: true,
    };
  }
  return { ok: false, message: failureMessage(result, ADD_ERROR_MESSAGE) };
}

export function formatCommentDate(isoDate: string): string {
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) return isoDate;
  return date.toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

const CLASSES = {
  customer: {
    card: 'support-card',
    form: 'support-form',
    field: 'support-field',
    error: 'support-error',
    button: 'support-button',
  },
  admin: {
    card: 'admin-card',
    form: 'admin-form',
    field: 'admin-field',
    error: 'admin-error',
    button: 'customer-button',
  },
} as const;

function authorLabel(
  comment: TicketComment,
  audience: CommentAudience,
): string {
  if (comment.authorName) return comment.authorName;
  if (comment.isStaff) return 'Support team';
  return audience === 'customer' ? 'You' : 'Customer';
}

export function renderCommentList(
  comments: TicketComment[],
  audience: CommentAudience,
): string {
  if (comments.length === 0) {
    return '<p class="ticket-comment-empty">No comments yet.</p>';
  }
  const items = comments
    .map((comment) => {
      const role = comment.isStaff ? 'staff' : 'customer';
      const badge = comment.isStaff
        ? '<span class="ticket-comment-badge">Support team</span>'
        : '';
      return `<li class="ticket-comment ticket-comment-${role}"><div class="ticket-comment-meta"><strong>${escapeHtml(authorLabel(comment, audience))}</strong>${badge}<time datetime="${escapeHtml(comment.createdAt)}">${escapeHtml(formatCommentDate(comment.createdAt))}</time></div><p class="ticket-comment-body">${escapeHtml(comment.body)}</p></li>`;
    })
    .join('');
  return `<ol class="ticket-comment-list">${items}</ol>`;
}

export function renderComments(
  comments: TicketComment[],
  audience: CommentAudience,
  readOnly = false,
): string {
  const c = CLASSES[audience];
  const footer = readOnly
    ? `<p class="ticket-comment-closed" role="status" data-comment-closed>This ticket is closed, so new comments can't be added.</p>`
    : `<form class="${c.form}" novalidate data-comment-form><div class="${c.field}"><label for="comment-body">Add a comment</label><textarea id="comment-body" name="body" rows="4" maxlength="${MAX_COMMENT_LENGTH}" required></textarea></div><p class="${c.error}" role="alert" hidden data-comment-error></p><button class="${c.button}" type="submit" data-comment-submit>Post comment</button></form>`;
  return `<section class="${c.card} ticket-comments" aria-labelledby="ticket-comments-heading"><h2 id="ticket-comments-heading">Comments</h2><div data-comment-list aria-live="polite">${renderCommentList(comments, audience)}</div>${footer}</section>`;
}

export function renderCommentsUnavailable(audience: CommentAudience): string {
  const c = CLASSES[audience];
  return `<section class="${c.card} ticket-comments" aria-labelledby="ticket-comments-heading"><h2 id="ticket-comments-heading">Comments</h2><p class="ticket-comment-empty">Comments could not be loaded. Please try again later.</p></section>`;
}
