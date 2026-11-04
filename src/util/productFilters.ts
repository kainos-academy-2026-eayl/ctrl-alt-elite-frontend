/*
 * The "Filter and sort" panel shared by the search page and the product
 * catalogue. Filters are plain GET parameters, so the panel works without
 * JavaScript and every filtered page has a shareable URL. The backend does the
 * filtering and sorting; this module reads the query, builds the backend
 * request and turns the backend's facets into the panel's page model.
 */

export const SORT_OPTIONS = [
  { value: 'recommended', label: 'Recommended' },
  { value: 'price-asc', label: 'Price: low to high' },
  { value: 'price-desc', label: 'Price: high to low' },
  { value: 'newest', label: 'Newest first' },
  { value: 'oldest', label: 'Oldest first' },
  { value: 'most-bought', label: 'Most bought' },
  { value: 'name-asc', label: 'Name: A to Z' },
  { value: 'name-desc', label: 'Name: Z to A' },
] as const;

export type SortValue = (typeof SORT_OPTIONS)[number]['value'];

/** Quick price ranges. The custom min/max boxes take priority over these. */
export const PRICE_BANDS = [
  { value: 'under-10', label: 'Under £10', min: null, max: '9.99' },
  { value: '10-25', label: '£10 to £25', min: '10', max: '24.99' },
  { value: '25-50', label: '£25 to £50', min: '25', max: '49.99' },
  { value: '50-plus', label: '£50 and over', min: '50', max: null },
] as const;

const STOCK_LABELS = { in: 'In stock', out: 'Out of stock' } as const;
type StockValue = keyof typeof STOCK_LABELS;

const MAX_CATEGORIES = 20;
const MAX_CATEGORY_LENGTH = 100;
const PRICE = /^\d{1,9}(\.\d{1,2})?$/;

/** What the customer asked for, read from the page's query string. */
export interface FilterQuery {
  stock: StockValue[];
  categories: string[];
  /** Custom price boxes, as typed (pounds), or '' when empty or invalid. */
  minPrice: string;
  maxPrice: string;
  priceBand: string;
  sort: SortValue;
}

/** The backend's description of the matched products (see its README). */
export interface ProductFacetsDto {
  total: number;
  categories: { name: string; count: number }[];
  stock: { in: number; out: number };
  priceRange: { min: string; max: string } | null;
}

function values(raw: unknown): string[] {
  const list = Array.isArray(raw) ? raw : [raw];
  return list.filter((value): value is string => typeof value === 'string');
}

function readPrice(raw: unknown): string {
  const value = (values(raw)[0] ?? '').trim().replace(/^£/, '');
  return PRICE.test(value) ? value : '';
}

export function readFilterQuery(query: Record<string, unknown>): FilterQuery {
  const sort = values(query.sort)[0] ?? '';
  const band = values(query.price)[0] ?? '';
  return {
    stock: (['in', 'out'] as const).filter((option) =>
      values(query.stock).includes(option),
    ),
    categories: [
      ...new Set(
        values(query.category)
          .map((category) => category.trim())
          .filter(
            (category) =>
              category !== '' && category.length <= MAX_CATEGORY_LENGTH,
          ),
      ),
    ].slice(0, MAX_CATEGORIES),
    minPrice: readPrice(query.minPrice),
    maxPrice: readPrice(query.maxPrice),
    priceBand: PRICE_BANDS.some((option) => option.value === band) ? band : '',
    sort: SORT_OPTIONS.some((option) => option.value === sort)
      ? (sort as SortValue)
      : 'recommended',
  };
}

function hasCustomPrice(query: FilterQuery): boolean {
  return query.minPrice !== '' || query.maxPrice !== '';
}

/** The price range to filter by: the custom boxes, else the chosen band. */
function priceRange(query: FilterQuery): { min: string; max: string } {
  if (hasCustomPrice(query)) {
    return { min: query.minPrice, max: query.maxPrice };
  }
  const band = PRICE_BANDS.find((option) => option.value === query.priceBand);
  return { min: band?.min ?? '', max: band?.max ?? '' };
}

/** Query parameters for the backend's GET /api/products(/search). */
export function toBackendParams(query: FilterQuery): URLSearchParams {
  const params = new URLSearchParams();
  for (const stock of query.stock) params.append('stock', stock);
  for (const category of query.categories) params.append('category', category);
  const { min, max } = priceRange(query);
  if (min) params.set('minPrice', min);
  if (max) params.set('maxPrice', max);
  if (query.sort !== 'recommended') params.set('sort', query.sort);
  return params;
}

/** A page URL with the given filters; defaults are left out to keep it short. */
function pageUrl(
  action: string,
  searchTerm: string | null,
  query: FilterQuery,
) {
  const params = new URLSearchParams();
  if (searchTerm !== null) params.set('q', searchTerm);
  for (const stock of query.stock) params.append('stock', stock);
  for (const category of query.categories) params.append('category', category);
  if (query.minPrice) params.set('minPrice', query.minPrice);
  if (query.maxPrice) params.set('maxPrice', query.maxPrice);
  if (!hasCustomPrice(query) && query.priceBand) {
    params.set('price', query.priceBand);
  }
  if (query.sort !== 'recommended') params.set('sort', query.sort);
  const search = params.toString();
  return search ? `${action}?${search}` : action;
}

function formatPounds(pounds: string): string {
  return new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: 'GBP',
    minimumFractionDigits: pounds.includes('.') ? 2 : 0,
  }).format(Number(pounds));
}

function priceLabel(query: FilterQuery): string | null {
  if (!hasCustomPrice(query)) {
    return (
      PRICE_BANDS.find((option) => option.value === query.priceBand)?.label ??
      null
    );
  }
  if (query.minPrice && query.maxPrice) {
    return `${formatPounds(query.minPrice)} to ${formatPounds(query.maxPrice)}`;
  }
  return query.minPrice
    ? `From ${formatPounds(query.minPrice)}`
    : `Up to ${formatPounds(query.maxPrice)}`;
}

export interface FilterChipView {
  label: string;
  removeUrl: string;
}

export interface FilterPanel {
  action: string;
  /** The search term to keep in the form, or null on the catalogue page. */
  searchTerm: string | null;
  sortOptions: { value: string; label: string; isSelected: boolean }[];
  stockOptions: {
    value: string;
    label: string;
    count: number;
    isChecked: boolean;
  }[];
  categoryOptions: { value: string; count: number; isChecked: boolean }[];
  priceBands: { value: string; label: string; isChecked: boolean }[];
  isAnyPriceChecked: boolean;
  minPrice: string;
  maxPrice: string;
  /** Short descriptions of each section's choice, shown when it is closed. */
  stockSummary: string;
  categorySummary: string;
  priceSummary: string;
  /** Number of active filters (sorting is not a filter). */
  activeCount: number;
  chips: FilterChipView[];
  clearUrl: string;
  sortLabel: string;
}

export function buildFilterPanel({
  action,
  searchTerm,
  query,
  facets,
}: {
  action: string;
  searchTerm: string | null;
  query: FilterQuery;
  facets: ProductFacetsDto;
}): FilterPanel {
  const without = (change: Partial<FilterQuery>) =>
    pageUrl(action, searchTerm, { ...query, ...change });

  const chips: FilterChipView[] = [
    ...query.stock.map((stock) => ({
      label: STOCK_LABELS[stock],
      removeUrl: without({
        stock: query.stock.filter((value) => value !== stock),
      }),
    })),
    ...query.categories.map((category) => ({
      label: category,
      removeUrl: without({
        categories: query.categories.filter((value) => value !== category),
      }),
    })),
  ];
  const price = priceLabel(query);
  if (price) {
    chips.push({
      label: price,
      removeUrl: without({ minPrice: '', maxPrice: '', priceBand: '' }),
    });
  }

  // Selected categories stay listed even if no current match is in them.
  const categories = new Map(
    facets.categories.map(({ name, count }) => [name, count]),
  );
  for (const category of query.categories) {
    if (!categories.has(category)) categories.set(category, 0);
  }

  const bandChecked = hasCustomPrice(query) ? '' : query.priceBand;
  return {
    action,
    searchTerm,
    sortOptions: SORT_OPTIONS.map((option) => ({
      ...option,
      isSelected: option.value === query.sort,
    })),
    stockOptions: (['in', 'out'] as const).map((stock) => ({
      value: stock,
      label: STOCK_LABELS[stock],
      count: facets.stock[stock],
      isChecked: query.stock.includes(stock),
    })),
    categoryOptions: [...categories]
      .sort(([a], [b]) => a.localeCompare(b, 'en-GB'))
      .map(([value, count]) => ({
        value,
        count,
        isChecked: query.categories.includes(value),
      })),
    priceBands: PRICE_BANDS.map((band) => ({
      value: band.value,
      label: band.label,
      isChecked: band.value === bandChecked,
    })),
    isAnyPriceChecked: bandChecked === '',
    minPrice: query.minPrice,
    maxPrice: query.maxPrice,
    stockSummary:
      query.stock.length === 1
        ? STOCK_LABELS[query.stock[0] as StockValue]
        : 'Any',
    categorySummary:
      query.categories.length === 0
        ? 'All'
        : query.categories.length === 1
          ? (query.categories[0] as string)
          : `${query.categories.length} selected`,
    priceSummary: price ?? 'Any price',
    activeCount: chips.length,
    chips,
    clearUrl: pageUrl(action, searchTerm, {
      stock: [],
      categories: [],
      minPrice: '',
      maxPrice: '',
      priceBand: '',
      sort: 'recommended',
    }),
    sortLabel:
      SORT_OPTIONS.find((option) => option.value === query.sort)?.label ??
      'Recommended',
  };
}

export function isProductFacetsDto(value: unknown): value is ProductFacetsDto {
  if (value === null || typeof value !== 'object') return false;
  const facets = value as Record<string, unknown>;
  const stock = facets.stock as Record<string, unknown> | null;
  const range = facets.priceRange as Record<string, unknown> | null;
  return (
    Number.isSafeInteger(facets.total) &&
    Array.isArray(facets.categories) &&
    facets.categories.every(
      (category: unknown) =>
        typeof category === 'object' &&
        category !== null &&
        typeof (category as Record<string, unknown>).name === 'string' &&
        Number.isSafeInteger((category as Record<string, unknown>).count),
    ) &&
    typeof stock === 'object' &&
    stock !== null &&
    Number.isSafeInteger(stock.in) &&
    Number.isSafeInteger(stock.out) &&
    (range === null ||
      (typeof range === 'object' &&
        typeof range.min === 'string' &&
        typeof range.max === 'string'))
  );
}
