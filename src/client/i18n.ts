import { registerDictionary, setLocaleResolver } from '../i18n/runtime';

/*
 * Browser side: the page embeds its "js." messages as JSON (see layout.njk),
 * so scripts show text in the page's language. Pages without them, such as
 * staff pages, stay in English.
 */
const element = document.getElementById('i18n-messages');
const locale = document.documentElement.lang || 'en';
if (element?.textContent) {
  try {
    registerDictionary(locale, JSON.parse(element.textContent));
  } catch {
    // Malformed messages are ignored and English is used.
  }
}
setLocaleResolver(() => locale);
