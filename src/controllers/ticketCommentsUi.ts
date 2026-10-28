import { UnauthorisedError } from '../util/supportTickets';
import {
  addComment,
  COMMENT_POLL_INTERVAL_MS,
  type CommentAudience,
  commentsSignature,
  isTicketClosed,
  listComments,
  renderCommentList,
  renderComments,
  renderCommentsUnavailable,
  type TicketComment,
  validateComment,
} from '../util/ticketComments';

export interface CommentsOptions {
  ticketId: string;
  audience: CommentAudience;
  status: string;
  onUnauthorised: () => void;
  // Returns the ticket's current status, or undefined if it cannot be found.
  fetchStatus?: () => Promise<string | undefined>;
  onStatusChange?: (status: string) => void;
}

export interface CommentsController {
  // Call when the page itself changes the status so the form updates at once.
  setStatus: (status: string) => void;
}

const NOOP_CONTROLLER: CommentsController = { setStatus: () => undefined };

// Loads the comments for a ticket into `host`, wires up the reply form and
// keeps the thread (and the ticket's open/closed state) fresh by polling.
export async function mountComments(
  host: HTMLElement,
  options: CommentsOptions,
): Promise<CommentsController> {
  const { ticketId, audience, onUnauthorised, fetchStatus, onStatusChange } =
    options;

  let comments: TicketComment[];
  try {
    comments = await listComments(audience, ticketId);
  } catch (error) {
    if (error instanceof UnauthorisedError) {
      onUnauthorised();
      return NOOP_CONTROLLER;
    }
    console.error('Unable to load comments:', error);
    host.innerHTML = renderCommentsUnavailable(audience);
    return NOOP_CONTROLLER;
  }

  let currentStatus = options.status;
  let readOnly = isTicketClosed(currentStatus);
  let signature = commentsSignature(comments);
  // Bumped by local changes so a slower, older poll cannot overwrite them.
  let version = 0;
  let polling = false;

  function refreshList(): void {
    const list = host.querySelector<HTMLElement>('[data-comment-list]');
    if (list) list.innerHTML = renderCommentList(comments, audience);
  }

  function render(): void {
    const draft =
      host.querySelector<HTMLTextAreaElement>('#comment-body')?.value ?? '';
    host.innerHTML = renderComments(comments, audience, readOnly);

    const form = host.querySelector<HTMLFormElement>('[data-comment-form]');
    const input = host.querySelector<HTMLTextAreaElement>('#comment-body');
    const submit = host.querySelector<HTMLButtonElement>(
      '[data-comment-submit]',
    );
    const error = host.querySelector<HTMLElement>('[data-comment-error]');
    if (!form || !input || !submit || !error) return;
    input.value = draft;

    function showError(message: string): void {
      if (!error) return;
      error.textContent = message;
      error.hidden = false;
    }

    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const problem = validateComment(input.value);
      if (problem) return showError(problem);

      error.hidden = true;
      submit.disabled = true;
      const result = await addComment(audience, ticketId, input.value);
      submit.disabled = false;

      if (result.unauthorised) return onUnauthorised();
      if (!result.ok) return showError(result.message);

      input.value = '';
      version += 1;
      try {
        comments = result.comment
          ? [...comments, result.comment]
          : await listComments(audience, ticketId);
        signature = commentsSignature(comments);
        refreshList();
      } catch (reloadError) {
        if (reloadError instanceof UnauthorisedError) return onUnauthorised();
        console.error('Unable to refresh comments:', reloadError);
        showError(
          'Your comment was posted but the list could not be refreshed.',
        );
      }
    });
  }

  function setStatus(status: string): void {
    currentStatus = status;
    const closed = isTicketClosed(status);
    if (closed === readOnly) return;
    readOnly = closed;
    render();
  }

  async function poll(): Promise<void> {
    if (polling || document.hidden) return;
    polling = true;
    const startedAt = version;
    try {
      const [latest, latestStatus] = await Promise.all([
        listComments(audience, ticketId),
        fetchStatus ? fetchStatus() : Promise.resolve(undefined),
      ]);
      const latestSignature = commentsSignature(latest);
      if (version === startedAt && latestSignature !== signature) {
        comments = latest;
        signature = latestSignature;
        refreshList();
      }
      if (latestStatus !== undefined && latestStatus !== currentStatus) {
        setStatus(latestStatus);
        onStatusChange?.(latestStatus);
      }
    } catch (error) {
      if (error instanceof UnauthorisedError) {
        window.clearInterval(timer);
        onUnauthorised();
        return;
      }
      console.warn('Unable to refresh comments:', error);
    } finally {
      polling = false;
    }
  }

  render();
  const timer = window.setInterval(() => void poll(), COMMENT_POLL_INTERVAL_MS);
  document.addEventListener('visibilitychange', () => void poll());

  return { setStatus };
}
