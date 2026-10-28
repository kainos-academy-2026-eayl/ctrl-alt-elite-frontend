import assert from 'node:assert/strict';
import { createServer, type IncomingMessage, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, it } from 'vitest';
import { createApp } from '../src/app';
import {
  categoryLabel,
  createTicket,
  findTicket,
  formatTicketId,
  listTickets,
  MAX_DESCRIPTION_LENGTH,
  MAX_SUBJECT_LENGTH,
  parseTicket,
  statusLabel,
  UnauthorisedError,
  validateTicketForm,
} from '../src/util/supportTickets';
import {
  renderSupportMessage,
  renderTicketDetail,
  renderTicketList,
} from '../src/util/supportViews';

const TICKETS = [
  {
    id: 1001,
    subject: 'Delivery Delay',
    description: 'My order has not arrived.',
    category: 'DELIVERY_ISSUE',
    status: 'OPEN',
    createdAt: '2026-10-01T09:00:00.000Z',
  },
  {
    id: 1003,
    subject: 'Login Problem',
    description: 'I cannot log in.',
    category: 'ACCOUNT_ISSUE',
    status: 'RESOLVED',
    createdAt: '2026-10-03T09:00:00.000Z',
  },
  {
    id: 1002,
    subject: 'Refund Request',
    description: 'Please refund me.',
    category: 'RETURNS_REFUNDS',
    status: 'In Progress',
    createdAt: '2026-10-02T09:00:00.000Z',
  },
];

const VALID_FORM = {
  subject: 'Delivery Delay',
  category: 'DELIVERY_ISSUE',
  description: 'My order has not arrived.',
};

function listen(server: Server): Promise<string> {
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      resolve(`http://127.0.0.1:${(server.address() as AddressInfo).port}`);
    });
  });
}

function close(server: Server): Promise<void> {
  return new Promise((resolve) => server.close(() => resolve()));
}

async function readBody(req: IncomingMessage): Promise<string> {
  let body = '';
  for await (const chunk of req) body += chunk;
  return body;
}

describe('ticket validation', () => {
  it('accepts a complete ticket', () => {
    assert.equal(validateTicketForm(VALID_FORM), null);
  });

  it('rejects empty and whitespace-only fields', () => {
    assert.equal(
      validateTicketForm({ ...VALID_FORM, subject: '   ' }),
      'Enter a subject.',
    );
    assert.equal(
      validateTicketForm({ ...VALID_FORM, category: '' }),
      'Select an issue category.',
    );
    assert.equal(
      validateTicketForm({ ...VALID_FORM, description: ' \n ' }),
      'Enter a description.',
    );
  });

  it('rejects an unknown category and over-long text', () => {
    assert.equal(
      validateTicketForm({ ...VALID_FORM, category: 'HACKING' }),
      'Select an issue category.',
    );
    assert.match(
      validateTicketForm({
        ...VALID_FORM,
        subject: 'a'.repeat(MAX_SUBJECT_LENGTH + 1),
      }) ?? '',
      /subject/,
    );
    assert.match(
      validateTicketForm({
        ...VALID_FORM,
        description: 'a'.repeat(MAX_DESCRIPTION_LENGTH + 1),
      }) ?? '',
      /description/,
    );
  });
});

describe('ticket formatting', () => {
  it('labels statuses and categories whichever form the backend uses', () => {
    assert.equal(statusLabel('IN_PROGRESS'), 'In Progress');
    assert.equal(statusLabel('In Progress'), 'In Progress');
    assert.equal(statusLabel('resolved'), 'Resolved');
    assert.equal(statusLabel('Escalated'), 'Escalated');
    assert.equal(categoryLabel('RETURNS_REFUNDS'), 'Returns & Refunds');
    assert.equal(categoryLabel('Returns & Refunds'), 'Returns & Refunds');
  });

  it('parses numeric ids and rejects malformed tickets', () => {
    assert.equal(parseTicket(TICKETS[0])?.id, '1001');
    assert.equal(parseTicket({ ...TICKETS[0], id: '../x' }), null);
    assert.equal(parseTicket({ ...TICKETS[0], subject: undefined }), null);
    assert.equal(parseTicket(null), null);
  });
});

describe('ticket views', () => {
  it('lists the ticket id, subject, status and date', () => {
    const tickets = TICKETS.map(parseTicket).filter((t) => t !== null);
    const html = renderTicketList(tickets);
    assert.match(html, /#1001/);
    assert.match(html, /Delivery Delay/);
    assert.match(html, /ticket-status-open">Open</);
    assert.match(html, /ticket-status-in-progress">In Progress</);
    assert.match(html, /ticket-status-resolved">Resolved</);
    assert.match(html, /href="\/account\/support\/1001"/);
    assert.match(html, /1 Oct 2026/);
  });

  it('shortens UUID ticket ids for display but links to the full id', () => {
    const uuid = '0b5b6d1b-e5fe-4700-b678-bbc05799b194';
    assert.equal(formatTicketId(uuid), '#0B5B6D1B');
    assert.equal(formatTicketId('1001'), '#1001');
    const ticket = parseTicket({ ...TICKETS[0], id: uuid });
    assert.ok(ticket);
    const html = renderTicketList([ticket]);
    assert.match(html, />#0B5B6D1B</);
    assert.match(html, new RegExp(`href="/account/support/${uuid}"`));
  });

  it('shows an empty state with a way to create a ticket', () => {
    const html = renderTicketList([]);
    assert.match(html, /No tickets yet/);
    assert.match(html, /href="\/account\/support\/new"/);
  });

  it('shows the ticket details', () => {
    const ticket = parseTicket(TICKETS[1]);
    assert.ok(ticket);
    const html = renderTicketDetail(ticket);
    assert.match(html, /Login Problem/);
    assert.match(html, /I cannot log in\./);
    assert.match(html, /3 Oct 2026/);
    assert.match(html, /Resolved/);
    assert.match(html, /Account Issue/);
  });

  it('escapes ticket content', () => {
    const ticket = parseTicket({
      ...TICKETS[0],
      subject: '<img src=x onerror=alert(1)>',
      description: '<script>alert(1)</script>',
    });
    assert.ok(ticket);
    const html = renderTicketDetail(ticket) + renderTicketList([ticket]);
    assert.doesNotMatch(html, /<img|<script/);
    assert.match(html, /&lt;script&gt;/);
    assert.doesNotMatch(
      renderSupportMessage('<b>x</b>', '<i>y</i>'),
      /<b>|<i>/,
    );
  });
});

describe('support ticket API client', () => {
  let backend: Server;
  let origin: string;
  const created: unknown[] = [];

  beforeAll(async () => {
    backend = createServer(async (req, res) => {
      res.setHeader('content-type', 'application/json');
      if (req.headers.authorization === 'expired') {
        res.statusCode = 401;
        res.end(JSON.stringify({ message: 'Unauthorised' }));
        return;
      }
      const url = new URL(req.url ?? '/', 'http://localhost');
      if (url.pathname === '/api/support/tickets' && req.method === 'GET') {
        res.end(JSON.stringify({ tickets: TICKETS }));
      } else if (
        url.pathname === '/api/support/tickets' &&
        req.method === 'POST'
      ) {
        const body = JSON.parse(await readBody(req));
        created.push(body);
        if (body.subject === 'boom') {
          res.statusCode = 500;
          res.end(JSON.stringify({ message: 'Private database error' }));
          return;
        }
        res.statusCode = 201;
        res.end(
          JSON.stringify({ ticket: { ...TICKETS[0], ...body, id: 1004 } }),
        );
      } else if (url.pathname === '/api/support/tickets/1001') {
        res.end(JSON.stringify({ ticket: TICKETS[0] }));
      } else {
        res.statusCode = 404;
        res.end(JSON.stringify({ message: 'Not found' }));
      }
    });
    origin = await listen(backend);
  });

  afterAll(async () => {
    await close(backend);
  });

  // The client uses same-origin paths, so point them at the fake backend.
  function fetchImpl(authorization?: string): typeof fetch {
    return (input, init) =>
      fetch(`${origin}${String(input)}`, {
        ...init,
        headers: {
          ...(init?.headers as Record<string, string>),
          ...(authorization ? { authorization } : {}),
        },
      });
  }

  it('lists tickets newest first', async () => {
    const tickets = await listTickets({ fetchImpl: fetchImpl() });
    assert.deepEqual(
      tickets.map((ticket) => ticket.id),
      ['1003', '1002', '1001'],
    );
  });

  it('finds a ticket, or nothing when it does not exist', async () => {
    assert.equal(
      (await findTicket('1001', { fetchImpl: fetchImpl() }))?.subject,
      'Delivery Delay',
    );
    assert.equal(
      await findTicket('9999', { fetchImpl: fetchImpl() }),
      undefined,
    );
  });

  it('signals an expired session', async () => {
    await assert.rejects(
      listTickets({ fetchImpl: fetchImpl('expired') }),
      UnauthorisedError,
    );
    const result = await createTicket(VALID_FORM, {
      fetchImpl: fetchImpl('expired'),
    });
    assert.equal(result.ok, false);
    assert.equal(result.unauthorised, true);
  });

  it('creates a ticket from trimmed values', async () => {
    const result = await createTicket(
      { ...VALID_FORM, subject: '  Delivery Delay  ' },
      { fetchImpl: fetchImpl() },
    );
    assert.equal(result.ok, true);
    assert.equal(result.ticket?.id, '1004');
    assert.deepEqual(created.at(-1), VALID_FORM);
  });

  it('hides server error detail and survives network failure', async () => {
    const failed = await createTicket(
      { ...VALID_FORM, subject: 'boom' },
      { fetchImpl: fetchImpl() },
    );
    assert.equal(failed.ok, false);
    assert.doesNotMatch(failed.message, /database/);

    const offline = await createTicket(VALID_FORM, {
      fetchImpl: () => Promise.reject(new Error('offline')),
    });
    assert.equal(offline.ok, false);
  });
});

describe('support pages', () => {
  let frontend: Server;
  let base: string;

  beforeAll(async () => {
    frontend = createServer(createApp('http://127.0.0.1:1'));
    base = await listen(frontend);
  });

  afterAll(async () => {
    await close(frontend);
  });

  const cookie = { headers: { cookie: 'auth_token=customer.jwt.token' } };

  for (const path of [
    '/account/support',
    '/account/support/new',
    '/account/support/1001',
  ]) {
    it(`redirects ${path} to login without a session`, async () => {
      const res = await fetch(`${base}${path}`, { redirect: 'manual' });
      assert.equal(res.status, 303);
      assert.equal(res.headers.get('location'), '/login');
    });
  }

  it('serves the ticket list shell', async () => {
    const res = await fetch(`${base}/account/support`, cookie);
    assert.equal(res.status, 200);
    const html = await res.text();
    assert.match(html, /data-support-page="list"/);
    assert.match(html, /data-support-list/);
    assert.match(html, /href="\/account\/support\/new"/);
    assert.match(html, /src="\/controllers\/support\.js"/);
  });

  it('serves the create form with every category', async () => {
    const html = await (
      await fetch(`${base}/account/support/new`, cookie)
    ).text();
    assert.match(html, /data-support-page="new"/);
    assert.match(html, /name="subject"/);
    assert.match(html, /name="description"/);
    for (const label of [
      'Account Issue',
      'Order Issue',
      'Delivery Issue',
      'Returns &amp; Refunds',
      'Product Enquiry',
      'Other',
    ]) {
      assert.match(html, new RegExp(`>${label}</option>`));
    }
  });

  it('serves the ticket detail shell', async () => {
    const html = await (
      await fetch(`${base}/account/support/1001`, cookie)
    ).text();
    assert.match(html, /data-support-page="detail"/);
    assert.match(html, /data-support-detail/);
  });

  it('links to support from the homepage account menu', async () => {
    const html = await (await fetch(`${base}/`)).text();
    assert.match(html, /href="\/account\/support"/);
  });
});
