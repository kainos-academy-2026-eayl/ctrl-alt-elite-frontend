import en, { type MessageKey } from './messages/en';

/*
 * The translator used by server code, templates and browser scripts alike.
 * It has no Node or browser dependencies: the server (i18n/server.ts) and the
 * browser (client/i18n.ts) each register the other languages and say
 * how to find the current one. English is complete; other languages fall
 * back to it key by key, and unknown keys are shown as-is.
 */

export type { MessageKey };
export type Params = Record<string, string | number>;
type Dictionary = Partial<Record<string, string>>;

const dictionaries = new Map<string, Dictionary>([['en', en]]);
let currentLocale: () => string = () => 'en';

export function registerDictionary(locale: string, messages: Dictionary) {
  dictionaries.set(locale, { ...dictionaries.get(locale), ...messages });
}

export function setLocaleResolver(resolver: () => string): void {
  currentLocale = resolver;
}

function lookup(key: string): string | undefined {
  return dictionaries.get(currentLocale())?.[key] ?? (en as Dictionary)[key];
}

function fill(template: string, params: Params): string {
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in params ? String(params[name]) : match,
  );
}

const INTL_LOCALES: Record<string, string> = {
  en: 'en-GB',
  cy: 'cy-GB',
  ga: 'ga-IE',
  fr: 'fr-FR',
};

/** The text for a key in the current language, with {placeholders} filled. */
export function t(key: MessageKey, params: Params = {}): string {
  return fill(lookup(key) ?? key, params);
}

/**
 * Text that depends on a number, such as "1 item" or "3 items". The key has
 * plural forms ("items.one", "items.other", and for Welsh and Irish also
 * "zero", "two", "few" and "many") chosen by the language's plural rules.
 */
export function tCount(key: string, count: number, params: Params = {}) {
  const intl = INTL_LOCALES[currentLocale()] ?? 'en-GB';
  const form = new Intl.PluralRules(intl).select(count);
  const template =
    lookup(`${key}.${form}`) ?? lookup(`${key}.other`) ?? `${key}.other`;
  return fill(template, { count, ...params });
}

/** Category names are shared data; ones without a translation stay as-is. */
export function tCategory(category: string): string {
  return lookup(`category.${category}`) ?? category;
}

/** Every "js." message in the current language, for browser scripts. */
export function browserMessages(): Record<string, string> {
  const messages: Record<string, string> = {};
  for (const key of Object.keys(en)) {
    if (key.startsWith('js.')) {
      messages[key] = lookup(key) ?? key;
    }
  }
  return messages;
}
