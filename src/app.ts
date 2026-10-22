import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import express, { type Express, type Request, type Response } from 'express';
import nunjucks from 'nunjucks';
import { registerProductApp } from './product_app';
import { createApiProxy } from './util/apiProxy';

const HOME_PAGE_PATH = fileURLToPath(
  new URL('../src/views/homepage.html', import.meta.url),
);
const LOGIN_PAGE_PATH = fileURLToPath(
  new URL('../src/views/Login.njk', import.meta.url),
);
const REGISTER_PAGE_PATH = fileURLToPath(
  new URL('../src/views/register.html', import.meta.url),
);
const UNAVAILABLE_PAGE_PATH = fileURLToPath(
  new URL('../src/views/unavailable.html', import.meta.url),
);
const ASSETS_DIRECTORY = fileURLToPath(
  new URL('../src/assets/', import.meta.url),
);
const CONTROLLERS_DIRECTORY = fileURLToPath(
  new URL('../dist/public/controllers/', import.meta.url),
);

export function createApp(backendOrigin: string): Express {
  const app = express();
  const loginTemplates = new nunjucks.Environment(null, { autoescape: true });

  app.use('/api', createApiProxy(backendOrigin));

  app.use('/assets', express.static(ASSETS_DIRECTORY));
  app.use('/controllers', express.static(CONTROLLERS_DIRECTORY));
  registerProductApp(app, backendOrigin);

  app.get('/', async (_req: Request, res: Response) => {
    try {
      const homepage = await readFile(HOME_PAGE_PATH, 'utf8');
      res.type('html').send(homepage);
    } catch (error) {
      console.error('Unable to load the homepage:', error);
      res.redirect('/unavailable');
    }
  });

  app.get('/login', async (_req: Request, res: Response) => {
    try {
      const login = await readFile(LOGIN_PAGE_PATH, 'utf8');
      res.type('html').send(loginTemplates.renderString(login, {}));
    } catch (error) {
      console.error('Unable to load the login page:', error);
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
