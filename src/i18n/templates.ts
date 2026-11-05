import type { Environment } from 'nunjucks';
import { currentPreferences } from './context';
import { CURRENCIES, LOCALES, WIDGET_POSITIONS } from './locales';
import { isConvertedCurrency } from './money';
import { browserMessages, t, tCategory, tCount } from './runtime';

/** JSON that is safe inside a <script type="application/json"> element. */
function scriptJson(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026');
}

/**
 * Template helpers for translated text and the language and currency picker.
 * They read the current request's preferences, so they work in every
 * Nunjucks environment without controllers passing anything in.
 */
export function addI18nGlobals(env: Environment): void {
  env.addGlobal('t', t);
  env.addGlobal('tCount', tCount);
  env.addGlobal('tCategory', tCategory);
  env.addGlobal('prefs', () => {
    const { locale, currency, currentPath, widgetPosition } =
      currentPreferences();
    return {
      locale,
      currency,
      currentPath,
      isConverted: isConvertedCurrency(),
      locales: LOCALES.map((option) => ({
        ...option,
        isSelected: option.code === locale,
      })),
      widgetPosition,
      positions: WIDGET_POSITIONS.map((position) => ({
        value: position,
        isSelected: position === widgetPosition,
      })),
      currencies: CURRENCIES.map((option) => ({
        ...option,
        isSelected: option.code === currency,
      })),
    };
  });
  env.addGlobal('browserMessagesJson', () => scriptJson(browserMessages()));
}
