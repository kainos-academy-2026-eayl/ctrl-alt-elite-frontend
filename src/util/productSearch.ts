import type { Product } from '../data/sampleProducts';

export const MAX_SEARCH_TERM_LENGTH = 100;

export function normaliseSearchTerm(rawTerm: unknown): string {
  if (typeof rawTerm !== 'string') return '';
  return rawTerm.trim().slice(0, MAX_SEARCH_TERM_LENGTH);
}

/** Every word in the term must partially match the product name or a keyword. */
export function searchProducts(
  products: readonly Product[],
  searchTerm: string,
): Product[] {
  const words = searchTerm.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];

  return products.filter((product) => {
    const searchableText = [product.name, ...product.keywords]
      .join(' ')
      .toLowerCase();
    return words.every((word) => searchableText.includes(word));
  });
}
