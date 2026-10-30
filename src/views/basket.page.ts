import type { BasketResponseDto } from '../dtos/basketDto';
import type { BasketNotice } from '../util/basketCookie';

/*
 * Page model for basket.njk. Turns the backend basket into display-ready
 * values (formatted prices, counts and form URLs) so the template only renders.
 */

export interface BasketSummary {
  itemCount: number;
  itemCountText: string;
}

export interface BasketLineView {
  id: string;
  name: string;
  quantity: number;
  unitPrice: string;
  lineTotal: string;
  canDecrease: boolean;
  canIncrease: boolean;
  focusDecrease: boolean;
  focusIncrease: boolean;
  updateUrl: string;
  removeUrl: string;
}

export interface BasketPage {
  basketSummary: BasketSummary;
  isBasketPage: true;
  lines: BasketLineView[];
  isEmpty: boolean;
  total: string;
  notice: BasketNotice | null;
  loadErrorMessage: string;
  focusTarget: string | null;
  currentYear: number;
}

export interface BasketPageInput {
  /** The basket, or null when there is none or it could not be loaded. */
  basket: BasketResponseDto | null;
  notice: BasketNotice | null;
  loadErrorMessage: string;
  focusTarget?: string | null;
  now: Date;
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

/** The header basket link: "Basket, 2 items" with a count badge. */
export function toBasketSummary(
  basket: BasketResponseDto | null,
): BasketSummary {
  const itemCount = basket?.itemCount ?? 0;
  return { itemCount, itemCountText: formatItemCount(itemCount) };
}

function toLineView(
  line: BasketResponseDto['items'][number],
  maxQuantity: number,
  focusTarget: string | null,
): BasketLineView {
  const itemUrl = `/basket/items/${encodeURIComponent(line.id)}`;
  return {
    id: line.id,
    name: line.name,
    quantity: line.quantity,
    unitPrice: formatPrice(line.unitPricePence),
    lineTotal: formatPrice(line.lineTotalPence),
    canDecrease: line.quantity > 1,
    canIncrease: line.quantity < maxQuantity,
    focusDecrease: focusTarget === `${line.id}:decrease`,
    focusIncrease: focusTarget === `${line.id}:increase`,
    updateUrl: itemUrl,
    removeUrl: `${itemUrl}/remove`,
  };
}

export function buildBasketPage({
  basket,
  notice,
  loadErrorMessage,
  focusTarget = null,
  now,
}: BasketPageInput): BasketPage {
  const lines = (basket?.items ?? []).map((line) =>
    toLineView(line, basket?.maxQuantity ?? 0, focusTarget),
  );
  return {
    basketSummary: toBasketSummary(basket),
    isBasketPage: true,
    lines,
    isEmpty: lines.length === 0,
    total: formatPrice(basket?.totalPence ?? 0),
    notice,
    loadErrorMessage,
    focusTarget,
    currentYear: now.getFullYear(),
  };
}
