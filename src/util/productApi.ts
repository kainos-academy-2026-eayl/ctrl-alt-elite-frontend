import type { Product } from '../data/sampleProducts';
import type { ProductSearchResult } from './productSearch';

const SEARCH_TIMEOUT_MS = 5000;

function isProductSearchResult(body: unknown): body is ProductSearchResult {
  return (
    typeof body === 'object' &&
    body !== null &&
    'products' in body &&
    Array.isArray(body.products) &&
    'isClosestMatch' in body &&
    typeof body.isClosestMatch === 'boolean'
  );
}

/** Searches the backend catalogue. Throws if the backend fails or is unreachable. */
export async function searchProductsApi(
  backendOrigin: string,
  searchTerm: string,
): Promise<ProductSearchResult> {
  const url = new URL('/api/products/search', backendOrigin);
  url.searchParams.set('q', searchTerm);

  const response = await fetch(url, {
    headers: { accept: 'application/json' },
    signal: AbortSignal.timeout(SEARCH_TIMEOUT_MS),
  });
  if (!response.ok) {
    throw new Error(`Product search failed with status ${response.status}`);
  }
  const body: unknown = await response.json();
  if (!isProductSearchResult(body)) {
    throw new Error('Product search returned an unexpected response');
  }
  return {
    products: body.products as Product[],
    isClosestMatch: body.isClosestMatch,
  };
}
