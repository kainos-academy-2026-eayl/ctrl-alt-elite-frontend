import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import express, { type Express, type Request, type Response } from 'express';
import nunjucks from 'nunjucks';

const WEB_PAGE_DIRECTORY = fileURLToPath(
  new URL('../WebPage/', import.meta.url),
);
const HOME_PAGE_PATH = fileURLToPath(
  new URL('../WebPage/Homepage.html', import.meta.url),
);
const REGISTER_PAGE_PATH = fileURLToPath(
  new URL('../WebPage/Register.html', import.meta.url),
);
const UNAVAILABLE_PAGE_PATH = fileURLToPath(
  new URL('../WebPage/Unavailable.html', import.meta.url),
);
// Resolves to src/views from both src/app.ts (dev) and dist/index.js (build).
const VIEWS_DIRECTORY = fileURLToPath(
  new URL('../src/views/', import.meta.url),
);

export function createApp(): Express {
  const app = express();

  nunjucks.configure(VIEWS_DIRECTORY, { autoescape: true, express: app });

  app.use(express.static(WEB_PAGE_DIRECTORY, { index: false }));

  app.get('/', async (_req: Request, res: Response) => {
    try {
      const homepage = await readFile(HOME_PAGE_PATH, 'utf8');
      res.type('html').send(homepage);
    } catch (error) {
      console.error('Unable to load the homepage:', error);
      res.redirect('/unavailable');
    }
  });

  app.get('/register', async (_req: Request, res: Response) => {
    try {
      const register = await readFile(REGISTER_PAGE_PATH, 'utf8');
      res.type('html').send(register);
    } catch (error) {
      console.error('Unable to load the homepage:', error);
      res.redirect('/unavailable');
    }
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

  app.get('/basket', (_req: Request, res: Response) => {
    res.render(
      'basket.njk',
      { checkoutUrl: '/checkout', browseProductsUrl: '/' },
      (error, html) => {
        if (error) {
          console.error('Unable to load the basket page:', error);
          res.redirect('/unavailable');
          return;
        }
        res.type('html').send(html);
      },
    );
  });

  return app;
}
