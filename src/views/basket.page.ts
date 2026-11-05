import type { BasketResponseDto } from '../dtos/basketDto';
import { currentPreferences } from '../i18n/context';
import { formatPrice, isConvertedCurrency } from '../i18n/money';
import { t, tCount } from '../i18n/runtime';
import { localiseProduct } from '../i18n/server';
import type { BasketNotice } from '../util/basketCookie';

export { formatPounds, formatPrice } from '../i18n/money';

/*
 * Page model for basket.njk. Turns the backend basket into display-ready
 * values (formatted prices, counts and form URLs) so the template only renders.
 */

export interface BasketSummary {
  itemCount: number;
  itemCountText: string;
  /** The header basket link's text for screen readers, e.g. "Basket, 2 items". */
  label: string;
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
  /** Explains converted prices, or '' when prices are shown in pounds. */
  currencyNote: string;
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

export function formatItemCount(count: number): string {
  return tCount('count.items', count);
}

/** The header basket link: "Basket, 2 items" with a count badge. */
export function toBasketSummary(
  basket: BasketResponseDto | null,
): BasketSummary {
  const itemCount = basket?.itemCount ?? 0;
  return {
    itemCount,
    itemCountText: formatItemCount(itemCount),
    label: tCount('header.basket', itemCount),
  };
}

function toLineView(
  line: BasketResponseDto['items'][number],
  maxQuantity: number,
  focusTarget: string | null,
): BasketLineView {
  const itemUrl = `/basket/items/${encodeURIComponent(line.id)}`;
  return {
    id: line.id,
    name: localiseProduct(line).name,
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
    currencyNote: isConvertedCurrency()
      ? t('basket.payInPounds', { currency: currentPreferences().currency })
      : '',
    notice,
    loadErrorMessage,
    focusTarget,
    currentYear: now.getFullYear(),
  };
}
