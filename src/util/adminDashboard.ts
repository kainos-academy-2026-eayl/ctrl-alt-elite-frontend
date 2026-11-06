import { DEFAULT_ORDER_SORT } from './adminOrders';
import type { OrdersApi } from './adminOrdersApi';
import {
  type Customer,
  type CustomerSource,
  customerFullName,
  formatRegistrationDate,
} from './customers';
import { escapeHtml } from './customerViews';

const PENDING_STATUS = 'PENDING';

const RECENT_ACTIVITY_LIMIT = 5;
const NEW_CUSTOMER_WINDOW_DAYS = 7;
const NEWEST_PAGE_SIZE = 100;
const DAY_MS = 24 * 60 * 60 * 1000;
const UNKNOWN_STATUS = 'Status unavailable';
const PRODUCTS_COUNT_PATH = '/api/products';

export interface DashboardCustomerData {
  available: boolean;
  totalCustomers: number;
  recentCustomers: Customer[];
  newCustomers: number;
}

export const UNAVAILABLE_CUSTOMER_DATA: DashboardCustomerData = {
  available: false,
  totalCustomers: 0,
  recentCustomers: [],
  newCustomers: 0,
};

// Never throws: the dashboard must stay usable when the backend is down.
export async function loadDashboardCustomerData(
  source: CustomerSource,
  now: Date = new Date(),
): Promise<DashboardCustomerData> {
  try {
    const result = await source.query({
      search: '',
      email: '',
      sort: 'newest',
      page: 1,
      pageSize: NEWEST_PAGE_SIZE,
    });
    const cutoff = new Date(
      now.getTime() - (NEW_CUSTOMER_WINDOW_DAYS - 1) * DAY_MS,
    )
      .toISOString()
      .slice(0, 10);
    return {
      available: true,
      totalCustomers: result.totalCustomers,
      recentCustomers: result.customers.slice(0, RECENT_ACTIVITY_LIMIT),
      newCustomers: result.customers.filter(
        (customer) => customer.registrationDate >= cutoff,
      ).length,
    };
  } catch (error) {
    console.error('Unable to load dashboard customer data:', error);
    return UNAVAILABLE_CUSTOMER_DATA;
  }
}

// Never throws: the dashboard must stay usable when the backend is down.
// Returns null when the count cannot be read, so the placeholder stays.
export async function loadProductCount(
  fetchImpl: typeof fetch = (input, init) => fetch(input, init),
  timeoutMs = 3000,
): Promise<number | null> {
  try {
    const response = await fetchImpl(PRODUCTS_COUNT_PATH, {
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!response.ok) {
      await response.body?.cancel();
      return null;
    }
    const body: unknown = await response.json();
    const list =
      typeof body === 'object' && body !== null && 'products' in body
        ? body.products
        : body;
    return Array.isArray(list) ? list.length : null;
  } catch (error) {
    console.error('Unable to load the product count:', error);
    return null;
  }
}

export interface DashboardOrderData {
  available: boolean;
  totalOrders: number;
  pendingOrders: number;
}

export const UNAVAILABLE_ORDER_DATA: DashboardOrderData = {
  available: false,
  totalOrders: 0,
  pendingOrders: 0,
};

// Never throws: the dashboard must stay usable when the backend is down or the
// signed-in role may not read orders. Only the totals are needed, so each query
// asks for a single row.
export async function loadDashboardOrderData(
  api: Pick<OrdersApi, 'listOrders'>,
): Promise<DashboardOrderData> {
  const base = { search: '', sort: DEFAULT_ORDER_SORT, page: 1 } as const;
  try {
    const [all, pending] = await Promise.all([
      api.listOrders({ ...base, status: '' }, 1),
      api.listOrders({ ...base, status: PENDING_STATUS }, 1),
    ]);
    return {
      available: true,
      totalOrders: all.total,
      pendingOrders: pending.total,
    };
  } catch (error) {
    console.error('Unable to load dashboard order data:', error);
    return UNAVAILABLE_ORDER_DATA;
  }
}

export interface DashboardNotification {
  text: string;
  href: string;
}

export function buildNotifications(
  customers: DashboardCustomerData,
  orders: DashboardOrderData = UNAVAILABLE_ORDER_DATA,
): DashboardNotification[] {
  const notifications: DashboardNotification[] = [];
  if (orders.available && orders.pendingOrders > 0) {
    const noun = orders.pendingOrders === 1 ? 'order is' : 'orders are';
    notifications.push({
      text: `${orders.pendingOrders} ${noun} awaiting processing`,
      href: `/admin/orders?status=${PENDING_STATUS}`,
    });
  }
  if (customers.newCustomers > 0) {
    const noun = customers.newCustomers === 1 ? 'customer' : 'customers';
    notifications.push({
      text: `${customers.newCustomers} new ${noun} registered in the last ${NEW_CUSTOMER_WINDOW_DAYS} days`,
      href: '/admin/customers?sort=newest',
    });
  }
  return notifications;
}

const SYSTEM_SERVICES = [
  { label: 'Database Connection', upText: 'Connected', backendDerived: true },
  { label: 'Backend Service', upText: 'Operational', backendDerived: true },
  { label: 'API Status', upText: 'Operational', backendDerived: true },
  { label: 'Email Service', upText: '', backendDerived: false },
] as const;

// A successful customer query proves the backend, API and database are all up.
export function buildSystemStatus(backendAvailable: boolean) {
  return SYSTEM_SERVICES.map((service) => {
    const isUp = backendAvailable && service.backendDerived;
    return {
      label: service.label,
      text: isUp ? service.upText : UNKNOWN_STATUS,
      ok: isUp,
    };
  });
}

export function renderNotifications(
  notifications: DashboardNotification[],
): string {
  if (notifications.length === 0) {
    return '<p class="admin-empty">No active notifications</p>';
  }
  const items = notifications
    .map(
      ({ text, href }) =>
        `<li><a href="${escapeHtml(href)}">${escapeHtml(text)}</a></li>`,
    )
    .join('');
  return `<ul class="admin-feed">${items}</ul>`;
}

export function renderActivity(customers: Customer[]): string {
  if (customers.length === 0) {
    return '<p class="admin-empty">No recent activity available</p>';
  }
  const items = customers
    .map(
      (customer) =>
        `<li><a href="/admin/customers/${encodeURIComponent(customer.id)}">${escapeHtml(customerFullName(customer))}</a> registered <time datetime="${escapeHtml(customer.registrationDate)}">${escapeHtml(formatRegistrationDate(customer.registrationDate))}</time></li>`,
    )
    .join('');
  return `<ul class="admin-feed">${items}</ul>`;
}

export function renderSystemStatus(
  statuses: ReturnType<typeof buildSystemStatus>,
): string {
  return statuses
    .map(
      (service) =>
        `<li><span>${escapeHtml(service.label)}</span><span class="admin-status-badge${service.ok ? ' is-ok' : ''}">${escapeHtml(service.text)}</span></li>`,
    )
    .join('');
}
