/*
 * Pure basket rules used by src/controllers/basket.ts. Nothing in this file
 * touches the page or sessionStorage, so every function can be unit tested.
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

export type AddResult =
  | { status: 'added'; items: BasketItem[] }
  | { status: 'at-max' };

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

/**
 * Reads a saved basket. `repaired` is true when the saved value was
 * unreadable or contained invalid items that had to be dropped.
 */
export function parseSavedBasket(raw: string | null): {
  items: BasketItem[];
  repaired: boolean;
} {
  if (raw === null) {
    return { items: [], repaired: false };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { items: [], repaired: true };
  }
  if (!Array.isArray(parsed)) {
    return { items: [], repaired: true };
  }
  const items = parsed.filter(isValidItem);
  return { items, repaired: items.length !== parsed.length };
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

export function addItem(
  items: readonly BasketItem[],
  product: BasketItem,
): AddResult {
  const existing = items.find((item) => item.id === product.id);
  if (!existing) {
    return { status: 'added', items: [...items, { ...product, quantity: 1 }] };
  }
  if (existing.quantity >= MAX_QUANTITY) {
    return { status: 'at-max' };
  }
  return {
    status: 'added',
    items: items.map((item) =>
      item.id === product.id ? { ...item, quantity: item.quantity + 1 } : item,
    ),
  };
}

/** Changes a quantity, keeping it between 1 and MAX_QUANTITY. */
export function changeQuantity(
  items: readonly BasketItem[],
  id: string,
  change: number,
): BasketItem[] {
  return items.map((item) =>
    item.id === id
      ? {
          ...item,
          quantity: Math.min(Math.max(item.quantity + change, 1), MAX_QUANTITY),
        }
      : item,
  );
}

export function removeItem(
  items: readonly BasketItem[],
  id: string,
): BasketItem[] {
  return items.filter((item) => item.id !== id);
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

export function maxQuantityMessage(productName: string): string {
  return `You already have the maximum of ${MAX_QUANTITY} × ${productName} in your basket`;
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
