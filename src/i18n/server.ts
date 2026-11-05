import { currentPreferences } from './context';
import cy from './messages/cy';
import fr from './messages/fr';
import ga from './messages/ga';
import { registerDictionary, setLocaleResolver } from './runtime';

/** Server side: every language, chosen per request by preferencesMiddleware. */
registerDictionary('cy', cy);
registerDictionary('ga', ga);
registerDictionary('fr', fr);
setLocaleResolver(() => currentPreferences().locale);

/** A product's name and description in the visitor's language, if known. */
export function localiseProduct<
  T extends { id: string | number; name: string; description?: string },
>(product: T): T {
  const text = currentPreferences().productText.get(String(product.id));
  if (!text) return product;
  return {
    ...product,
    name: text.name || product.name,
    ...(product.description === undefined
      ? {}
      : { description: text.description || product.description }),
  };
}
