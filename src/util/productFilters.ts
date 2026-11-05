/*
 * The "Filter and sort" panel shared by the search page and the product
 * catalogue. Filters are plain GET parameters, so the panel works without
 * JavaScript and every filtered page has a shareable URL. The backend does the
 * filtering and sorting; this module reads the query, builds the backend
 * request and turns the backend's facets into the panel's page model.
 */

import { currentPreferences } from '../i18n/context';
import { intlLocale } from '../i18n/locales';
import {
  currencySymbol,
  formatPrice,
  isConvertedCurrency,
  toPounds,
} from '../i18n/money';
import { type MessageKey, t, tCategory } from '../i18n/runtime';

export const SORT_OPTIONS = [
  { value: 'recommended' },
  { value: 'price-asc' },
  { value: 'price-desc' },
  { value: 'newest' },
  { value: 'oldest' },
  { value: 'most-bought' },
  { value: 'name-asc' },
  { value: 'name-desc' },
] as const;

export type SortValue = (typeof SORT_OPTIONS)[number]['value'];

function sortLabel(value: SortValue): string {
  return t(`filters.sort.${value}` as MessageKey);
}

/** Quick price ranges. The custom min/max boxes take priority over these. */
export const PRICE_BANDS = [
  { value: 'under-10', min: null, max: '9.99', limit: 10 },
  { value: '10-25', min: '10', max: '24.99', limit: 25 },
  { value: '25-50', min: '25', max: '49.99', limit: 50 },
  { value: '50-plus', min: '50', max: null, limit: 50 },
] as const;

/** A whole-pound band limit, shown in the visitor's currency. */
function bandAmount(pounds: number): string {
  return formatPrice(pounds * 100).replace(/[.,]00(?=\D*$)/, '');
}

function bandLabel(band: (typeof PRICE_BANDS)[number]): string {
  switch (band.value) {
    case 'under-10':
      return t('filters.under', { max: bandAmount(10) });
    case '10-25':
      return t('filters.between', { min: bandAmount(10), max: bandAmount(25) });
    case '25-50':
      return t('filters.between', { min: bandAmount(25), max: bandAmount(50) });
    default:
      return t('filters.andOver', { min: bandAmount(50) });
  }
}

type StockValue = 'in' | 'out';
const stockLabel = (stock: StockValue) =>
  t(stock === 'in' ? 'filters.inStock' : 'filters.outOfStock');

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
  // Custom amounts are typed in the visitor's currency; bands are in pounds.
  const inPounds = (amount: string) =>
    hasCustomPrice(query) && isConvertedCurrency()
      ? toPounds(Number(amount)).toFixed(2)
      : amount;
  if (min) params.set('minPrice', inPounds(min));
  if (max) params.set('maxPrice', inPounds(max));
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

/** A typed amount, shown in the visitor's currency without converting it. */
function formatAmount(amount: string): string {
  const { currency, locale } = currentPreferences();
  return new Intl.NumberFormat(intlLocale(locale), {
    style: 'currency',
    currency,
    currencyDisplay: 'narrowSymbol',
    minimumFractionDigits: amount.includes('.') ? 2 : 0,
  }).format(Number(amount));
}

function priceLabel(query: FilterQuery): string | null {
  if (!hasCustomPrice(query)) {
    const band = PRICE_BANDS.find((option) => option.value === query.priceBand);
    return band ? bandLabel(band) : null;
  }
  if (query.minPrice && query.maxPrice) {
    return t('filters.between', {
      min: formatAmount(query.minPrice),
      max: formatAmount(query.maxPrice),
    });
  }
  return query.minPrice
    ? t('filters.from', { min: formatAmount(query.minPrice) })
    : t('filters.upTo', { max: formatAmount(query.maxPrice) });
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
  categoryOptions: {
    value: string;
    label: string;
    count: number;
    isChecked: boolean;
  }[];
  priceBands: { value: string; label: string; isChecked: boolean }[];
  isAnyPriceChecked: boolean;
  minPrice: string;
  maxPrice: string;
  /** Short descriptions of each section's choice, shown when it is closed. */
  stockSummary: string;
  categorySummary: string;
  priceSummary: string;
  /** The symbol shown on the custom price boxes, such as "£" or "€". */
  currencySymbol: string;
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
      label: stockLabel(stock),
      removeUrl: without({
        stock: query.stock.filter((value) => value !== stock),
      }),
    })),
    ...query.categories.map((category) => ({
      label: tCategory(category),
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
      value: option.value,
      label: sortLabel(option.value),
      isSelected: option.value === query.sort,
    })),
    stockOptions: (['in', 'out'] as const).map((stock) => ({
      value: stock,
      label: stockLabel(stock),
      count: facets.stock[stock],
      isChecked: query.stock.includes(stock),
    })),
    categoryOptions: [...categories]
      .map(([value, count]) => ({ value, label: tCategory(value), count }))
      .sort((a, b) =>
        a.label.localeCompare(b.label, intlLocale(currentPreferences().locale)),
      )
      .map(({ value, label, count }) => ({
        value,
        label,
        count,
        isChecked: query.categories.includes(value),
      })),
    priceBands: PRICE_BANDS.map((band) => ({
      value: band.value,
      label: bandLabel(band),
      isChecked: band.value === bandChecked,
    })),
    isAnyPriceChecked: bandChecked === '',
    minPrice: query.minPrice,
    maxPrice: query.maxPrice,
    stockSummary:
      query.stock.length === 1
        ? stockLabel(query.stock[0] as StockValue)
        : t('filters.any'),
    categorySummary:
      query.categories.length === 0
        ? t('filters.all')
        : query.categories.length === 1
          ? tCategory(query.categories[0] as string)
          : t('filters.selected', { count: query.categories.length }),
    priceSummary: price ?? t('filters.anyPrice'),
    currencySymbol: currencySymbol(),
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
    sortLabel: sortLabel(query.sort),
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
