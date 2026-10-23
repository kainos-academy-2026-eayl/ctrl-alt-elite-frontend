export interface Customer {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  registrationDate: string;
}

export const CUSTOMER_SORT_OPTIONS = [
  { value: 'nameAsc', label: 'Name A-Z' },
  { value: 'nameDesc', label: 'Name Z-A' },
  { value: 'newest', label: 'Newest Registered' },
  { value: 'oldest', label: 'Oldest Registered' },
] as const;

export type CustomerSort = (typeof CUSTOMER_SORT_OPTIONS)[number]['value'];

export const DEFAULT_CUSTOMER_SORT: CustomerSort = 'nameAsc';
export const CUSTOMERS_PER_PAGE = 10;
export const MAX_NAME_SEARCH_LENGTH = 200;
export const MAX_EMAIL_SEARCH_LENGTH = 254;

export interface CustomerQuery {
  search: string;
  email: string;
  sort: CustomerSort;
  page: number;
  pageSize: number;
}

export interface CustomerPage {
  customers: Customer[];
  totalCustomers: number;
  matchingCustomers: number;
  page: number;
  totalPages: number;
}

export interface CustomerSource {
  query(query: CustomerQuery): Promise<CustomerPage>;
  findById(id: string): Promise<Customer | undefined>;
}

export function customerFullName(customer: Customer): string {
  return `${customer.firstName} ${customer.lastName}`.trim();
}

export function parseCustomerSort(value: unknown): CustomerSort {
  return (
    CUSTOMER_SORT_OPTIONS.find((option) => option.value === value)?.value ??
    DEFAULT_CUSTOMER_SORT
  );
}

export function parsePage(value: unknown): number {
  const page = Number.parseInt(typeof value === 'string' ? value : '', 10);
  return Number.isInteger(page) && page > 0 ? page : 1;
}

export function parseSearch(value: unknown, maxLength: number): string {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}

export function formatRegistrationDate(isoDate: string): string {
  return new Date(`${isoDate}T00:00:00Z`).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

export function buildCustomersUrl(params: {
  search: string;
  email: string;
  sort: CustomerSort;
  page?: number;
}): string {
  const query = new URLSearchParams();
  if (params.search) query.set('q', params.search);
  if (params.email) query.set('email', params.email);
  if (params.sort !== DEFAULT_CUSTOMER_SORT) query.set('sort', params.sort);
  if (params.page && params.page > 1) query.set('page', String(params.page));
  const queryString = query.toString();
  return `/admin/customers${queryString ? `?${queryString}` : ''}`;
}

export function readCustomerQuery(searchParams: URLSearchParams) {
  return {
    search: parseSearch(searchParams.get('q'), MAX_NAME_SEARCH_LENGTH),
    email: parseSearch(searchParams.get('email'), MAX_EMAIL_SEARCH_LENGTH),
    sort: parseCustomerSort(searchParams.get('sort')),
    page: parsePage(searchParams.get('page')),
  };
}

// Ids are UUIDs from the backend; reject anything else before building a URL.
export const CUSTOMER_ID_PATTERN = /^[A-Za-z0-9-]{1,64}$/;
