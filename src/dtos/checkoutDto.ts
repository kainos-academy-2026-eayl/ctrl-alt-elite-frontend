/*
 * Shapes of the backend checkout API (GET /api/account, GET
 * /api/delivery-options, POST /api/orders and GET /api/orders/:id). All money
 * is whole pence. Responses are checked before they are shown.
 */

export interface AccountDto {
  firstName: string;
  lastName: string;
  email: string;
  creditBalancePence: number;
}

export interface DeliveryOptionDto {
  id: string;
  kind: 'delivery' | 'collection';
  name: string;
  description: string;
  pricePence: number;
}

export interface PlaceOrderRequestDto {
  items: { productId: string; quantity: number }[];
  customer: {
    firstName: string;
    lastName: string;
    email: string;
    phone: string;
  };
  address: {
    line1: string;
    line2: string;
    town: string;
    postcode: string;
  };
  deliveryOption: string;
}

export interface OrderItemDto {
  productId: string;
  name: string;
  unitPricePence: number;
  quantity: number;
  lineTotalPence: number;
}

export interface OrderDto {
  id: string;
  status: string;
  createdAt: string;
  items: OrderItemDto[];
  itemsTotalPence: number;
  deliveryPricePence: number;
  totalPence: number;
  delivery: { id: string; name: string; description: string } | null;
  customer: {
    firstName: string;
    lastName: string;
    email: string;
    phone: string;
  };
  address: {
    line1: string;
    line2: string | null;
    town: string;
    postcode: string;
  };
}

export interface OrderResultDto {
  order: OrderDto;
  creditBalancePence: number;
}

type Fields = Record<string, unknown>;

function isObject(value: unknown): value is Fields {
  return value !== null && typeof value === 'object';
}

function isPence(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}

function hasStrings(value: unknown, keys: readonly string[]): value is Fields {
  return isObject(value) && keys.every((key) => typeof value[key] === 'string');
}

export function isAccountResponse(
  value: unknown,
): value is { account: AccountDto } {
  return (
    isObject(value) &&
    hasStrings(value.account, ['firstName', 'lastName', 'email']) &&
    isPence(value.account.creditBalancePence)
  );
}

function isDeliveryOptionDto(value: unknown): value is DeliveryOptionDto {
  return (
    hasStrings(value, ['id', 'name', 'description']) &&
    (value.kind === 'delivery' || value.kind === 'collection') &&
    isPence(value.pricePence)
  );
}

export function isDeliveryOptionsResponse(
  value: unknown,
): value is { deliveryOptions: DeliveryOptionDto[] } {
  return (
    isObject(value) &&
    Array.isArray(value.deliveryOptions) &&
    value.deliveryOptions.every(isDeliveryOptionDto)
  );
}

function isOrderItemDto(value: unknown): value is OrderItemDto {
  return (
    hasStrings(value, ['productId', 'name']) &&
    isPence(value.unitPricePence) &&
    Number.isSafeInteger(value.quantity) &&
    (value.quantity as number) >= 1 &&
    value.lineTotalPence ===
      (value.unitPricePence as number) * (value.quantity as number)
  );
}

function isOrderDto(value: unknown): value is OrderDto {
  if (
    !hasStrings(value, ['id', 'status', 'createdAt']) ||
    !Array.isArray(value.items) ||
    !value.items.every(isOrderItemDto) ||
    !isPence(value.itemsTotalPence) ||
    !isPence(value.deliveryPricePence) ||
    !isPence(value.totalPence) ||
    !hasStrings(value.customer, ['firstName', 'lastName', 'email', 'phone']) ||
    !hasStrings(value.address, ['line1', 'town', 'postcode']) ||
    !(value.address.line2 === null || typeof value.address.line2 === 'string')
  ) {
    return false;
  }
  if (
    value.delivery !== null &&
    !hasStrings(value.delivery, ['id', 'name', 'description'])
  ) {
    return false;
  }
  const items = value.items as OrderItemDto[];
  const itemsTotal = items.reduce((sum, item) => sum + item.lineTotalPence, 0);
  return (
    value.itemsTotalPence === itemsTotal &&
    value.totalPence === itemsTotal + (value.deliveryPricePence as number)
  );
}

export function isOrderResultDto(value: unknown): value is OrderResultDto {
  return (
    isObject(value) &&
    isOrderDto(value.order) &&
    isPence(value.creditBalancePence)
  );
}
