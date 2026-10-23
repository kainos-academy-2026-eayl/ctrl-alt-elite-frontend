import { fileURLToPath } from 'node:url';
import express, { type Express, type Request, type Response } from 'express';
import nunjucks from 'nunjucks';

const PRODUCT_CATALOG_DIRECTORY = fileURLToPath(
  new URL('../product_catalog/', import.meta.url),
);
const PRODUCT_TEMPLATE_DIRECTORY = fileURLToPath(
  new URL('../src/views/', import.meta.url),
);

type BackendProduct = {
  id: string | number;
  name: string;
  category: string;
  price: number | string;
  image: string;
  description: string;
  stock?: unknown;
};

function getStock(value: unknown): number | null {
  if (
    typeof value !== 'number' &&
    (typeof value !== 'string' || value.trim() === '')
  ) {
    return null;
  }

  const stock = Number(value);
  return Number.isSafeInteger(stock) && stock >= 0 ? stock : null;
}

function getProducts(payload: unknown): BackendProduct[] {
  if (Array.isArray(payload)) return payload as BackendProduct[];

  if (
    typeof payload === 'object' &&
    payload !== null &&
    'products' in payload &&
    Array.isArray(payload.products)
  ) {
    return payload.products as BackendProduct[];
  }

  throw new Error('The products API returned an unexpected response.');
}

export function registerProductApp(app: Express, backendOrigin: string): void {
  nunjucks.configure(PRODUCT_TEMPLATE_DIRECTORY, {
    autoescape: true,
    express: app,
  });
  app.set('view engine', 'njk');

  app.use(
    '/product-catalog',
    express.static(PRODUCT_CATALOG_DIRECTORY, { index: false }),
  );

  app.get('/products', async (_req: Request, res: Response) => {
    try {
      const response = await fetch(new URL('/api/products', backendOrigin), {
        headers: { accept: 'application/json' },
      });

      if (!response.ok) {
        throw new Error(`Products API returned ${response.status}.`);
      }

      const records = getProducts(await response.json());
      const products = records.map((product) => {
        const stock = getStock(product.stock);
        return {
          ...product,
          stock,
          stockLabel:
            stock === null
              ? 'Stock unavailable'
              : stock === 0
                ? 'Out of stock'
                : `${stock} in stock`,
          available: stock !== null && stock > 0,
          priceLabel: new Intl.NumberFormat('en-GB', {
            style: 'currency',
            currency: 'GBP',
          }).format(Number(product.price)),
        };
      });

      const categories = [
        ...new Set(products.map((product) => product.category)),
      ];
      res.render('product.njk', { products, categories });
    } catch (error) {
      console.error('Unable to load products from the backend:', error);
      res.status(502).render('product.njk', {
        products: [],
        productError: 'Products are temporarily unavailable.',
      });
    }
  });
}
