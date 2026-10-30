import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import { UnauthorisedError } from '../src/util/supportTickets';
import {
  addComment,
  commentsPath,
  commentsSignature,
  isTicketClosed,
  listComments,
  MAX_COMMENT_LENGTH,
  parseComment,
  parseCommentList,
  renderCommentList,
  renderComments,
  validateComment,
} from '../src/util/ticketComments';

const RAW_COMMENTS = [
  {
    id: 'c-2',
    body: 'We have refunded your order.',
    createdAt: '2026-10-02T10:00:00.000Z',
    author: { firstName: 'Grace', lastName: 'Hopper', role: 'ADMIN' },
  },
  {
    id: 'c-1',
    body: 'Where is my order?',
    createdAt: '2026-10-01T09:00:00.000Z',
    authorName: 'Ada Lovelace',
    authorRole: 'CUSTOMER',
  },
];

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('comment paths', () => {
  it('uses the customer and admin ticket endpoints', () => {
    assert.equal(
      commentsPath('customer', 'T-1'),
      '/api/support/tickets/T-1/comments',
    );
    assert.equal(
      commentsPath('admin', 'T-1'),
      '/api/admin/support/tickets/T-1/comments',
    );
  });
});

describe('parsing comments', () => {
  it('reads nested and flat author fields', () => {
    const [reply, question] = RAW_COMMENTS.map(parseComment);
    assert.equal(reply?.authorName, 'Grace Hopper');
    assert.equal(reply?.isStaff, true);
    assert.equal(question?.authorName, 'Ada Lovelace');
    assert.equal(question?.isStaff, false);
  });

  it('rejects comments without a body or date', () => {
    assert.equal(parseComment({ ...RAW_COMMENTS[0], body: '  ' }), null);
    assert.equal(
      parseComment({ ...RAW_COMMENTS[0], createdAt: undefined }),
      null,
    );
    assert.equal(parseComment(null), null);
  });

  it('accepts an array or { comments } and orders oldest first', () => {
    const ids = (body: unknown) => parseCommentList(body).map((c) => c.id);
    assert.deepEqual(ids(RAW_COMMENTS), ['c-1', 'c-2']);
    assert.deepEqual(ids({ comments: RAW_COMMENTS }), ['c-1', 'c-2']);
  });

  it('fails the whole list when an entry is malformed', () => {
    assert.throws(() => parseCommentList([{ id: 'x' }]));
    assert.throws(() => parseCommentList({ nope: true }));
  });
});

describe('validating comments', () => {
  it('treats only closed tickets as read-only', () => {
    assert.equal(isTicketClosed('CLOSED'), true);
    assert.equal(isTicketClosed('closed'), true);
    assert.equal(isTicketClosed('OPEN'), false);
    assert.equal(isTicketClosed('IN_PROGRESS'), false);
    assert.equal(isTicketClosed('RESOLVED'), false);
  });

  it('detects changes to a comment thread', () => {
    const [reply, question] = RAW_COMMENTS.map(parseComment).filter(
      (c) => c !== null,
    );
    assert.ok(reply && question);
    assert.equal(commentsSignature([question]), commentsSignature([question]));
    assert.notEqual(
      commentsSignature([question]),
      commentsSignature([question, reply]),
    );
  });

  it('blocks empty and over-long comments', () => {
    assert.match(validateComment('   ') ?? '', /Enter a comment/);
    assert.match(
      validateComment('a'.repeat(MAX_COMMENT_LENGTH + 1)) ?? '',
      /characters or fewer/,
    );
    assert.equal(validateComment('Thanks!'), null);
  });
});

describe('comment API calls', () => {
  it('lists comments for a ticket', async () => {
    let requested = '';
    const fetchImpl = (async (input: string | URL | Request) => {
      requested = String(input);
      return jsonResponse({ comments: RAW_COMMENTS });
    }) as typeof fetch;
    const comments = await listComments('customer', 'T-1', { fetchImpl });
    assert.equal(requested, '/api/support/tickets/T-1/comments');
    assert.equal(comments.length, 2);
  });

  it('throws UnauthorisedError when the session has expired', async () => {
    const fetchImpl = (async () => jsonResponse({}, 401)) as typeof fetch;
    await assert.rejects(
      listComments('admin', 'T-1', { fetchImpl }),
      UnauthorisedError,
    );
  });

  it('posts a trimmed comment body and returns the created comment', async () => {
    let request: { url: string; init: RequestInit | undefined } | undefined;
    const fetchImpl = (async (
      input: string | URL | Request,
      init?: RequestInit,
    ) => {
      request = { url: String(input), init };
      return jsonResponse({ comment: RAW_COMMENTS[1] }, 201);
    }) as typeof fetch;
    const result = await addComment('admin', 'T-1', '  Hello  ', { fetchImpl });
    assert.equal(result.ok, true);
    assert.equal(result.comment?.id, 'c-1');
    assert.equal(request?.url, '/api/admin/support/tickets/T-1/comments');
    assert.equal(request?.init?.method, 'POST');
    assert.deepEqual(JSON.parse(String(request?.init?.body)), {
      body: 'Hello',
    });
  });

  it('does not call the backend for an empty comment', async () => {
    let called = false;
    const fetchImpl = (async () => {
      called = true;
      return jsonResponse({});
    }) as typeof fetch;
    const result = await addComment('customer', 'T-1', ' ', { fetchImpl });
    assert.equal(result.ok, false);
    assert.equal(called, false);
  });

  it('shows 4xx messages, hides 5xx detail and flags expired sessions', async () => {
    const respond = (status: number, body: unknown) =>
      (async () => jsonResponse(body, status)) as typeof fetch;
    const badRequest = await addComment('customer', 'T-1', 'Hi', {
      fetchImpl: respond(400, { message: 'Ticket is closed.' }),
    });
    assert.equal(badRequest.message, 'Ticket is closed.');
    const serverError = await addComment('customer', 'T-1', 'Hi', {
      fetchImpl: respond(500, { message: 'stack trace' }),
    });
    assert.match(serverError.message, /try again later/);
    const expired = await addComment('customer', 'T-1', 'Hi', {
      fetchImpl: respond(401, {}),
    });
    assert.equal(expired.unauthorised, true);
  });
});

describe('comment views', () => {
  const comments = RAW_COMMENTS.map(parseComment).filter((c) => c !== null);

  it('marks staff replies and escapes comment content', () => {
    const html = renderCommentList(
      [
        ...comments,
        {
          id: 'c-3',
          body: '<script>alert(1)</script>',
          authorName: '<b>Eve</b>',
          isStaff: false,
          createdAt: '2026-10-03T10:00:00.000Z',
        },
      ],
      'admin',
    );
    assert.match(html, /ticket-comment-staff/);
    assert.match(html, /Support team/);
    assert.doesNotMatch(html, /<script>/);
    assert.doesNotMatch(html, /<b>Eve/);
    assert.match(html, /&lt;script&gt;/);
  });

  it('shows an empty state and the reply form', () => {
    const html = renderComments([], 'customer');
    assert.match(html, /No comments yet/);
    assert.match(html, /data-comment-form/);
    assert.match(html, /support-button/);
    assert.match(renderComments([], 'admin'), /customer-button/);
  });

  it('replaces the reply form with a notice when the ticket is closed', () => {
    for (const audience of ['customer', 'admin'] as const) {
      const html = renderComments(comments, audience, true);
      assert.doesNotMatch(html, /data-comment-form/);
      assert.doesNotMatch(html, /<textarea/);
      assert.match(html, /data-comment-closed/);
      assert.match(html, /This ticket is closed/);
      assert.match(html, /Where is my order\?/);
    }
  });

  it('labels author-less customer comments by audience', () => {
    const anon = [
      {
        id: '1',
        body: 'Hi',
        authorName: '',
        isStaff: false,
        createdAt: '2026-10-01T09:00:00Z',
      },
    ];
    assert.match(renderCommentList(anon, 'customer'), />You</);
    assert.match(renderCommentList(anon, 'admin'), />Customer</);
  });
});
