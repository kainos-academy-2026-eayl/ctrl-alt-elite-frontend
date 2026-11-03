/*
 * Response shape of the backend's GET /api/products/search. The backend owns
 * the matching rules; the frontend only displays what it returns.
 */

export interface ProductSearchItemDto {
  id: string;
  name: string;
  description: string;
  /** Usually a data: URL with the product image. */
  imageUrl: string;
  /** Price in pounds as a 2 decimal place string, e.g. "24.99". */
  price: string;
  keywords: string[];
  isInStock: boolean;
}

export interface ProductSearchResponseDto {
  searchTerm: string;
  products: ProductSearchItemDto[];
  /** True when a misspelled word was matched to the closest product instead. */
  isClosestMatch: boolean;
}

function isProductSearchItemDto(value: unknown): value is ProductSearchItemDto {
  if (value === null || typeof value !== 'object') {
    return false;
  }
  const item = value as Record<string, unknown>;
  return (
    typeof item.id === 'string' &&
    item.id !== '' &&
    typeof item.name === 'string' &&
    typeof item.description === 'string' &&
    typeof item.imageUrl === 'string' &&
    typeof item.price === 'string' &&
    Array.isArray(item.keywords) &&
    item.keywords.every((keyword) => typeof keyword === 'string') &&
    typeof item.isInStock === 'boolean'
  );
}

/** Checks a backend response before it is shown. */
export function isProductSearchResponseDto(
  value: unknown,
): value is ProductSearchResponseDto {
  if (value === null || typeof value !== 'object') {
    return false;
  }
  const body = value as Record<string, unknown>;
  return (
    typeof body.searchTerm === 'string' &&
    Array.isArray(body.products) &&
    body.products.every(isProductSearchItemDto) &&
    typeof body.isClosestMatch === 'boolean'
  );
}
