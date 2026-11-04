import type { BasketResponseDto } from '../dtos/basketDto';
import type { ProductSearchResponseDto } from '../dtos/productSearchDto';
import {
  type BasketSummary,
  formatPrice,
  toBasketSummary,
} from './basket.page';

/*
 * Page model for search.njk: the search box, the results message, the product
 * cards with their "Add to Basket" forms, and the header basket count.
 */

export interface SearchProductView {
  id: string;
  name: string;
  description: string;
  imageUrl: string;
  price: string;
  isInStock: boolean;
}

export interface SearchPage {
  searchTerm: string;
  statusMessage: string;
  errorMessage: string;
  products: SearchProductView[];
  basketSummary: BasketSummary;
  addToBasketUrl: string;
  currentYear: number;
}

export interface SearchPageInput {
  searchTerm: string;
  /** The backend result, or null when no search was made or it failed. */
  result: ProductSearchResponseDto | null;
  errorMessage: string;
  basket: BasketResponseDto | null;
  now: Date;
}

function plural(count: number, singular: string, pluralForm: string): string {
  return count === 1 ? singular : pluralForm;
}

function statusMessageFor(
  searchTerm: string,
  result: ProductSearchResponseDto | null,
  errorMessage: string,
): string {
  if (errorMessage) return '';
  if (searchTerm === '') return 'Enter a product name or keyword to search.';
  const count = result?.products.length ?? 0;
  if (count === 0) {
    return `No products found for "${searchTerm}". Try a different name or keyword.`;
  }
  if (result?.isClosestMatch) {
    return `No exact matches for "${searchTerm}". Showing the closest ${plural(count, 'match', 'matches')}.`;
  }
  return `${count} ${plural(count, 'product', 'products')} found for "${searchTerm}".`;
}

function toProductView(
  product: ProductSearchResponseDto['products'][number],
): SearchProductView {
  return {
    id: product.id,
    name: product.name,
    description: product.description,
    imageUrl: product.imageUrl,
    price: formatPrice(Math.round(Number(product.price) * 100)),
    isInStock: product.isInStock,
  };
}

export function buildSearchPage({
  searchTerm,
  result,
  errorMessage,
  basket,
  now,
}: SearchPageInput): SearchPage {
  return {
    searchTerm,
    statusMessage: statusMessageFor(searchTerm, result, errorMessage),
    errorMessage,
    products: (result?.products ?? []).map(toProductView),
    basketSummary: toBasketSummary(basket),
    addToBasketUrl: '/basket/items',
    currentYear: now.getFullYear(),
  };
}
