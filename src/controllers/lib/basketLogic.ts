/*
 * Pure basket helpers used by src/controllers/basket.ts. Nothing in this file
 * touches the page, the network or sessionStorage, so every function can be
 * unit tested. The backend owns the basket rules (quantity limits, prices and
 * totals); these helpers format its responses and check they are consistent.
 * Prices are whole pence to avoid floating point rounding errors.
 */

export const MAX_QUANTITY = 99;

export interface BasketItem {
  id: string;
  name: string;
  unitPricePence: number;
  quantity: number;
}

export interface BasketLine extends BasketItem {
  lineTotalPence: number;
}

/** The basket returned by every /api/baskets endpoint. */
export interface BasketResponse {
  id: string;
  items: BasketLine[];
  itemCount: number;
  totalPence: number;
  maxQuantity: number;
}

export interface BasketTotals {
  lines: BasketLine[];
  itemCount: number;
  totalPence: number;
}

export interface ProductInput {
  id: string | null | undefined;
  name: string | null | undefined;
  price: string | null | undefined;
}

export interface CheckoutSnapshot {
  version: 1;
  createdAt: string;
  itemCount: number;
  totalPence: number;
  items: BasketLine[];
}

export interface RecentAdd {
  productId: string;
  count: number;
}

const currency = new Intl.NumberFormat('en-GB', {
  style: 'currency',
  currency: 'GBP',
});

export function formatPrice(pence: number): string {
  return currency.format(pence / 100);
}

export function formatItemCount(count: number): string {
  return `${count} ${count === 1 ? 'item' : 'items'}`;
}

export function isValidItem(item: unknown): item is BasketItem {
  if (item === null || typeof item !== 'object') {
    return false;
  }
  const candidate = item as Record<string, unknown>;
  return (
    typeof candidate.id === 'string' &&
    candidate.id !== '' &&
    typeof candidate.name === 'string' &&
    Number.isInteger(candidate.unitPricePence) &&
    (candidate.unitPricePence as number) >= 0 &&
    Number.isInteger(candidate.quantity) &&
    (candidate.quantity as number) >= 1 &&
    (candidate.quantity as number) <= MAX_QUANTITY
  );
}

/** Turns "Add to Basket" button data into a basket item, or null if invalid. */
export function parseProduct({
  id,
  name,
  price,
}: ProductInput): BasketItem | null {
  const productId = String(id ?? '').trim();
  const productName = String(name ?? '').trim();
  const unitPricePence = Math.round(Number.parseFloat(price ?? '') * 100);

  if (
    productId === '' ||
    productName === '' ||
    !Number.isFinite(unitPricePence) ||
    unitPricePence < 0
  ) {
    return null;
  }
  return { id: productId, name: productName, unitPricePence, quantity: 1 };
}

function isValidLine(line: unknown): line is BasketLine {
  return (
    isValidItem(line) &&
    (line as BasketItem & Record<string, unknown>).lineTotalPence ===
      line.unitPricePence * line.quantity
  );
}

/**
 * Checks a backend response before it is shown, so a malformed or
 * inconsistent basket (e.g. totals that do not add up) is never displayed.
 */
export function isBasketResponse(value: unknown): value is BasketResponse {
  if (value === null || typeof value !== 'object') {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  if (
    typeof candidate.id !== 'string' ||
    candidate.id === '' ||
    !Array.isArray(candidate.items) ||
    !candidate.items.every(isValidLine) ||
    !Number.isInteger(candidate.maxQuantity)
  ) {
    return false;
  }
  const { itemCount, totalPence } = calculateTotals(candidate.items);
  return (
    candidate.itemCount === itemCount && candidate.totalPence === totalPence
  );
}

export function calculateTotals(items: readonly BasketItem[]): BasketTotals {
  const lines = items.map((item) => ({
    ...item,
    lineTotalPence: item.unitPricePence * item.quantity,
  }));
  return {
    lines,
    itemCount: lines.reduce((sum, line) => sum + line.quantity, 0),
    totalPence: lines.reduce((sum, line) => sum + line.lineTotalPence, 0),
  };
}

/**
 * Repeated adds of the same product while its notification is still showing
 * build up one running count instead of repeating the same message.
 */
export function nextAddCount(
  recentAdd: RecentAdd | null,
  productId: string,
): number {
  return recentAdd?.productId === productId ? recentAdd.count + 1 : 1;
}

export function addedMessage(productName: string, count: number): string {
  return count === 1
    ? `${productName} added to your basket`
    : `${count} × ${productName} added to your basket`;
}

export function createCheckoutSnapshot(
  items: readonly BasketItem[],
  createdAt: Date,
): CheckoutSnapshot {
  const { lines, itemCount, totalPence } = calculateTotals(items);
  return {
    version: 1,
    createdAt: createdAt.toISOString(),
    itemCount,
    totalPence,
    items: lines,
  };
}
