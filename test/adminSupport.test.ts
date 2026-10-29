import assert from 'node:assert/strict';
import { createServer, type IncomingMessage, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, it } from 'vitest';
import { createApp } from '../src/app';
import {
  filterTickets,
  findAdminTicket,
  listAdminTickets,
  parseAdminTicket,
  readTicketQuery,
  updateTicketStatus,
} from '../src/util/adminSupport';
import {
  renderAdminTicketDetail,
  renderAdminTicketList,
  renderAdminTicketsEmpty,
  renderTicketCount,
} from '../src/util/adminSupportViews';
import { UnauthorisedError } from '../src/util/supportTickets';

const RAW_TICKETS = [
  {
    id: 1001,
    subject: 'Delivery Delay',
    description: 'My order has not arrived.',
    category: 'DELIVERY_ISSUE',
    status: 'OPEN',
    createdAt: '2026-10-01T09:00:00.000Z',
    customer: {
      id: 'c-1',
      firstName: 'Ada',
      lastName: 'Lovelace',
      email: 'ada@example.com',
    },
  },
  {
    id: 1002,
    subject: 'Refund Request',
    description: 'Please refund me.',
    category: 'RETURNS_REFUNDS',
    status: 'IN_PROGRESS',
    createdAt: '2026-10-02T09:00:00.000Z',
    customerName: 'Grace Hopper',
    customerEmail: 'grace@example.com',
  },
  {
    id: 1003,
    subject: 'Login Problem',
    description: 'I cannot log in.',
    category: 'ACCOUNT_ISSUE',
    status: 'RESOLVED',
    createdAt: '2026-10-03T09:00:00.000Z',
    customer: {
      firstName: 'Alan',
      lastName: 'Turing',
      email: 'alan@example.com',
    },
  },
];

const TICKETS = RAW_TICKETS.map(parseAdminTicket).filter((t) => t !== null);
const NO_FILTERS = { search: '', status: '', category: '' };

function ids(query: Partial<typeof NO_FILTERS>): string[] {
  return filterTickets(TICKETS, { ...NO_FILTERS, ...query }).map((t) => t.id);
}

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

describe('admin ticket parsing', () => {
  it('reads customer details from nested or flat fields', () => {
    assert.equal(TICKETS[0]?.customerName, 'Ada Lovelace');
    assert.equal(TICKETS[0]?.customerEmail, 'ada@example.com');
    assert.equal(TICKETS[0]?.customerId, 'c-1');
    assert.equal(TICKETS[1]?.customerName, 'Grace Hopper');
    assert.equal(TICKETS[1]?.customerEmail, 'grace@example.com');
  });

  it('rejects malformed tickets', () => {
    assert.equal(parseAdminTicket({ id: 1 }), null);
    assert.equal(parseAdminTicket(null), null);
  });
});

describe('ticket search and filters', () => {
  it('returns everything without criteria', () => {
    assert.deepEqual(ids({}), ['1001', '1002', '1003']);
  });

  it('searches by ticket ID, with or without #', () => {
    assert.deepEqual(ids({ search: '1002' }), ['1002']);
    assert.deepEqual(ids({ search: '#1003' }), ['1003']);
  });

  it('finds a UUID ticket by its shortened display ID', () => {
    const uuid = '0b5b6d1b-e5fe-4700-b678-bbc05799b194';
    const ticket = parseAdminTicket({ ...RAW_TICKETS[0], id: uuid });
    assert.ok(ticket);
    const found = filterTickets([ticket], {
      search: '#0B5B6D1B',
      status: '',
      category: '',
    });
    assert.equal(found.length, 1);
  });

  it('searches by customer name and subject, ignoring case', () => {
    assert.deepEqual(ids({ search: 'lovelace' }), ['1001']);
    assert.deepEqual(ids({ search: 'REFUND' }), ['1002']);
    assert.deepEqual(ids({ search: 'nobody' }), []);
  });

  it('filters by status and category, alone or combined', () => {
    assert.deepEqual(ids({ status: 'IN_PROGRESS' }), ['1002']);
    assert.deepEqual(ids({ category: 'ACCOUNT_ISSUE' }), ['1003']);
    assert.deepEqual(ids({ status: 'OPEN', category: 'ORDER_ISSUE' }), []);
    assert.deepEqual(ids({ status: 'OPEN', search: 'delay' }), ['1001']);
  });

  it('reads and sanitises the query from the URL', () => {
    assert.deepEqual(
      readTicketQuery(
        new URLSearchParams('q=%20abc%20&status=in_progress&category=OTHER'),
      ),
      { search: 'abc', status: 'IN_PROGRESS', category: 'OTHER' },
    );
    assert.deepEqual(
      readTicketQuery(new URLSearchParams('status=bogus&category=x')),
      NO_FILTERS,
    );
  });
});

describe('admin ticket views', () => {
  it('lists every column', () => {
    const html = renderAdminTicketList(TICKETS);
    for (const text of [
      'Ticket ID',
      'Customer Name',
      'Subject',
      'Category',
      'Status',
      'Date Created',
      '#1001',
      'Ada Lovelace',
      'Delivery Issue',
      'Returns &amp; Refunds',
      'In Progress',
      '1 Oct 2026',
    ]) {
      assert.ok(html.includes(text), `missing "${text}"`);
    }
    assert.match(html, /href="\/admin\/support\/1001"/);
  });

  it('shows the matching count and distinct empty states', () => {
    assert.equal(renderTicketCount(3, 3), 'Total Tickets: 3');
    assert.equal(renderTicketCount(1, 3), '1 of 3 tickets shown');
    assert.match(renderAdminTicketsEmpty(true), /Clear search and filters/);
    assert.match(renderAdminTicketsEmpty(false), /once customers submit/);
  });

  it('shows the full details and a status form defaulting to the current status', () => {
    const ticket = TICKETS[1];
    assert.ok(ticket);
    const html = renderAdminTicketDetail(ticket);
    for (const text of [
      'Refund Request',
      'Please refund me.',
      'Grace Hopper',
      'grace@example.com',
      'Returns &amp; Refunds',
      '2 Oct 2026',
    ]) {
      assert.ok(html.includes(text), `missing "${text}"`);
    }
    assert.match(html, /<option value="IN_PROGRESS" selected>/);
    for (const label of ['Open', 'In Progress', 'Resolved', 'Closed']) {
      assert.match(html, new RegExp(`>${label}</option>`));
    }
  });

  it('links to the customer record only when it has a safe id', () => {
    const [linked, flat] = [TICKETS[0], TICKETS[1]];
    assert.ok(linked && flat);
    assert.match(
      renderAdminTicketDetail(linked),
      /href="\/admin\/customers\/c-1"/,
    );
    assert.doesNotMatch(renderAdminTicketDetail(flat), /admin\/customers/);
    const unsafe = parseAdminTicket({
      ...RAW_TICKETS[0],
      customer: { id: '../x"', firstName: 'X' },
    });
    assert.ok(unsafe);
    assert.doesNotMatch(renderAdminTicketDetail(unsafe), /admin\/customers/);
  });

  it('escapes ticket and customer content', () => {
    const ticket = parseAdminTicket({
      ...RAW_TICKETS[0],
      subject: '<img src=x onerror=alert(1)>',
      description: '<script>alert(1)</script>',
      customer: { firstName: '<b>Eve</b>', email: 'e@example.com' },
    });
    assert.ok(ticket);
    const html =
      renderAdminTicketDetail(ticket) + renderAdminTicketList([ticket]);
    assert.doesNotMatch(html, /<img|<script|<b>/);
  });
});

describe('admin support API client', () => {
  let backend: Server;
  let origin: string;
  const updates: { path: string; method?: string; body: unknown }[] = [];

  beforeAll(async () => {
    backend = createServer(async (req, res) => {
      res.setHeader('content-type', 'application/json');
      if (req.headers.authorization === 'expired') {
        res.statusCode = 401;
        res.end('{}');
        return;
      }
      const path = req.url ?? '';
      if (path === '/api/admin/support/tickets') {
        res.end(JSON.stringify({ tickets: RAW_TICKETS }));
      } else if (path === '/api/admin/support/tickets/1001') {
        res.end(JSON.stringify({ ticket: RAW_TICKETS[0] }));
      } else if (path.endsWith('/status') && req.method === 'PATCH') {
        const body = JSON.parse(await readBody(req));
        updates.push({ path, method: req.method, body });
        if (path.includes('/500/')) {
          res.statusCode = 500;
          res.end(JSON.stringify({ message: 'Private database error' }));
        } else if (path.includes('/400/')) {
          res.statusCode = 400;
          res.end(JSON.stringify({ message: 'Ticket is already closed.' }));
        } else {
          res.end(
            JSON.stringify({
              ticket: { ...RAW_TICKETS[0], status: body.status },
            }),
          );
        }
      } else {
        res.statusCode = 404;
        res.end('{}');
      }
    });
    origin = await listen(backend);
  });

  afterAll(async () => {
    await close(backend);
  });

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

  it('lists all tickets newest first', async () => {
    const tickets = await listAdminTickets({ fetchImpl: fetchImpl() });
    assert.deepEqual(
      tickets.map((t) => t.id),
      ['1003', '1002', '1001'],
    );
  });

  it('finds a ticket, or nothing for an unknown id', async () => {
    const ticket = await findAdminTicket('1001', { fetchImpl: fetchImpl() });
    assert.equal(ticket?.customerName, 'Ada Lovelace');
    assert.equal(
      await findAdminTicket('9999', { fetchImpl: fetchImpl() }),
      undefined,
    );
  });

  it('signals an expired session', async () => {
    await assert.rejects(
      listAdminTickets({ fetchImpl: fetchImpl('expired') }),
      UnauthorisedError,
    );
    const result = await updateTicketStatus('1001', 'CLOSED', {
      fetchImpl: fetchImpl('expired'),
    });
    assert.equal(result.unauthorised, true);
  });

  it('updates the status for every allowed value', async () => {
    for (const status of ['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED']) {
      const result = await updateTicketStatus('1001', status, {
        fetchImpl: fetchImpl(),
      });
      assert.equal(result.ok, true);
      assert.equal(result.ticket?.status, status);
    }
    assert.deepEqual(updates.at(-1), {
      path: '/api/admin/support/tickets/1001/status',
      method: 'PATCH',
      body: { status: 'CLOSED' },
    });
  });

  it('rejects an invalid status without calling the backend', async () => {
    const before = updates.length;
    const result = await updateTicketStatus('1001', 'DELETED', {
      fetchImpl: fetchImpl(),
    });
    assert.equal(result.ok, false);
    assert.equal(updates.length, before);
  });

  it('shows 4xx messages, hides server detail and survives network failure', async () => {
    const rejected = await updateTicketStatus('400', 'OPEN', {
      fetchImpl: fetchImpl(),
    });
    assert.equal(rejected.message, 'Ticket is already closed.');
    const failed = await updateTicketStatus('500', 'OPEN', {
      fetchImpl: fetchImpl(),
    });
    assert.doesNotMatch(failed.message, /database/);
    const offline = await updateTicketStatus('1001', 'OPEN', {
      fetchImpl: () => Promise.reject(new Error('offline')),
    });
    assert.equal(offline.ok, false);
  });
});

describe('admin support pages', () => {
  let backend: Server;
  let frontend: Server;
  let base: string;

  beforeAll(async () => {
    backend = createServer((req, res) => {
      if (req.url === '/api/admin/profile') {
        const allowed = req.headers.authorization?.endsWith('admin-token');
        res.statusCode = allowed ? 200 : 401;
        res.end(
          JSON.stringify({
            name: 'Ada Lovelace',
            email: 'ada@example.com',
            role: 'ADMIN',
          }),
        );
        return;
      }
      const allowed =
        req.url === '/api/admin/customers?pageSize=1' &&
        req.headers.authorization?.endsWith('admin-token');
      res.statusCode = allowed ? 200 : 401;
      res.end('{}');
    });
    frontend = createServer(createApp(await listen(backend)));
    base = await listen(frontend);
  });

  afterAll(async () => {
    await close(frontend);
    await close(backend);
  });

  const admin = { headers: { cookie: 'auth_token=admin-token' } };

  it('requires an admin session', async () => {
    for (const path of ['/admin/support', '/admin/support/1001']) {
      const none = await fetch(`${base}${path}`, { redirect: 'manual' });
      assert.equal(none.status, 303);
      const bad = await fetch(`${base}${path}`, {
        headers: { cookie: 'auth_token=customer-token' },
        redirect: 'manual',
      });
      assert.equal(bad.status, 303);
      assert.equal(bad.headers.get('location'), '/login');
    }
  });

  it('serves the list shell with search and both filters', async () => {
    const res = await fetch(`${base}/admin/support`, admin);
    assert.equal(res.status, 200);
    const html = await res.text();
    assert.match(html, /<title>Support Tickets \| Admin/);
    assert.match(html, /name="q"/);
    assert.match(html, /name="status"/);
    assert.match(html, /name="category"/);
    assert.match(html, /<option value="IN_PROGRESS">In Progress<\/option>/);
    assert.match(
      html,
      /<option value="RETURNS_REFUNDS">Returns &amp; Refunds<\/option>/,
    );
    assert.match(html, /data-tickets-results/);
    assert.match(html, /src="\/controllers\/adminSupport\.js"/);
  });

  it('serves the detail shell', async () => {
    const html = await (
      await fetch(`${base}/admin/support/1001`, admin)
    ).text();
    assert.match(html, /data-ticket-detail/);
    assert.match(html, /src="\/controllers\/adminSupportDetail\.js"/);
  });

  it('adds Support Tickets to the navigation, active on its pages', async () => {
    const html = await (await fetch(`${base}/admin/support`, admin)).text();
    assert.match(
      html,
      /class="admin-nav-link is-active" href="\/admin\/support"\s+aria-current="page" >Support Tickets/,
    );
    const dashboard = await (await fetch(`${base}/admin`, admin)).text();
    assert.match(dashboard, /href="\/admin\/support"/);
  });

  it('serves the controller bundles', async () => {
    for (const name of ['adminSupport', 'adminSupportDetail']) {
      const res = await fetch(`${base}/controllers/${name}.js`);
      assert.equal(res.status, 200);
      await res.text();
    }
  });
});
