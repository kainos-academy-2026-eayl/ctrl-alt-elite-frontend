import {
  categoriesOf,
  formatPrice,
  INVENTORY_PATH,
  MAX_CATEGORY_LENGTH,
  MAX_DESCRIPTION_LENGTH,
  MAX_IMAGE_LABEL,
  MAX_NAME_LENGTH,
  type Product,
  type ProductForm,
  STOCK_LABELS,
  stockLevel,
} from './adminInventory';
import { escapeHtml } from './customerViews';

function productHref(product: Product): string {
  return escapeHtml(`${INVENTORY_PATH}/${encodeURIComponent(product.id)}`);
}

function renderThumbnail(product: Product): string {
  return product.image
    ? `<img class="inventory-thumb" src="${escapeHtml(product.image)}" alt="" loading="lazy" />`
    : '<span class="inventory-thumb inventory-thumb-empty" aria-hidden="true"></span>';
}

export function renderStockBadge(stock: number): string {
  const level = stockLevel(stock);
  return `<span class="inventory-stock is-${level}">${escapeHtml(String(stock))} &middot; ${STOCK_LABELS[level]}</span>`;
}

export function renderInventoryCount(matching: number, total: number): string {
  const noun = total === 1 ? 'product' : 'products';
  return matching === total
    ? `Total Products: ${total}`
    : `${matching} of ${total} ${noun} shown`;
}

export function renderInventoryEmpty(hasFilters: boolean): string {
  const message = hasFilters
    ? `<p class="admin-empty">No products match your search or filter.</p><p><a href="${INVENTORY_PATH}">Clear search and filter</a></p>`
    : `<p class="admin-empty">There are no products yet.</p><p><a class="admin-action customer-state-action" href="${INVENTORY_PATH}/new">Add your first product</a></p>`;
  return `<section class="admin-card customer-state" aria-labelledby="inventory-empty-heading"><h2 id="inventory-empty-heading">No products found</h2>${message}</section>`;
}

export function renderInventoryError(retryUrl: string): string {
  return `<section class="admin-card customer-state" role="alert" aria-labelledby="inventory-error-heading"><h2 id="inventory-error-heading">Unable to load products</h2><p class="admin-empty">Something went wrong while loading the inventory. Please try again.</p><p><a class="admin-action customer-state-action" href="${escapeHtml(retryUrl)}">Try again</a></p></section>`;
}

export function renderInventoryList(products: Product[]): string {
  const rows = products
    .map((product) => {
      const name = escapeHtml(product.name);
      return `<tr><td data-label="Image">${renderThumbnail(product)}</td><td data-label="Name"><a href="${productHref(product)}">${name}</a></td><td data-label="Category">${escapeHtml(product.category)}</td><td data-label="Price">${escapeHtml(formatPrice(product.price))}</td><td data-label="Stock">${renderStockBadge(product.stock)}</td><td data-label="Actions"><div class="inventory-actions"><a class="customer-button customer-button-secondary" href="${productHref(product)}" aria-label="Edit ${name}">Edit</a><button class="customer-button customer-button-danger" type="button" data-delete-product="${escapeHtml(product.id)}" data-product-name="${name}" aria-label="Delete ${name}">Delete</button></div></td></tr>`;
    })
    .join('');
  return `<div class="admin-card customer-table-card"><table class="customer-table"><caption class="visually-hidden">Products</caption><thead><tr><th scope="col">Image</th><th scope="col">Name</th><th scope="col">Category</th><th scope="col">Price</th><th scope="col">Stock</th><th scope="col">Actions</th></tr></thead><tbody>${rows}</tbody></table></div>`;
}

export function renderCategoryOptions(
  products: Product[],
  selected: string,
): string {
  const categories = categoriesOf(products);
  if (selected && !categories.includes(selected)) categories.push(selected);
  return [
    '<option value="">All categories</option>',
    ...categories.map(
      (category) =>
        `<option value="${escapeHtml(category)}"${category === selected ? ' selected' : ''}>${escapeHtml(category)}</option>`,
    ),
  ].join('');
}

function field(id: string, label: string, control: string, hint = ''): string {
  const hintHtml = hint
    ? `<p class="admin-hint" id="${id}-hint">${escapeHtml(hint)}</p>`
    : '';
  return `<div class="admin-field"><label for="${id}">${escapeHtml(label)}</label>${control}${hintHtml}<p class="admin-error" id="${id}-error" role="alert" hidden data-field-error="${id}"></p></div>`;
}

export function renderProductForm(
  values: ProductForm,
  existing: Product | undefined,
  categories: string[],
): string {
  const input = (id: string, value: string, extra: string): string =>
    `<input id="${id}" name="${id}" value="${escapeHtml(value)}" aria-describedby="${id}-error" ${extra} />`;
  const datalist = `<datalist id="category-options">${categories
    .map((category) => `<option value="${escapeHtml(category)}"></option>`)
    .join('')}</datalist>`;
  const preview = existing?.image
    ? `<img class="inventory-preview" src="${escapeHtml(existing.image)}" alt="Current product image" data-image-preview />`
    : '<img class="inventory-preview" alt="" data-image-preview hidden />';
  const imageHint = existing
    ? `Leave empty to keep the current image. PNG, JPEG, WebP or SVG, up to ${MAX_IMAGE_LABEL}.`
    : `PNG, JPEG, WebP or SVG, up to ${MAX_IMAGE_LABEL}.`;
  return `<form class="admin-form inventory-form" novalidate data-product-form>
${field('name', 'Name', input('name', values.name, `type="text" maxlength="${MAX_NAME_LENGTH}" autocomplete="off" required`))}
${field('category', 'Category', `${input('category', values.category, `type="text" maxlength="${MAX_CATEGORY_LENGTH}" list="category-options" autocomplete="off" required`)}${datalist}`)}
${field('price', 'Price (GBP)', input('price', values.price, 'type="text" inputmode="decimal" autocomplete="off" required'))}
${field('stock', 'Stock', input('stock', values.stock, 'type="number" inputmode="numeric" min="0" step="1" required'))}
${field('description', 'Description', `<textarea id="description" name="description" rows="5" maxlength="${MAX_DESCRIPTION_LENGTH}" aria-describedby="description-error">${escapeHtml(values.description)}</textarea>`)}
${field('image', 'Image', `${preview}<input id="image" name="image" type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" aria-describedby="image-hint image-error" ${existing ? '' : 'required'} />`, imageHint)}
<p class="admin-error" role="alert" hidden data-form-error></p>
<p class="admin-success" role="status" hidden data-form-success></p>
<div class="admin-form-actions"><button class="customer-button" type="submit" data-product-save>${existing ? 'Save changes' : 'Add product'}</button><a class="customer-button customer-button-secondary" href="${INVENTORY_PATH}">Cancel</a></div>
</form>`;
}

export function renderDeleteSection(product: Product): string {
  return `<section class="admin-card" aria-labelledby="delete-heading"><h2 id="delete-heading">Delete product</h2><p class="admin-empty">Deleting <strong>${escapeHtml(product.name)}</strong> removes it from the shop and from any customer baskets. This cannot be undone.</p><p class="admin-error" role="alert" hidden data-delete-error></p><button class="customer-button customer-button-danger" type="button" data-delete-product="${escapeHtml(product.id)}" data-product-name="${escapeHtml(product.name)}">Delete product</button></section>`;
}

export function renderInventoryMessage(title: string, message: string): string {
  return `<header class="admin-page-header"><h1>Product</h1></header><section class="admin-card customer-state" role="alert" aria-labelledby="product-message-heading"><h2 id="product-message-heading">${escapeHtml(title)}</h2><p class="admin-empty">${escapeHtml(message)}</p><p><a href="${INVENTORY_PATH}">Back to inventory</a></p></section>`;
}
