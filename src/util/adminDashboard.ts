import {
  type Customer,
  type CustomerSource,
  customerFullName,
  formatRegistrationDate,
} from './customers';
import { escapeHtml } from './customerViews';

const RECENT_ACTIVITY_LIMIT = 5;
const NEW_CUSTOMER_WINDOW_DAYS = 7;
const NEWEST_PAGE_SIZE = 100;
const DAY_MS = 24 * 60 * 60 * 1000;
const UNKNOWN_STATUS = 'Status unavailable';

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

export function buildNotifications(data: DashboardCustomerData): string[] {
  if (data.newCustomers === 0) return [];
  const noun = data.newCustomers === 1 ? 'customer' : 'customers';
  return [
    `${data.newCustomers} new ${noun} registered in the last ${NEW_CUSTOMER_WINDOW_DAYS} days`,
  ];
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

export function renderNotifications(messages: string[]): string {
  if (messages.length === 0) {
    return '<p class="admin-empty">No active notifications</p>';
  }
  const items = messages
    .map(
      (message) =>
        `<li><a href="/admin/customers?sort=newest">${escapeHtml(message)}</a></li>`,
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
