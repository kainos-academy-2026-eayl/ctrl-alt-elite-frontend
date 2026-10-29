/*
 * Request and response shapes for the backend basket API (/api/baskets).
 * The backend owns the prices, quantity limits (1–99) and totals; prices are
 * whole pence to avoid floating point rounding errors.
 */

export interface AddBasketItemRequestDto {
  productId: string;
}

export interface UpdateBasketItemRequestDto {
  change: number;
}

export interface BasketLineDto {
  /** The product id. */
  id: string;
  name: string;
  unitPricePence: number;
  quantity: number;
  lineTotalPence: number;
}

export interface BasketResponseDto {
  id: string;
  items: BasketLineDto[];
  itemCount: number;
  totalPence: number;
  maxQuantity: number;
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The backend only accepts UUID basket ids. */
export function isBasketId(value: unknown): value is string {
  return typeof value === 'string' && UUID_PATTERN.test(value);
}

function isWholeNumber(value: unknown, minimum: number): value is number {
  return Number.isSafeInteger(value) && (value as number) >= minimum;
}

function isBasketLineDto(
  value: unknown,
  maxQuantity: number,
): value is BasketLineDto {
  if (value === null || typeof value !== 'object') {
    return false;
  }
  const line = value as Record<string, unknown>;
  const expectedLineTotal =
    (line.unitPricePence as number) * (line.quantity as number);
  return (
    typeof line.id === 'string' &&
    line.id !== '' &&
    typeof line.name === 'string' &&
    isWholeNumber(line.unitPricePence, 0) &&
    isWholeNumber(line.quantity, 1) &&
    (line.quantity as number) <= maxQuantity &&
    Number.isSafeInteger(expectedLineTotal) &&
    line.lineTotalPence === expectedLineTotal
  );
}

/**
 * Checks a backend response before it is used, so a malformed or inconsistent
 * basket (for example totals that do not add up) is never shown.
 */
export function isBasketResponseDto(
  value: unknown,
): value is BasketResponseDto {
  if (value === null || typeof value !== 'object') {
    return false;
  }
  const basket = value as Record<string, unknown>;
  if (
    !isBasketId(basket.id) ||
    !isWholeNumber(basket.maxQuantity, 1) ||
    !Array.isArray(basket.items)
  ) {
    return false;
  }
  const maxQuantity = basket.maxQuantity as number;
  if (!basket.items.every((line) => isBasketLineDto(line, maxQuantity))) {
    return false;
  }
  const lines = basket.items as BasketLineDto[];
  const itemCount = lines.reduce((sum, line) => sum + line.quantity, 0);
  const totalPence = lines.reduce((sum, line) => sum + line.lineTotalPence, 0);
  return (
    Number.isSafeInteger(itemCount) &&
    Number.isSafeInteger(totalPence) &&
    basket.itemCount === itemCount &&
    basket.totalPence === totalPence
  );
}
