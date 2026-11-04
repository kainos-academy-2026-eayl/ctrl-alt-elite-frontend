export const STOCK_STATUSES = [
  'IN_STOCK',
  'LOW_STOCK',
  'OUT_OF_STOCK',
] as const;
export type StockStatus = (typeof STOCK_STATUSES)[number];

export const STOCK_STATUS_LABELS: Readonly<Record<StockStatus, string>> = {
  IN_STOCK: 'In stock',
  LOW_STOCK: 'Low stock',
  OUT_OF_STOCK: 'Out of stock',
};

export const STOCK_STATUS_OPTIONS = STOCK_STATUSES.map((value) => ({
  value,
  label: STOCK_STATUS_LABELS[value],
}));

export interface StockItem {
  id: string;
  name: string;
  category: string;
  stock: number;
  lowStockThreshold: number;
  outOfStock: boolean;
  lowStock: boolean;
  status: StockStatus;
}

export interface StockSummary {
  totalProducts: number;
  inStock: number;
  lowStock: number;
  outOfStock: number;
  totalUnits: number;
}

export interface StockDashboard {
  summary: StockSummary;
  lowStockProducts: StockItem[];
}

export const MAX_STOCK = 1_000_000;
export const STOCK_RANGE_MESSAGE = 'Enter a whole number from 0 to 1,000,000.';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isCount(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function isStockStatus(value: unknown): value is StockStatus {
  return STOCK_STATUSES.some((status) => status === value);
}

// Returns null when the value is not a well-formed item, so a malformed
// response is reported as an error instead of rendering half a row.
export function parseStockItem(value: unknown): StockItem | null {
  if (!isRecord(value)) return null;
  const { id, name, category, stock, lowStockThreshold, outOfStock } = value;
  const { lowStock, status } = value;
  if (
    (typeof id !== 'string' && typeof id !== 'number') ||
    typeof name !== 'string' ||
    typeof category !== 'string' ||
    !isCount(stock) ||
    !isCount(lowStockThreshold) ||
    typeof outOfStock !== 'boolean' ||
    typeof lowStock !== 'boolean' ||
    !isStockStatus(status)
  ) {
    return null;
  }
  return {
    id: String(id),
    name,
    category,
    stock,
    lowStockThreshold,
    outOfStock,
    lowStock,
    status,
  };
}

export function parseStockItems(value: unknown): StockItem[] | null {
  if (!Array.isArray(value)) return null;
  const items = value.map(parseStockItem);
  return items.every((item) => item !== null) ? items : null;
}

export function parseStockSummary(value: unknown): StockSummary | null {
  if (!isRecord(value)) return null;
  const { totalProducts, inStock, lowStock, outOfStock, totalUnits } = value;
  if (
    !isCount(totalProducts) ||
    !isCount(inStock) ||
    !isCount(lowStock) ||
    !isCount(outOfStock) ||
    !isCount(totalUnits)
  ) {
    return null;
  }
  return { totalProducts, inStock, lowStock, outOfStock, totalUnits };
}

export interface StockFormValues {
  stock: string;
  lowStockThreshold: string;
}

export interface StockFieldErrors {
  stock?: string;
  lowStockThreshold?: string;
}

export interface StockUpdate {
  stock: number;
  lowStockThreshold?: number;
}

export type StockValidation =
  | { ok: true; value: StockUpdate }
  | { ok: false; errors: StockFieldErrors };

function parseWholeNumber(text: string): number | null {
  if (!/^\d+$/.test(text)) return null;
  const value = Number(text);
  return value <= MAX_STOCK ? value : null;
}

// The threshold is optional: leaving it blank keeps the current one.
export function validateStockForm(form: StockFormValues): StockValidation {
  const errors: StockFieldErrors = {};
  const stock = parseWholeNumber(form.stock.trim());
  if (stock === null) errors.stock = STOCK_RANGE_MESSAGE;

  const thresholdText = form.lowStockThreshold.trim();
  const threshold = thresholdText ? parseWholeNumber(thresholdText) : undefined;
  if (threshold === null) errors.lowStockThreshold = STOCK_RANGE_MESSAGE;

  if (stock === null || threshold === null) return { ok: false, errors };
  return {
    ok: true,
    value:
      threshold === undefined
        ? { stock }
        : { stock, lowStockThreshold: threshold },
  };
}

export interface StockQuery {
  search: string;
  status: StockStatus | '';
  lowStockOnly: boolean;
}

export function readStockQuery(params: URLSearchParams): StockQuery {
  const status = params.get('status') ?? '';
  return {
    search: (params.get('q') ?? '').trim().slice(0, 200),
    status: isStockStatus(status) ? status : '',
    lowStockOnly: params.get('low') === '1',
  };
}

export function stockQueryParams(query: StockQuery): URLSearchParams {
  const params = new URLSearchParams();
  if (query.search) params.set('q', query.search);
  if (query.status) params.set('status', query.status);
  if (query.lowStockOnly) params.set('low', '1');
  return params;
}

export function hasStockFilters(query: StockQuery): boolean {
  return Boolean(query.search || query.status || query.lowStockOnly);
}

export function filterStock(
  items: readonly StockItem[],
  query: StockQuery,
): StockItem[] {
  const search = query.search.toLowerCase();
  return items.filter(
    (item) =>
      (!search || item.name.toLowerCase().includes(search)) &&
      (!query.status || item.status === query.status) &&
      (!query.lowStockOnly || item.lowStock),
  );
}
