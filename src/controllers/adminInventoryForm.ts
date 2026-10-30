import {
  buildProductPayload,
  categoriesOf,
  deleteProduct,
  emptyProductForm,
  findProduct,
  formFromProduct,
  listProducts,
  PRODUCT_ID_PATTERN,
  type Product,
  type ProductField,
  type ProductForm,
  saveProduct,
  validateImageFile,
  validateProductForm,
} from '../util/adminInventory';
import {
  renderDeleteSection,
  renderInventoryMessage,
  renderProductForm,
} from '../util/adminInventoryViews';
import { UnauthorisedError } from '../util/supportTickets';

const container = document.querySelector<HTMLElement>('[data-product-page]');
if (!container) throw new Error('Element not found: [data-product-page]');
const page = container;

const lastSegment =
  window.location.pathname.split('/').filter(Boolean).pop() ?? '';
const isCreate = lastSegment === 'new';

function getElement<T extends Element>(selector: string): T {
  const element = page.querySelector<T>(selector);
  if (!element) throw new Error(`Element not found: ${selector}`);
  return element;
}

function redirectToLogin(): void {
  window.location.assign('/login');
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener('load', () => resolve(String(reader.result)));
    reader.addEventListener('error', () => reject(reader.error));
    reader.readAsDataURL(file);
  });
}

function mountForm(existing: Product | undefined, categories: string[]): void {
  const values: ProductForm = existing
    ? formFromProduct(existing)
    : emptyProductForm();
  const title = existing ? 'Edit product' : 'Add product';
  const heading = `<header class="admin-page-header"><h1>${existing ? 'Edit product' : 'Add product'}</h1></header>`;
  page.innerHTML = `${heading}<div class="customer-manage"><section class="admin-card" aria-label="${title}">${renderProductForm(values, existing, categories)}</section>${existing ? renderDeleteSection(existing) : ''}</div>`;

  const form = getElement<HTMLFormElement>('[data-product-form]');
  const save = getElement<HTMLButtonElement>('[data-product-save]');
  const formError = getElement<HTMLElement>('[data-form-error]');
  const formSuccess = getElement<HTMLElement>('[data-form-success]');
  const imageInput = getElement<HTMLInputElement>('#image');
  const preview = getElement<HTMLImageElement>('[data-image-preview]');
  let imageDataUrl: string | undefined;

  function showFieldErrors(
    errors: Partial<Record<ProductField, string>>,
  ): void {
    for (const element of form.querySelectorAll<HTMLElement>(
      '[data-field-error]',
    )) {
      const key = element.dataset.fieldError as ProductField;
      const message = errors[key];
      element.textContent = message ?? '';
      element.hidden = !message;
      form
        .querySelector(`#${key}`)
        ?.setAttribute('aria-invalid', message ? 'true' : 'false');
    }
  }

  function showBanner(element: HTMLElement, message: string): void {
    formError.hidden = true;
    formSuccess.hidden = true;
    element.textContent = message;
    element.hidden = false;
  }

  function readForm(): ProductForm {
    const data = new FormData(form);
    const read = (key: keyof ProductForm): string =>
      String(data.get(key) ?? '');
    return {
      name: read('name'),
      category: read('category'),
      description: read('description'),
      price: read('price'),
      stock: read('stock'),
    };
  }

  imageInput.addEventListener('change', async () => {
    const file = imageInput.files?.[0];
    imageDataUrl = undefined;
    if (!file) {
      showFieldErrors({});
      return;
    }
    const problem = validateImageFile(file);
    if (problem) {
      showFieldErrors({ image: problem });
      imageInput.value = '';
      return;
    }
    try {
      const dataUrl = await readFileAsDataUrl(file);
      if (imageInput.files?.[0] !== file) return;
      imageDataUrl = dataUrl;
      showFieldErrors({});
      preview.src = imageDataUrl;
      preview.alt = 'Selected product image';
      preview.hidden = false;
    } catch {
      showFieldErrors({ image: 'Unable to read that file. Try another.' });
    }
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    formError.hidden = true;
    formSuccess.hidden = true;
    const current = readForm();
    const errors = validateProductForm(current, {
      imageRequired: !existing,
      image: imageDataUrl,
    });
    showFieldErrors(errors);
    const firstInvalid = Object.keys(errors)[0];
    if (firstInvalid) {
      form.querySelector<HTMLElement>(`#${firstInvalid}`)?.focus();
      return;
    }

    save.disabled = true;
    const result = await saveProduct(
      existing?.id ?? null,
      buildProductPayload(current, imageDataUrl),
    );
    save.disabled = false;

    if (result.ok) {
      if (!existing) {
        window.location.assign('/admin/inventory?notice=created');
        return;
      }
      imageDataUrl = undefined;
      imageInput.value = '';
      const saved = result.product;
      if (saved?.image) {
        preview.src = saved.image;
        preview.alt = 'Current product image';
        preview.hidden = false;
      }
      showBanner(formSuccess, 'Product updated.');
    } else if (result.unauthorised) {
      redirectToLogin();
    } else {
      showBanner(formError, result.message);
    }
  });

  if (existing) {
    const deleteButton = getElement<HTMLButtonElement>('[data-delete-product]');
    const deleteError = getElement<HTMLElement>('[data-delete-error]');
    deleteButton.addEventListener('click', async () => {
      if (
        !window.confirm(`Delete "${existing.name}"? This cannot be undone.`)
      ) {
        return;
      }
      deleteError.hidden = true;
      deleteButton.disabled = true;
      const result = await deleteProduct(existing.id);
      if (result.ok) {
        window.location.assign('/admin/inventory?notice=deleted');
      } else if (result.unauthorised) {
        redirectToLogin();
      } else {
        deleteButton.disabled = false;
        deleteError.textContent = result.message;
        deleteError.hidden = false;
      }
    });
  }
}

async function loadCategories(): Promise<string[]> {
  try {
    return categoriesOf(await listProducts());
  } catch (error) {
    if (error instanceof UnauthorisedError) throw error;
    return [];
  }
}

async function start(): Promise<void> {
  try {
    if (isCreate) {
      mountForm(undefined, await loadCategories());
      return;
    }
    if (!PRODUCT_ID_PATTERN.test(lastSegment)) {
      page.innerHTML = renderInventoryMessage(
        'Product not found',
        'We could not find that product.',
      );
      return;
    }
    const [product, categories] = await Promise.all([
      findProduct(lastSegment),
      loadCategories(),
    ]);
    if (!product) {
      page.innerHTML = renderInventoryMessage(
        'Product not found',
        'We could not find that product. It may have been deleted.',
      );
      return;
    }
    mountForm(product, categories);
  } catch (error) {
    if (error instanceof UnauthorisedError) {
      redirectToLogin();
      return;
    }
    console.error('Unable to load the product:', error);
    page.innerHTML = renderInventoryMessage(
      'Unable to load the product',
      'Something went wrong. Please try again.',
    );
  }
}

void start();
