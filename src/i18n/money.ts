import { currentPreferences } from './context';
import { CURRENCIES, intlLocale, poundsTo } from './locales';

function formatter(currency: string) {
  return new Intl.NumberFormat(intlLocale(currentPreferences().locale), {
    style: 'currency',
    currency,
    // "£" and "€", not "£GB" as some languages would show.
    currencyDisplay: 'narrowSymbol',
  });
}

/**
 * A price for display, in the visitor's chosen currency. Amounts in pounds
 * are converted at a fixed rate, so non-pound prices are approximate.
 */
export function formatPrice(pence: number): string {
  const { currency } = currentPreferences();
  return formatter(currency).format((pence / 100) * poundsTo(currency));
}

/** An exact amount in pounds, for what is actually charged and credited. */
export function formatPounds(pence: number): string {
  return formatter('GBP').format(pence / 100);
}

/** True when prices are being shown converted from pounds. */
export function isConvertedCurrency(): boolean {
  return currentPreferences().currency !== 'GBP';
}

/** The symbol of the chosen currency, such as "£" or "€". */
export function currencySymbol(): string {
  const { currency } = currentPreferences();
  return CURRENCIES.find((option) => option.code === currency)?.symbol ?? '£';
}

/** Converts an amount typed in the chosen currency back to pounds. */
export function toPounds(amount: number): number {
  return amount / poundsTo(currentPreferences().currency);
}
