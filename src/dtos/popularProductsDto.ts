/*
 * Response shape of the backend's GET /api/products/popular, which feeds the
 * homepage conveyor: in-stock best sellers, topped up with the newest products.
 */

export interface PopularProductDto {
  id: string;
  name: string;
  /** Price in pounds as a 2 decimal place string, e.g. "24.99". */
  price: string;
  /** Usually a data: URL with the product image. */
  imageUrl: string;
}

export interface PopularProductsResponseDto {
  products: PopularProductDto[];
}

function isPopularProductDto(value: unknown): value is PopularProductDto {
  if (value === null || typeof value !== 'object') {
    return false;
  }
  const product = value as Record<string, unknown>;
  return (
    typeof product.id === 'string' &&
    product.id !== '' &&
    typeof product.name === 'string' &&
    typeof product.price === 'string' &&
    typeof product.imageUrl === 'string'
  );
}

/** Checks a backend response before it is shown. */
export function isPopularProductsResponseDto(
  value: unknown,
): value is PopularProductsResponseDto {
  if (value === null || typeof value !== 'object') {
    return false;
  }
  const body = value as Record<string, unknown>;
  return (
    Array.isArray(body.products) && body.products.every(isPopularProductDto)
  );
}
