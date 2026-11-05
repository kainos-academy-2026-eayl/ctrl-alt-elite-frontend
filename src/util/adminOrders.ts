export const ORDER_STATUSES = [
  { value: 'PENDING', label: 'Pending' },
  { value: 'PROCESSING', label: 'Processing' },
  { value: 'SHIPPED', label: 'Shipped' },
  { value: 'DELIVERED', label: 'Delivered' },
  { value: 'CANCELLED', label: 'Cancelled' },
] as const;

export const ORDER_SORT_OPTIONS = [
  { value: 'newest', label: 'Newest first' },
  { value: 'oldest', label: 'Oldest first' },
  { value: 'totalDesc', label: 'Highest total' },
  { value: 'totalAsc', label: 'Lowest total' },
] as const;

export type OrderSort = (typeof ORDER_SORT_OPTIONS)[number]['value'];

export const DEFAULT_ORDER_SORT: OrderSort = 'newest';
export const ORDERS_PER_PAGE = 10;
export const MAX_ORDER_SEARCH_LENGTH = 200;

// Ids are UUIDs from the backend; reject anything else before building a URL.
export const ORDER_ID_PATTERN = /^[A-Za-z0-9-]{1,64}$/;

export interface OrderSummary {
  id: string;
  customerName: string;
  customerEmail: string;
  status: string;
  totalPence: number;
  itemCount: number;
  createdAt: string;
}

export interface OrderItem {
  productId: string;
  name: string;
  quantity: number;
  unitPricePence: number;
}

export interface OrderDetail {
  id: string;
  status: string;
  createdAt: string;
  totalPence: number;
  customer: {
    id: string;
    name: string;
    email: string;
    phone: string | null;
  };
  // Orders placed before checkout collected delivery details have none.
  delivery: {
    option: string | null;
    pricePence: number;
    addressLine1: string | null;
    addressLine2: string | null;
    town: string | null;
    postcode: string | null;
  };
  items: OrderItem[];
}

export interface OrderQuery {
  search: string;
  status: string;
  sort: OrderSort;
  page: number;
}

export interface OrderPage {
  orders: OrderSummary[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

type UnknownRecord = Record<string, unknown>;

export function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readNullableString(value: unknown): string | null | undefined {
  if (value === null || value === undefined) return null;
  return typeof value === 'string' ? value : undefined;
}

function isCount(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

export function parseOrderSort(value: unknown): OrderSort {
  return (
    ORDER_SORT_OPTIONS.find((option) => option.value === value)?.value ??
    DEFAULT_ORDER_SORT
  );
}

export function parseOrderStatus(value: unknown): string {
  return ORDER_STATUSES.find((status) => status.value === value)?.value ?? '';
}

function parsePage(value: unknown): number {
  const page = Number.parseInt(typeof value === 'string' ? value : '', 10);
  return Number.isInteger(page) && page > 0 ? page : 1;
}

export function readOrderQuery(searchParams: URLSearchParams): OrderQuery {
  return {
    search: (searchParams.get('q') ?? '')
      .trim()
      .slice(0, MAX_ORDER_SEARCH_LENGTH),
    status: parseOrderStatus(searchParams.get('status')),
    sort: parseOrderSort(searchParams.get('sort')),
    page: parsePage(searchParams.get('page')),
  };
}

export function orderQueryParams(
  query: OrderQuery,
  pageSize: number = ORDERS_PER_PAGE,
): URLSearchParams {
  const params = new URLSearchParams({
    sort: query.sort,
    page: String(query.page),
    pageSize: String(pageSize),
  });
  if (query.search) params.set('search', query.search);
  if (query.status) params.set('status', query.status);
  return params;
}

export function buildOrdersUrl(
  query: Omit<OrderQuery, 'page'> & { page?: number },
) {
  const params = new URLSearchParams();
  if (query.search) params.set('q', query.search);
  if (query.status) params.set('status', query.status);
  if (query.sort !== DEFAULT_ORDER_SORT) params.set('sort', query.sort);
  if (query.page && query.page > 1) params.set('page', String(query.page));
  const queryString = params.toString();
  return `/admin/orders${queryString ? `?${queryString}` : ''}`;
}

const currency = new Intl.NumberFormat('en-GB', {
  style: 'currency',
  currency: 'GBP',
});

export function formatPence(pence: number): string {
  return currency.format(pence / 100);
}

export function formatOrderDate(isoDate: string): string {
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) return isoDate;
  return date.toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'UTC',
  });
}

// "3f2a9c1e-..." becomes "#3F2A9C1E" so staff can quote a short reference.
export function orderReference(id: string): string {
  return `#${id.replaceAll('-', '').slice(0, 8).toUpperCase()}`;
}

export function orderStatusLabel(status: string): string {
  return (
    ORDER_STATUSES.find((option) => option.value === status)?.label ?? status
  );
}

export function parseOrderSummary(value: unknown): OrderSummary | undefined {
  if (!isRecord(value)) return undefined;
  const { id, customerName, customerEmail, status, createdAt } = value;
  if (
    typeof id !== 'string' ||
    typeof customerName !== 'string' ||
    typeof customerEmail !== 'string' ||
    typeof status !== 'string' ||
    typeof createdAt !== 'string' ||
    !isCount(value.totalPence) ||
    !isCount(value.itemCount)
  ) {
    return undefined;
  }
  return {
    id,
    customerName,
    customerEmail,
    status,
    totalPence: value.totalPence,
    itemCount: value.itemCount,
    createdAt,
  };
}

export function parseOrderPage(value: unknown): OrderPage | undefined {
  if (!isRecord(value) || !Array.isArray(value.orders)) return undefined;
  const orders = value.orders.map(parseOrderSummary);
  if (
    orders.some((order) => order === undefined) ||
    !isCount(value.page) ||
    !isCount(value.pageSize) ||
    !isCount(value.total) ||
    !isCount(value.totalPages)
  ) {
    return undefined;
  }
  return {
    orders: orders as OrderSummary[],
    page: value.page,
    pageSize: value.pageSize,
    total: value.total,
    totalPages: value.totalPages,
  };
}

function parseOrderItem(value: unknown): OrderItem | undefined {
  if (!isRecord(value)) return undefined;
  const { productId, name } = value;
  if (
    typeof productId !== 'string' ||
    typeof name !== 'string' ||
    !isCount(value.quantity) ||
    !isCount(value.unitPricePence)
  ) {
    return undefined;
  }
  return {
    productId,
    name,
    quantity: value.quantity,
    unitPricePence: value.unitPricePence,
  };
}

export function parseOrderDetail(value: unknown): OrderDetail | undefined {
  if (!isRecord(value) || !isRecord(value.customer)) return undefined;
  const delivery = isRecord(value.delivery) ? value.delivery : {};
  const { id, status, createdAt, customer } = value;
  const phone = readNullableString(customer.phone);
  const option = readNullableString(delivery.option);
  const line1 = readNullableString(delivery.addressLine1);
  const line2 = readNullableString(delivery.addressLine2);
  const town = readNullableString(delivery.town);
  const postcode = readNullableString(delivery.postcode);
  const items = Array.isArray(value.items)
    ? value.items.map(parseOrderItem)
    : undefined;
  if (
    typeof id !== 'string' ||
    typeof status !== 'string' ||
    typeof createdAt !== 'string' ||
    !isCount(value.totalPence) ||
    typeof customer.id !== 'string' ||
    typeof customer.name !== 'string' ||
    typeof customer.email !== 'string' ||
    phone === undefined ||
    option === undefined ||
    line1 === undefined ||
    line2 === undefined ||
    town === undefined ||
    postcode === undefined ||
    !items ||
    items.some((item) => item === undefined)
  ) {
    return undefined;
  }
  return {
    id,
    status,
    createdAt,
    totalPence: value.totalPence,
    customer: {
      id: customer.id,
      name: customer.name,
      email: customer.email,
      phone,
    },
    delivery: {
      option,
      pricePence: isCount(delivery.pricePence) ? delivery.pricePence : 0,
      addressLine1: line1,
      addressLine2: line2,
      town,
      postcode,
    },
    items: items as OrderItem[],
  };
}

export { isCount };
