import {
  type Customer,
  type CustomerSource,
  customerFullName,
  formatRegistrationDate,
} from './customers';

const RECENT_ACTIVITY_LIMIT = 5;
const NEW_CUSTOMER_WINDOW_DAYS = 7;
const NEWEST_PAGE_SIZE = 100;
const LOAD_TIMEOUT_MS = 3000;
const DAY_MS = 24 * 60 * 60 * 1000;

export interface DashboardCustomerData {
  available: boolean;
  totalCustomers: number;
  recentCustomers: Customer[];
  newCustomers: number;
}

export interface DashboardActivityItem {
  id: string;
  name: string;
  registrationDate: string;
  registeredDisplay: string;
}

export const UNAVAILABLE_CUSTOMER_DATA: DashboardCustomerData = {
  available: false,
  totalCustomers: 0,
  recentCustomers: [],
  newCustomers: 0,
};

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error('Timed out loading dashboard data.')),
      ms,
    );
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

// Never throws: the dashboard must stay available when the backend is down.
export async function loadDashboardCustomerData(
  source: CustomerSource,
  now: Date = new Date(),
): Promise<DashboardCustomerData> {
  try {
    const result = await withTimeout(
      source.query({
        search: '',
        email: '',
        sort: 'newest',
        page: 1,
        pageSize: NEWEST_PAGE_SIZE,
      }),
      LOAD_TIMEOUT_MS,
    );
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

export function buildActivity(
  data: DashboardCustomerData,
): DashboardActivityItem[] {
  return data.recentCustomers.map((customer) => ({
    id: customer.id,
    name: customerFullName(customer),
    registrationDate: customer.registrationDate,
    registeredDisplay: formatRegistrationDate(customer.registrationDate),
  }));
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

const UNKNOWN_STATUS = 'Status unavailable';

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

export function buildSummaryCards<T extends { label: string; value: number }>(
  cards: readonly T[],
  data: DashboardCustomerData,
): Array<{ label: string; value: number }> {
  return cards.map((card) => ({
    label: card.label,
    value:
      card.label === 'Customers' && data.available
        ? data.totalCustomers
        : card.value,
  }));
}
