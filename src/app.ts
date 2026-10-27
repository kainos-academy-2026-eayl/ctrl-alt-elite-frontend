import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import express, { type Express, type Request, type Response } from 'express';
import nunjucks from 'nunjucks';
import { LoginController } from './server/controllers/login';
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
import { CUSTOMER_SORT_OPTIONS } from './util/customers';
import { LoginSession } from './util/loginSession';

function requireSameOrigin(
  req: Request,
  res: Response,
  next: (error?: unknown) => void,
): void {
  const source = req.get('origin') ?? req.get('referer');
  if (source) {
    try {
      const requestOrigin = new URL(`${req.protocol}://${req.get('host')}`)
        .origin;
      if (new URL(source).origin === requestOrigin) {
        next();
        return;
      }
    } catch {
      // Reject malformed origin and referer values.
    }
  }
  res.status(403).type('text').send('Forbidden');
}

const VIEWS_DIRECTORY = fileURLToPath(
  new URL('../src/views/', import.meta.url),
);
const REGISTER_PAGE_PATH = fileURLToPath(
  new URL('../src/views/register.html', import.meta.url),
);
const PACKAGE_JSON_PATH = fileURLToPath(
  new URL('../package.json', import.meta.url),
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

  // noCache is a loader option, so it must be set on the loader to take effect.
  const adminTemplates = new nunjucks.Environment(
    new nunjucks.FileSystemLoader(VIEWS_DIRECTORY, {
      noCache: process.env.NODE_ENV !== 'production',
    }),
    { autoescape: true },
  );

  function renderAdminPage(
    res: Response,
    template: string,
    context: Record<string, unknown>,
  ): void {
    try {
      res.type('html').send(
        adminTemplates.render(template, {
          navItems: ADMIN_NAV_ITEMS,
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

  app.get('/', async (req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'no-store');
    try {
      const account = await loginSession.getAccount(req, res);
      res.type('html').send(
        adminTemplates.render('homepage.html', {
          isAuthenticated: account !== null,
          accountName: account?.name ?? 'Account',
        }),
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
      const register = await readFile(REGISTER_PAGE_PATH, 'utf8');
      res.type('html').send(register);
    } catch (error) {
      console.error('Unable to load the register page:', error);
      res.redirect('/unavailable');
    }
  });

  app.use('/admin', createAdminGuard(backendOrigin));

  // The server only serves page shells. Live data is loaded in the browser by the
  // matching controller in src/controllers, which calls the backend through /api.
  app.get('/admin', async (req: Request, res: Response) => {
    const firstName = await loadAdminFirstName(
      backendOrigin,
      readAuthCookie(req.headers.cookie),
    );
    renderAdminPage(res, 'admin/dashboard.njk', {
      title: 'Dashboard',
      firstName,
      activeSlug: 'dashboard',
      summaryCards: ADMIN_SUMMARY_CARDS,
      quickActions: ADMIN_QUICK_ACTIONS,
      systemStatus: ADMIN_SYSTEM_STATUS,
    });
  });

  app.get('/admin/customers', (_req: Request, res: Response) => {
    renderAdminPage(res, 'admin/customers.njk', {
      title: 'Customers',
      activeSlug: 'customers',
      sortOptions: CUSTOMER_SORT_OPTIONS,
    });
  });

  app.get('/admin/customers/:id', (_req: Request, res: Response) => {
    renderAdminPage(res, 'admin/customer-detail.njk', {
      title: 'Customer details',
      activeSlug: 'customers',
    });
  });

  app.get('/admin/settings', async (req: Request, res: Response) => {
    const [profile, appVersion] = await Promise.all([
      loadAdminProfile(backendOrigin, readAuthCookie(req.headers.cookie)),
      readAppVersion(),
    ]);
    renderAdminPage(res, 'admin/settings.njk', {
      title: 'Settings',
      activeSlug: 'settings',
      profile,
      appVersion,
      dashboardWidgets: DASHBOARD_WIDGETS,
    });
  });

  app.get('/admin/:section', (req: Request, res: Response, next) => {
    const adminModule = findAdminModule(String(req.params.section));
    if (!adminModule) {
      next();
      return;
    }
    renderAdminPage(res, 'admin/module.njk', {
      title: adminModule.label,
      activeSlug: adminModule.slug,
    });
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
