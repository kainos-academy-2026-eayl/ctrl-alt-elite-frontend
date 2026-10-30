import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import express, { type Express } from 'express';
import nunjucks from 'nunjucks';
import { errorHandler } from './middleware/errorHandler';
import { requireSameOrigin } from './middleware/requireSameOrigin';
import { createBasketRouter } from './routes/basketRouter';
import { AccountController } from './server/controllers/account-controller';
import { AdminController } from './server/controllers/admin-controller';
import { BasketController } from './server/controllers/basketController';
import { CatalogController } from './server/controllers/catalog-controller';
import { HomeController } from './server/controllers/home-controller';
import { LoginController } from './server/controllers/login';
import { SearchController } from './server/controllers/searchController';
import { StatusController } from './server/controllers/status-controller';
import { SupportController } from './server/controllers/support-controller';
import { createAdminRouter } from './server/routes/admin';
import { CatalogService } from './server/services/catalog-service';
import { BasketService } from './services/basketService';
import { ProductService } from './services/productService';
import { createApiProxy } from './util/apiProxy';
import { createCustomerGuard } from './util/customerGuard';
import { LoginSession } from './util/loginSession';

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

  const homeController = new HomeController(
    backendOrigin,
    loginSession,
    adminTemplates,
    basketController,
  );
  const accountController = new AccountController(loginSession, adminTemplates);
  const supportController = new SupportController();
  const statusController = new StatusController(adminTemplates);
  const adminController = new AdminController(
    backendOrigin,
    adminTemplates,
    readAppVersion,
  );

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

  app.get('/', homeController.show);
  app.get('/dashboard', homeController.redirectToDashboard);

  app.get('/login', loginController.show);
  app.post(
    '/login',
    requireSameOrigin,
    express.urlencoded({ extended: false, limit: '16kb' }),
    loginController.submit,
  );

  app.get('/profile', accountController.showProfile);
  app.post('/logout', requireSameOrigin, accountController.logout);
  app.get('/register', accountController.showRegister);

  app.get('/checkout', basketController.showCheckout);
  app.use('/basket', createBasketRouter(basketController));

  app.use('/account', createCustomerGuard());
  app.get('/account/support', supportController.showList);
  app.get('/account/support/new', supportController.showNew);
  app.get('/account/support/:id', supportController.showDetail);

  app.use('/admin', createAdminRouter(backendOrigin, adminController));

  app.get('/unavailable', statusController.showUnavailable);
  app.get('/health', statusController.health);

  // Must be registered after every route so it catches their errors.
  app.use(errorHandler);

  return app;
}
