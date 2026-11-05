import type { BasketResponseDto } from '../dtos/basketDto';
import type { ProductSearchResponseDto } from '../dtos/productSearchDto';
import {
  buildFilterPanel,
  type FilterPanel,
  type FilterQuery,
  readFilterQuery,
} from '../util/productFilters';
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
  /** The Filter and sort panel, or null when there is nothing to filter. */
  filterPanel: FilterPanel | null;
}

export interface SearchPageInput {
  searchTerm: string;
  /** Filters and sorting from the page's query string. */
  filters?: FilterQuery;
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
  activeFilters: number,
): string {
  if (errorMessage) return '';
  if (searchTerm === '') return 'Enter a product name or keyword to search.';
  const count = result?.products.length ?? 0;
  const total = result?.facets?.total ?? count;
  if (count === 0 && total > 0) {
    return `No products match your filters for "${searchTerm}". Remove a filter or choose Clear all.`;
  }
  if (count === 0) {
    return `No products found for "${searchTerm}". Try a different name or keyword.`;
  }
  if (activeFilters > 0) {
    return `Showing ${count} of ${total} ${plural(total, 'product', 'products')} found for "${searchTerm}".`;
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
  filters = readFilterQuery({}),
  result,
  errorMessage,
  basket,
  now,
}: SearchPageInput): SearchPage {
  const filterPanel =
    result?.facets && result.facets.total > 0
      ? buildFilterPanel({
          action: '/search',
          searchTerm,
          query: filters,
          facets: result.facets,
        })
      : null;
  return {
    searchTerm,
    statusMessage: statusMessageFor(
      searchTerm,
      result,
      errorMessage,
      filterPanel?.activeCount ?? 0,
    ),
    errorMessage,
    products: (result?.products ?? []).map(toProductView),
    basketSummary: toBasketSummary(basket),
    addToBasketUrl: '/basket/items',
    currentYear: now.getFullYear(),
    filterPanel,
  };
}
