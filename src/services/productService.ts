import {
  isPopularProductsResponseDto,
  type PopularProductDto,
} from '../dtos/popularProductsDto';
import {
  isProductSearchResponseDto,
  type ProductSearchResponseDto,
} from '../dtos/productSearchDto';

const REQUEST_TIMEOUT_MS = 5000;

/**
 * Talks to the backend product APIs (search and popular products). It knows
 * nothing about the browser's request or response; the controllers decide
 * what to show.
 */
export class ProductService {
  constructor(
    private readonly backendOrigin: string,
    private readonly fetchImpl: typeof fetch = (input, init) =>
      fetch(input, init),
  ) {}

  /** Throws if the backend fails, is unreachable or sends an unexpected body. */
  async search(searchTerm: string): Promise<ProductSearchResponseDto> {
    const url = new URL('/api/products/search', this.backendOrigin);
    url.searchParams.set('q', searchTerm);
    const body = await this.getJson(url, 'Product search');
    if (!isProductSearchResponseDto(body)) {
      throw new Error('Product search returned an unexpected response');
    }
    return body;
  }

  /** The best sellers for the homepage conveyor. Throws like search(). */
  async getPopular(limit: number): Promise<PopularProductDto[]> {
    const url = new URL('/api/products/popular', this.backendOrigin);
    url.searchParams.set('limit', String(limit));
    const body = await this.getJson(url, 'Popular products');
    if (!isPopularProductsResponseDto(body)) {
      throw new Error('Popular products returned an unexpected response');
    }
    return body.products;
  }

  private async getJson(url: URL, label: string): Promise<unknown> {
    const response = await this.fetchImpl(url, {
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!response.ok) {
      await response.body?.cancel();
      throw new Error(`${label} failed with status ${response.status}`);
    }
    return response.json().catch(() => null);
  }
}
