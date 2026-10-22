import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import express, { type Express, type Request, type Response } from 'express';
import nunjucks from 'nunjucks';
import { createAdminCustomersRouter } from './routes/adminCustomers';
import {
  buildActivity,
  buildNotifications,
  buildSummaryCards,
  buildSystemStatus,
  loadDashboardCustomerData,
} from './util/adminDashboard';
import {
  ADMIN_NAV_ITEMS,
  ADMIN_QUICK_ACTIONS,
  ADMIN_SUMMARY_CARDS,
  findAdminModule,
} from './util/adminPortal';
import { createApiProxy } from './util/apiProxy';
import { createApiCustomerSource } from './util/customerApi';
import type { CustomerSource } from './util/customers';

const HOME_PAGE_PATH = fileURLToPath(
  new URL('../src/views/homepage.html', import.meta.url),
);
const VIEWS_DIRECTORY = fileURLToPath(
  new URL('../src/views/', import.meta.url),
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

export interface AppOptions {
  customerSource?: CustomerSource;
}

export function createApp(
  backendOrigin: string,
  { customerSource = createApiCustomerSource(backendOrigin) }: AppOptions = {},
): Express {
  const app = express();
  app.set('views', VIEWS_DIRECTORY);
  nunjucks.configure([VIEWS_DIRECTORY], {
    autoescape: true,
    express: app,
    noCache: process.env.NODE_ENV !== 'production',
  });
  app.set('view engine', 'njk');
  const loginController = new LoginController(backendOrigin);

  const adminTemplates = new nunjucks.Environment(
    new nunjucks.FileSystemLoader(VIEWS_DIRECTORY),
    { autoescape: true, noCache: process.env.NODE_ENV !== 'production' },
  );

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

  app.get('/login', loginController.show);
  app.post(
    '/login',
    express.urlencoded({ extended: false, limit: '16kb' }),
    loginController.submit,
  );

  app.get('/register', async (_req: Request, res: Response) => {
    try {
      const register = await readFile(REGISTER_PAGE_PATH, 'utf8');
      res.type('html').send(register);
    } catch (error) {
      console.error('Unable to load the register page:', error);
      res.redirect('/unavailable');
    }
  });

  // Customer figures are live; if the backend is unreachable the page falls back
  // to static placeholders instead of failing.
  app.get('/admin', async (_req: Request, res: Response) => {
    try {
      const customerData = await loadDashboardCustomerData(customerSource);
      res.type('html').send(
        adminTemplates.render('admin/dashboard.njk', {
          title: 'Dashboard',
          activeSlug: 'dashboard',
          navItems: ADMIN_NAV_ITEMS,
          summaryCards: buildSummaryCards(ADMIN_SUMMARY_CARDS, customerData),
          quickActions: ADMIN_QUICK_ACTIONS,
          systemStatus: buildSystemStatus(customerData.available),
          notifications: buildNotifications(customerData),
          activity: buildActivity(customerData),
        }),
      );
    } catch (error) {
      console.error('Unable to load the admin dashboard:', error);
      res.redirect('/unavailable');
    }
  });

  app.use(
    '/admin/customers',
    createAdminCustomersRouter(adminTemplates, customerSource),
  );

  app.get('/admin/:section', (req: Request, res: Response, next) => {
    const adminModule = findAdminModule(String(req.params.section));
    if (!adminModule) {
      next();
      return;
    }
    try {
      res.type('html').send(
        adminTemplates.render('admin/module.njk', {
          title: adminModule.label,
          activeSlug: adminModule.slug,
          navItems: ADMIN_NAV_ITEMS,
        }),
      );
    } catch (error) {
      console.error('Unable to load the admin page:', error);
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
