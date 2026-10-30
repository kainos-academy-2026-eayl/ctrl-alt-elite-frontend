import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import express, { type Express, type Request, type Response } from 'express';
import nunjucks from 'nunjucks';
import { SAMPLE_PRODUCTS } from './data/sampleProducts';
import { errorHandler, renderErrorPage } from './middleware/errorHandler';
import { requireSameOrigin } from './middleware/requireSameOrigin';
import { createBasketRouter } from './routes/basketRouter';
import { BasketController } from './server/controllers/basketController';
import { CatalogController } from './server/controllers/catalog-controller';
import { LoginController } from './server/controllers/login';
import { SearchController } from './server/controllers/searchController';
import { CatalogService } from './server/services/catalog-service';
import { BasketService } from './services/basketService';
import { ProductService } from './services/productService';
import { createAdminGuard } from './util/adminGuard';
import {
  ADMIN_NAV_ITEMS,
  ADMIN_QUICK_ACTIONS,
  ADMIN_SUMMARY_CARDS,
  ADMIN_SYSTEM_STATUS,
  findAdminModule,
} from './util/adminPortal';
import { DASHBOARD_WIDGETS } from './util/adminSettings';
import { loadAdminFirstName, loadAdminProfile } from './util/adminUser';
import { createApiProxy } from './util/apiProxy';
import { clearAuthCookie, readAuthCookie } from './util/authCookie';
import { createCustomerGuard } from './util/customerGuard';
import { CUSTOMER_SORT_OPTIONS } from './util/customers';
import { LoginSession } from './util/loginSession';
import {
  MAX_DESCRIPTION_LENGTH,
  MAX_SUBJECT_LENGTH,
  TICKET_CATEGORIES,
  TICKET_STATUSES,
} from './util/supportTickets';
import { buildHomepage } from './views/homepage.page';

const VIEWS_DIRECTORY = fileURLToPath(
  new URL('../src/views/', import.meta.url),
);
const PACKAGE_JSON_PATH = fileURLToPath(
  new URL('../package.json', import.meta.url),
);
const ASSETS_DIRECTORY = fileURLToPath(
  new URL('../src/assets/', import.meta.url),
);
const CONTROLLERS_DIRECTORY = fileURLToPath(
  new URL('../dist/public/controllers/', import.meta.url),
);

async function readAppVersion(): Promise<string> {
  try {
    const manifest: unknown = JSON.parse(
      await readFile(PACKAGE_JSON_PATH, 'utf8'),
    );
    if (
      typeof manifest === 'object' &&
      manifest !== null &&
      'version' in manifest &&
      typeof manifest.version === 'string'
    ) {
      return manifest.version;
    }
  } catch (error) {
    console.error('Unable to read the application version:', error);
  }
  return 'Unknown';
}

export interface AppOptions {
  jwtSecret?: string;
}

export function createApp(
  backendOrigin: string,
  { jwtSecret = process.env.JWT_SECRET }: AppOptions = {},
): Express {
  const app = express();
  app.set('views', VIEWS_DIRECTORY);
  nunjucks.configure([VIEWS_DIRECTORY], {
    autoescape: true,
    express: app,
    noCache: process.env.NODE_ENV !== 'production',
  });
  app.set('view engine', 'njk');
  const loginSession = new LoginSession(jwtSecret);
  const loginController = new LoginController(backendOrigin, loginSession);
  const basketController = new BasketController(
    new BasketService(backendOrigin),
  );

  // noCache is a loader option, so it must be set on the loader to take effect.
  const adminTemplates = new nunjucks.Environment(
    new nunjucks.FileSystemLoader(VIEWS_DIRECTORY, {
      noCache: process.env.NODE_ENV !== 'production',
    }),
    { autoescape: true },
  );

  async function renderAdminPage(
    req: Request,
    res: Response,
    template: string,
    context: Record<string, unknown>,
  ): Promise<void> {
    const profile =
      'profile' in context
        ? context.profile
        : await loadAdminProfile(
            backendOrigin,
            readAuthCookie(req.headers.cookie),
          );
    try {
      res.type('html').send(
        adminTemplates.render(template, {
          navItems: ADMIN_NAV_ITEMS,
          profile,
          ...context,
        }),
      );
    } catch (error) {
      console.error(`Unable to load the admin page ${template}:`, error);
      res.redirect('/unavailable');
    }
  }

  app.use('/api', createApiProxy(backendOrigin));

  app.use('/assets', express.static(ASSETS_DIRECTORY));
  app.use('/controllers', express.static(CONTROLLERS_DIRECTORY));
  app.use(
    '/product-catalog',
    express.static(
      fileURLToPath(new URL('../product_catalog/', import.meta.url)),
      { index: false },
    ),
  );
  const catalogController = new CatalogController(
    new CatalogService(backendOrigin),
  );
  app.get('/products', catalogController.showProducts);

  const searchController = new SearchController(
    new ProductService(backendOrigin),
    basketController.getHeaderBasket,
  );
  app.get('/search', searchController.show);

  app.get('/', async (req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'no-store');
    try {
      const [account, basket] = await Promise.all([
        loginSession.getAccount(req, res),
        basketController.getHeaderBasket(req),
      ]);
      res
        .type('html')
        .send(
          adminTemplates.render(
            'homepage.njk',
            buildHomepage({ account, products: SAMPLE_PRODUCTS, basket }),
          ),
        );
    } catch (error) {
      console.error('Unable to load the homepage:', error);
      res.redirect('/unavailable');
    }
  });

  app.get('/login', loginController.show);
  app.post(
    '/login',
    requireSameOrigin,
    express.urlencoded({ extended: false, limit: '16kb' }),
    loginController.submit,
  );

  app.get('/profile', async (req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'no-store');
    try {
      const account = await loginSession.getAccount(req, res);
      if (!account) {
        res.redirect('/login');
        return;
      }
      res.type('html').send(
        adminTemplates.render('profile.njk', {
          account,
          currentYear: new Date().getFullYear(),
        }),
      );
    } catch (error) {
      console.error('Unable to load the profile page:', error);
      res.redirect('/unavailable');
    }
  });

  app.post('/logout', requireSameOrigin, (_req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'no-store');
    clearAuthCookie(res);
    loginSession.clear(res);
    res.redirect(303, '/login');
  });

  app.get('/register', async (_req: Request, res: Response) => {
    try {
      const register = adminTemplates.render('register.njk');
      res.type('html').send(register);
    } catch (error) {
      console.error('Unable to load the register page:', error);
      res.redirect('/unavailable');
    }
  });

  app.get('/checkout', basketController.showCheckout);
  app.use('/basket', createBasketRouter(basketController));

  // Like the admin pages, these are page shells: src/controllers/support.ts
  // loads and submits tickets through /api/support/tickets in the browser.
  app.use('/account', createCustomerGuard());

  function renderSupportPage(
    res: Response,
    page: 'list' | 'new' | 'detail',
    title: string,
  ): void {
    res.render(
      'support',
      {
        page,
        title,
        categories: TICKET_CATEGORIES,
        maxSubjectLength: MAX_SUBJECT_LENGTH,
        maxDescriptionLength: MAX_DESCRIPTION_LENGTH,
        currentYear: new Date().getFullYear(),
      },
      (error: Error | null, html: string) => {
        if (error) {
          console.error('Unable to load the support page:', error);
          renderErrorPage(res);
          return;
        }
        res.type('html').send(html);
      },
    );
  }

  app.get('/account/support', (_req: Request, res: Response) => {
    renderSupportPage(res, 'list', 'My support tickets');
  });

  app.get('/account/support/new', (_req: Request, res: Response) => {
    renderSupportPage(res, 'new', 'Create a ticket');
  });

  app.get('/account/support/:id', (_req: Request, res: Response) => {
    renderSupportPage(res, 'detail', 'Ticket details');
  });

  app.use('/admin', createAdminGuard(backendOrigin));

  // The server only serves page shells. Live data is loaded in the browser by the
  // matching controller in src/controllers, which calls the backend through /api.
  app.get('/admin', async (req: Request, res: Response) => {
    const firstName = await loadAdminFirstName(
      backendOrigin,
      readAuthCookie(req.headers.cookie),
    );
    await renderAdminPage(req, res, 'admin/dashboard.njk', {
      title: 'Dashboard',
      firstName,
      activeSlug: 'dashboard',
      summaryCards: ADMIN_SUMMARY_CARDS,
      quickActions: ADMIN_QUICK_ACTIONS,
      systemStatus: ADMIN_SYSTEM_STATUS,
    });
  });

  app.get('/admin/customers', async (req: Request, res: Response) => {
    await renderAdminPage(req, res, 'admin/customers.njk', {
      title: 'Customers',
      activeSlug: 'customers',
      sortOptions: CUSTOMER_SORT_OPTIONS,
    });
  });

  app.get('/admin/customers/:id', async (req: Request, res: Response) => {
    await renderAdminPage(req, res, 'admin/customer-detail.njk', {
      title: 'Customer details',
      activeSlug: 'customers',
    });
  });

  app.get('/admin/support', async (req: Request, res: Response) => {
    await renderAdminPage(req, res, 'admin/support.njk', {
      title: 'Support Tickets',
      activeSlug: 'support',
      statuses: TICKET_STATUSES,
      categories: TICKET_CATEGORIES,
    });
  });

  app.get('/admin/support/:id', async (req: Request, res: Response) => {
    await renderAdminPage(req, res, 'admin/support-detail.njk', {
      title: 'Ticket details',
      activeSlug: 'support',
    });
  });

  app.get('/admin/settings', async (req: Request, res: Response) => {
    const [profile, appVersion] = await Promise.all([
      loadAdminProfile(backendOrigin, readAuthCookie(req.headers.cookie)),
      readAppVersion(),
    ]);
    await renderAdminPage(req, res, 'admin/settings.njk', {
      title: 'Settings',
      activeSlug: 'settings',
      profile,
      appVersion,
      dashboardWidgets: DASHBOARD_WIDGETS,
    });
  });

  app.get('/admin/:section', async (req: Request, res: Response, next) => {
    const adminModule = findAdminModule(String(req.params.section));
    if (!adminModule) {
      next();
      return;
    }
    await renderAdminPage(req, res, 'admin/module.njk', {
      title: adminModule.label,
      activeSlug: adminModule.slug,
    });
  });

  app.get('/unavailable', async (_req: Request, res: Response) => {
    try {
      const unavailablePage = adminTemplates.render('unavailable.njk');
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

  // Must be registered after every route so it catches their errors.
  app.use(errorHandler);

  return app;
}
