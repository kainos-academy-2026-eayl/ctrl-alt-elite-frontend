/*
 * The languages and currencies customers can choose. English and pounds are
 * the defaults. Prices are stored and charged in pounds; other currencies are
 * shown converted at a fixed, approximate rate.
 */

export const LOCALES = [
  { code: 'en', name: 'English', intl: 'en-GB' },
  { code: 'cy', name: 'Cymraeg', intl: 'cy-GB' },
  { code: 'ga', name: 'Gaeilge', intl: 'ga-IE' },
  { code: 'fr', name: 'Français', intl: 'fr-FR' },
] as const;

export type Locale = (typeof LOCALES)[number]['code'];
export const DEFAULT_LOCALE: Locale = 'en';

export const CURRENCIES = [
  { code: 'GBP', symbol: '£', perPound: 1 },
  // Approximate: prices in euros are for guidance only.
  { code: 'EUR', symbol: '€', perPound: 1.17 },
] as const;

export type Currency = (typeof CURRENCIES)[number]['code'];
export const DEFAULT_CURRENCY: Currency = 'GBP';

export function isLocale(value: unknown): value is Locale {
  return LOCALES.some((locale) => locale.code === value);
}

export function isCurrency(value: unknown): value is Currency {
  return CURRENCIES.some((currency) => currency.code === value);
}

export function intlLocale(locale: Locale): string {
  return LOCALES.find((option) => option.code === locale)?.intl ?? 'en-GB';
}

export function poundsTo(currency: Currency): number {
  return CURRENCIES.find((option) => option.code === currency)?.perPound ?? 1;
}

/**
 * The best supported language from an Accept-Language header, for visitors
 * who have not chosen one yet. "cy-GB,en;q=0.8" gives "cy".
 */
export function localeFromHeader(header: string | undefined): Locale {
  if (!header) return DEFAULT_LOCALE;
  const ranked = header
    .split(',')
    .map((part) => {
      const [tag = '', ...params] = part.trim().split(';');
      const q = params
        .map((param) => param.trim())
        .find((param) => param.startsWith('q='));
      return { tag: tag.toLowerCase(), q: q ? Number(q.slice(2)) : 1 };
    })
    .filter(({ q }) => Number.isFinite(q) && q > 0)
    .sort((a, b) => b.q - a.q);
  for (const { tag } of ranked) {
    const language = tag.split('-')[0];
    if (isLocale(language)) return language;
  }
  return DEFAULT_LOCALE;
}

/** Corners the floating accessibility button can sit in. */
export const WIDGET_POSITIONS = [
  'bottom-right',
  'bottom-left',
  'top-right',
  'top-left',
] as const;

export type WidgetPosition = (typeof WIDGET_POSITIONS)[number];
export const DEFAULT_WIDGET_POSITION: WidgetPosition = 'bottom-right';

export function isWidgetPosition(value: unknown): value is WidgetPosition {
  return WIDGET_POSITIONS.some((position) => position === value);
}
