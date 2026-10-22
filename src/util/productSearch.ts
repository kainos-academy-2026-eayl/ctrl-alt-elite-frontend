import type { Product } from '../data/sampleProducts';

/** Matches the backend, which owns the search rules (GET /api/products/search). */
export const MAX_SEARCH_TERM_LENGTH = 100;

/** The backend's product search response, minus the echoed search term. */
export interface ProductSearchResult {
  products: Product[];
  /** True when at least one word had no exact match and a closest word was used instead. */
  isClosestMatch: boolean;
}

export function normaliseSearchTerm(rawTerm: unknown): string {
  if (typeof rawTerm !== 'string') return '';
  return rawTerm.trim().slice(0, MAX_SEARCH_TERM_LENGTH);
}
