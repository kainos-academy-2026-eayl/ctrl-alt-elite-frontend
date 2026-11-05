import { AsyncLocalStorage } from 'node:async_hooks';
import {
  type Currency,
  DEFAULT_CURRENCY,
  DEFAULT_LOCALE,
  DEFAULT_WIDGET_POSITION,
  type Locale,
  type WidgetPosition,
} from './locales';

/**
 * The visitor's language and currency for the current request. Express runs
 * each request inside its own context (see preferencesMiddleware), so page
 * builders and templates can format text and prices without passing them
 * through every function. Outside a request (for example in unit tests) the
 * defaults, English and pounds, are used.
 */
export interface RequestPreferences {
  locale: Locale;
  currency: Currency;
  /** Translated product names and descriptions, by product id. */
  productText: ReadonlyMap<string, { name: string; description: string }>;
  /** The page being shown, so the language picker can come back to it. */
  currentPath: string;
  /** Where the floating accessibility button sits. */
  widgetPosition: WidgetPosition;
}

const storage = new AsyncLocalStorage<RequestPreferences>();

const DEFAULTS: RequestPreferences = {
  locale: DEFAULT_LOCALE,
  currency: DEFAULT_CURRENCY,
  productText: new Map(),
  currentPath: '/',
  widgetPosition: DEFAULT_WIDGET_POSITION,
};

export function currentPreferences(): RequestPreferences {
  return storage.getStore() ?? DEFAULTS;
}

export function runWithPreferences<T>(
  preferences: RequestPreferences,
  run: () => T,
): T {
  return storage.run(preferences, run);
}
