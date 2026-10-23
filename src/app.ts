import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import express, { type Express, type Request, type Response } from 'express';
import nunjucks from 'nunjucks';
import { SAMPLE_PRODUCTS } from './data/sampleProducts';
import {
  normaliseSearchTerm,
  type ProductSearchResult,
} from './models/productSearch';
import { searchProductsApi } from './services/productService';
import { createApiProxy } from './util/apiProxy';

const VIEWS_DIRECTORY = new URL('../src/views/', import.meta.url);
const ASSETS_DIRECTORY = fileURLToPath(
  new URL('../src/assets/', import.meta.url),
);
const CONTROLLERS_DIRECTORY = fileURLToPath(
  new URL('../dist/public/controllers/', import.meta.url),
);
const REGISTER_PAGE_PATH = fileURLToPath(
  new URL('register.html', VIEWS_DIRECTORY),
);
const UNAVAILABLE_PAGE_PATH = fileURLToPath(
  new URL('unavailable.html', VIEWS_DIRECTORY),
);

export function createApp(backendOrigin: string): Express {
  const app = express();

  nunjucks.configure(fileURLToPath(VIEWS_DIRECTORY), {
    autoescape: true,
    express: app,
  });
  app.set('view engine', 'njk');

  app.use('/api', createApiProxy(backendOrigin));

  app.use('/assets', express.static(ASSETS_DIRECTORY));
  app.use('/controllers', express.static(CONTROLLERS_DIRECTORY));

  app.get('/', (_req: Request, res: Response) => {
    res.render(
      'homepage',
      { products: SAMPLE_PRODUCTS },
      (error: Error | null, html?: string) => {
        if (error || html === undefined) {
          console.error('Unable to load the homepage:', error);
          res.redirect('/unavailable');
          return;
        }
        res.type('html').send(html);
      },
    );
  });

  app.get('/search', async (req: Request, res: Response) => {
    const searchTerm = normaliseSearchTerm(req.query.q);
    let result: ProductSearchResult = { products: [], isClosestMatch: false };
    if (searchTerm !== '') {
      try {
        result = await searchProductsApi(backendOrigin, searchTerm);
      } catch (error) {
        console.error('Unable to search products:', error);
        res.redirect('/unavailable');
        return;
      }
    }
    const { products, isClosestMatch } = result;
    res.render(
      'search',
      { searchTerm, products, isClosestMatch },
      (error: Error | null, html?: string) => {
        if (error || html === undefined) {
          console.error('Unable to load the search page:', error);
          res.redirect('/unavailable');
          return;
        }
        res.type('html').send(html);
      },
    );
  });

  app.get('/register', async (_req: Request, res: Response) => {
    try {
      const register = await readFile(REGISTER_PAGE_PATH, 'utf8');
      res.type('html').send(register);
    } catch (error) {
      console.error('Unable to load the register page:', error);
      res.redirect('/unavailable');
    }
  });

  app.get('/basket', (_req: Request, res: Response) => {
    res.render(
      'basket',
      { browseProductsUrl: '/' },
      (error: Error | null, html?: string) => {
        if (error || html === undefined) {
          console.error('Unable to load the basket page:', error);
          res.redirect('/unavailable');
          return;
        }
        res.type('html').send(html);
      },
    );
  });

  app.get('/unavailable', async (_req: Request, res: Response) => {
    try {
      const unavailablePage = await readFile(UNAVAILABLE_PAGE_PATH, 'utf8');
      res.status(503).type('html').send(unavailablePage);
    } catch (error) {
      console.error('Unable to load the unavailable page:', error);
      res
        .status(500)
        .type('text')
        .send('The website is currently unavailable.');
    }
  });

  app.get('/health', (_req: Request, res: Response) => {
    res.json({ status: 'ok', uptime: process.uptime() });
  });

  return app;
}
