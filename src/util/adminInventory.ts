import { failureMessage, submitJson } from './apiResponse';
import {
  DEFAULT_TIMEOUT_MS,
  getJson,
  type TicketApiOptions,
} from './supportTickets';

export const PRODUCTS_PATH = '/api/admin/products';
export const INVENTORY_PATH = '/admin/inventory';
export const PRODUCT_ID_PATTERN = /^[A-Za-z0-9-]{1,64}$/;

export const MAX_NAME_LENGTH = 120;
export const MAX_CATEGORY_LENGTH = 60;
export const MAX_DESCRIPTION_LENGTH = 2000;
export const MAX_PRICE = 1_000_000;
export const MAX_STOCK = 1_000_000;
export const MAX_IMAGE_BYTES = 1_000_000;
export const IMAGE_TYPES = [
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/svg+xml',
] as const;
export const LOW_STOCK_LIMIT = 5;
export const MAX_SEARCH_LENGTH = 200;

export interface Product {
  id: string;
  name: string;
  category: string;
  description: string;
  price: number;
  stock: number;
  image: string;
}

export interface ProductForm {
  name: string;
  category: string;
  description: string;
  price: string;
  stock: string;
}

export type ProductField = keyof ProductForm | 'image';
export type ProductFormErrors = Partial<Record<ProductField, string>>;

export interface ProductPayload {
  name: string;
  category: string;
  description: string;
  price: number;
  stock: number;
  image?: string;
}

export interface ProductResult {
  ok: boolean;
  message: string;
  product?: Product;
  unauthorised?: boolean;
}

export interface InventoryQuery {
  search: string;
  category: string;
}

export interface ImageFileInfo {
  type: string;
  size: number;
}

export type StockLevel = 'out' | 'low' | 'in';

const SAVE_ERROR_MESSAGE =
  'Unable to save this product. Please try again later.';
const DELETE_ERROR_MESSAGE =
  'Unable to delete this product. Please try again later.';
const SESSION_EXPIRED_MESSAGE =
  'Your session has expired. Please log in again.';
const IMAGE_SOURCE_PATTERN =
  /^data:image\/(?:png|jpeg|webp|svg\+xml);base64,[A-Za-z0-9+/]+={0,2}$/;

function text(value: unknown): string | undefined {
  return typeof value === 'string' ? value.trim() : undefined;
}

function wholeOrDecimal(value: unknown): number | undefined {
  const number =
    typeof value === 'number'
      ? value
      : typeof value === 'string' && value.trim() !== ''
        ? Number(value)
        : Number.NaN;
  return Number.isFinite(number) ? number : undefined;
}

// Only embedded images or site/https URLs are rendered; anything else is dropped.
export function safeImageSource(value: unknown): string {
  if (typeof value !== 'string') return '';
  const source = value.trim();
  return IMAGE_SOURCE_PATTERN.test(source) ||
    /^https:\/\/[^\s"'<>]+$/.test(source)
    ? source
    : '';
}

export function parseProduct(value: unknown): Product | null {
  if (typeof value !== 'object' || value === null) return null;
  const record = value as Record<string, unknown>;
  const rawId = record.id;
  const id =
    typeof rawId === 'number' ? String(rawId) : (text(rawId) ?? undefined);
  const name = text(record.name);
  const price = wholeOrDecimal(record.price);
  const stock = wholeOrDecimal(record.stock);
  if (
    id === undefined ||
    !PRODUCT_ID_PATTERN.test(id) ||
    !name ||
    price === undefined ||
    stock === undefined
  ) {
    return null;
  }
  return {
    id,
    name,
    category: text(record.category) || 'Uncategorised',
    description: text(record.description) ?? '',
    price,
    stock,
    image: safeImageSource(record.image),
  };
}

// The backend returns either the product itself or { product }.
export function unwrapProduct(body: unknown): unknown {
  return typeof body === 'object' && body !== null && 'product' in body
    ? body.product
    : body;
}

// Any malformed entry fails the whole list rather than silently hiding products.
export function parseProductList(body: unknown): Product[] {
  const list =
    typeof body === 'object' && body !== null && 'products' in body
      ? body.products
      : body;
  if (!Array.isArray(list)) {
    throw new Error('Products response was not in the expected format.');
  }
  return list.map((entry) => {
    const product = parseProduct(entry);
    if (!product) {
      throw new Error('Products response was not in the expected format.');
    }
    return product;
  });
}

export function formatPrice(price: number): string {
  return new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: 'GBP',
  }).format(price);
}

export function stockLevel(stock: number): StockLevel {
  if (stock <= 0) return 'out';
  return stock <= LOW_STOCK_LIMIT ? 'low' : 'in';
}

export const STOCK_LABELS: Record<StockLevel, string> = {
  out: 'Out of stock',
  low: 'Low stock',
  in: 'In stock',
};

export function readInventoryQuery(params: URLSearchParams): InventoryQuery {
  return {
    search: (params.get('q') ?? '').trim().slice(0, MAX_SEARCH_LENGTH),
    category: (params.get('category') ?? '')
      .trim()
      .slice(0, MAX_CATEGORY_LENGTH),
  };
}

export function hasInventoryFilters(query: InventoryQuery): boolean {
  return query.search !== '' || query.category !== '';
}

export function filterProducts(
  products: Product[],
  query: InventoryQuery,
): Product[] {
  const search = query.search.toLowerCase();
  return products.filter(
    (product) =>
      (!query.category || product.category === query.category) &&
      (!search ||
        product.name.toLowerCase().includes(search) ||
        product.category.toLowerCase().includes(search)),
  );
}

export function categoriesOf(products: Product[]): string[] {
  return [...new Set(products.map((product) => product.category))].sort(
    (a, b) => a.localeCompare(b),
  );
}

export function emptyProductForm(): ProductForm {
  return { name: '', category: '', description: '', price: '', stock: '0' };
}

export function formFromProduct(product: Product): ProductForm {
  return {
    name: product.name,
    category: product.category,
    description: product.description,
    price: product.price.toFixed(2),
    stock: String(product.stock),
  };
}

export function validateImageFile(file: ImageFileInfo): string | null {
  if (!(IMAGE_TYPES as readonly string[]).includes(file.type)) {
    return 'Image must be a PNG, JPEG, WebP or SVG file.';
  }
  if (file.size > MAX_IMAGE_BYTES) return 'Image must be 1 MB or smaller.';
  if (file.size === 0) return 'Image file is empty.';
  return null;
}

// An image is only required when creating; on edit, omitting it keeps the current one.
export function validateProductForm(
  form: ProductForm,
  {
    imageRequired,
    image,
  }: { imageRequired: boolean; image: string | undefined },
): ProductFormErrors {
  const errors: ProductFormErrors = {};
  const name = form.name.trim();
  const category = form.category.trim();
  if (!name) errors.name = 'Enter a product name.';
  else if (name.length > MAX_NAME_LENGTH) {
    errors.name = `Name must be ${MAX_NAME_LENGTH} characters or fewer.`;
  }
  if (!category) errors.category = 'Enter a category.';
  else if (category.length > MAX_CATEGORY_LENGTH) {
    errors.category = `Category must be ${MAX_CATEGORY_LENGTH} characters or fewer.`;
  }
  if (form.description.trim().length > MAX_DESCRIPTION_LENGTH) {
    errors.description = `Description must be ${MAX_DESCRIPTION_LENGTH} characters or fewer.`;
  }
  const price = form.price.trim();
  if (!/^\d+(\.\d{1,2})?$/.test(price)) {
    errors.price = 'Enter a price such as 19.99.';
  } else if (Number(price) > MAX_PRICE) {
    errors.price = 'Price must be 1,000,000 or less.';
  }
  const stock = form.stock.trim();
  if (!/^\d+$/.test(stock)) {
    errors.stock = 'Enter the stock as a whole number.';
  } else if (Number(stock) > MAX_STOCK) {
    errors.stock = 'Stock must be 1,000,000 or less.';
  }
  if (imageRequired && !image) errors.image = 'Choose a product image.';
  return errors;
}

// Call only after validateProductForm returned no errors.
export function buildProductPayload(
  form: ProductForm,
  image: string | undefined,
): ProductPayload {
  return {
    name: form.name.trim(),
    category: form.category.trim(),
    description: form.description.trim(),
    price: Number(form.price.trim()),
    stock: Number(form.stock.trim()),
    ...(image ? { image } : {}),
  };
}

export async function listProducts(
  options: TicketApiOptions = {},
): Promise<Product[]> {
  const response = await getJson(PRODUCTS_PATH, options);
  if (!response.ok) {
    throw new Error(`Products request failed with status ${response.status}`);
  }
  return parseProductList(await response.json()).sort((a, b) =>
    a.name.localeCompare(b.name),
  );
}

// Resolves to undefined when the product does not exist.
export async function findProduct(
  id: string,
  options: TicketApiOptions = {},
): Promise<Product | undefined> {
  const response = await getJson(
    `${PRODUCTS_PATH}/${encodeURIComponent(id)}`,
    options,
  );
  if (response.status === 404) {
    await response.body?.cancel();
    return undefined;
  }
  if (!response.ok) {
    throw new Error(`Product request failed with status ${response.status}`);
  }
  const product = parseProduct(unwrapProduct(await response.json()));
  if (!product) {
    throw new Error('Product response was not in the expected format.');
  }
  return product;
}

// Never throws: a failure is returned as a result.
export async function saveProduct(
  id: string | null,
  payload: ProductPayload,
  {
    fetchImpl = (input, init) => fetch(input, init),
    timeoutMs,
  }: TicketApiOptions = {},
): Promise<ProductResult> {
  const result = await submitJson(
    id === null ? PRODUCTS_PATH : `${PRODUCTS_PATH}/${encodeURIComponent(id)}`,
    id === null ? 'POST' : 'PUT',
    payload,
    fetchImpl,
    timeoutMs ?? DEFAULT_TIMEOUT_MS,
  );
  if (result?.ok) {
    const product = parseProduct(unwrapProduct(result.body));
    return {
      ok: true,
      message: result.message ?? 'Product saved.',
      ...(product ? { product } : {}),
    };
  }
  if (result?.status === 401) {
    return { ok: false, message: SESSION_EXPIRED_MESSAGE, unauthorised: true };
  }
  return { ok: false, message: failureMessage(result, SAVE_ERROR_MESSAGE) };
}

// Never throws: a failure is returned as a result.
export async function deleteProduct(
  id: string,
  {
    fetchImpl = (input, init) => fetch(input, init),
    timeoutMs,
  }: TicketApiOptions = {},
): Promise<ProductResult> {
  const result = await submitJson(
    `${PRODUCTS_PATH}/${encodeURIComponent(id)}`,
    'DELETE',
    undefined,
    fetchImpl,
    timeoutMs ?? DEFAULT_TIMEOUT_MS,
  );
  if (result?.ok) {
    return { ok: true, message: result.message ?? 'Product deleted.' };
  }
  if (result?.status === 401) {
    return { ok: false, message: SESSION_EXPIRED_MESSAGE, unauthorised: true };
  }
  return { ok: false, message: failureMessage(result, DELETE_ERROR_MESSAGE) };
}
