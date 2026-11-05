import type { Locale } from '../i18n/locales';

const REQUEST_TIMEOUT_MS = 3000;
const CACHE_MS = 5 * 60 * 1000;

export type ProductText = ReadonlyMap<
  string,
  { name: string; description: string }
>;

/**
 * Loads translated product names and descriptions from the backend
 * (GET /api/product-translations?lang=xx). Results are cached for a few
 * minutes per language. If the backend cannot be reached, products are shown
 * in English rather than failing the page.
 */
export class ProductTranslationService {
  private readonly cache = new Map<
    Locale,
    { loadedAt: number; text: Promise<ProductText> }
  >();

  constructor(
    private readonly backendOrigin: string,
    private readonly fetchImpl: typeof fetch = (input, init) =>
      fetch(input, init),
    private readonly now: () => number = Date.now,
  ) {}

  getProductText(locale: Locale): Promise<ProductText> {
    if (locale === 'en') return Promise.resolve(new Map());
    const cached = this.cache.get(locale);
    if (cached && this.now() - cached.loadedAt < CACHE_MS) {
      return cached.text;
    }
    const text = this.load(locale);
    this.cache.set(locale, { loadedAt: this.now(), text });
    return text;
  }

  private async load(locale: Locale): Promise<ProductText> {
    try {
      const url = new URL('/api/product-translations', this.backendOrigin);
      url.searchParams.set('lang', locale);
      const response = await this.fetchImpl(url, {
        headers: { accept: 'application/json' },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      if (!response.ok) {
        await response.body?.cancel();
        throw new Error(`Product translations returned ${response.status}`);
      }
      return toProductText(await response.json());
    } catch (error) {
      console.error('Unable to load product translations:', error);
      // Try again on the next request rather than caching the failure.
      this.cache.delete(locale);
      return new Map();
    }
  }
}

function toProductText(body: unknown): ProductText {
  const text = new Map<string, { name: string; description: string }>();
  const translations =
    typeof body === 'object' && body !== null && 'translations' in body
      ? body.translations
      : null;
  if (typeof translations !== 'object' || translations === null) return text;
  for (const [id, value] of Object.entries(translations)) {
    if (
      typeof value === 'object' &&
      value !== null &&
      typeof value.name === 'string' &&
      typeof value.description === 'string'
    ) {
      text.set(id, { name: value.name, description: value.description });
    }
  }
  return text;
}
