import express, { type Express, type Request, type Response } from 'express';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createApiProxy } from './util/apiProxy';

const VIEWS_DIRECTORY = new URL('../src/views/', import.meta.url);
const ASSETS_DIRECTORY = fileURLToPath(new URL('../src/assets/', import.meta.url));
const CONTROLLERS_DIRECTORY = fileURLToPath(
  new URL('../src/controllers/', import.meta.url),
);
const HOME_PAGE_PATH = fileURLToPath(new URL('homepage.html', VIEWS_DIRECTORY));
const REGISTER_PAGE_PATH = fileURLToPath(
  new URL('register.html', VIEWS_DIRECTORY),
);
const UNAVAILABLE_PAGE_PATH = fileURLToPath(
  new URL('unavailable.html', VIEWS_DIRECTORY),
);

export function createApp(backendOrigin: string): Express {
  const app = express();

  app.use('/api', createApiProxy(backendOrigin));

  app.use('/assets', express.static(ASSETS_DIRECTORY));
  app.use('/controllers', express.static(CONTROLLERS_DIRECTORY));

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
      console.error('Unable to load the register page:', error);
      res.redirect('/unavailable');
    }
  });

  app.get('/unavailable', async (_req: Request, res: Response) => {
    try {
      const unavailablePage = await readFile(UNAVAILABLE_PAGE_PATH, 'utf8');
      res.status(503).type('html').send(unavailablePage);
    } catch (error) {
      console.error('Unable to load the unavailable page:', error);
      res.status(500).type('text').send('The website is currently unavailable.');
    }
  });

  app.get('/health', (_req: Request, res: Response) => {
    res.json({ status: 'ok', uptime: process.uptime() });
  });

  return app;
}
