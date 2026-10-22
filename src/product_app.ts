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
};

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
      const products = records.map((product) => ({
        ...product,
        priceLabel: new Intl.NumberFormat('en-GB', {
          style: 'currency',
          currency: 'GBP',
        }).format(Number(product.price)),
        searchText: `${product.name} ${product.category}`.toLowerCase(),
      }));

      res.render('product.njk', { products });
    } catch (error) {
      console.error('Unable to load products from the backend:', error);
      res.status(502).render('product.njk', {
        products: [],
        productError: 'Products are temporarily unavailable.',
      });
    }
  });
}
