import { AsyncLocalStorage } from 'node:async_hooks';
import type { NextFunction, Request, RequestHandler, Response } from 'express';
import type { Environment } from 'nunjucks';
import type { BasketResponseDto } from '../dtos/basketDto';
import { loadStaffAccount } from '../util/adminUser';
import { readAuthCookie } from '../util/authCookie';
import type { LoginSession } from '../util/loginSession';
import { findStaffRole } from '../util/staffRoles';
import { type BasketSummary, toBasketSummary } from '../views/basket.page';
import type { CatalogService } from './services/catalog-service';

/**
 * What the customer site navigation (views/_siteNav.njk) shows. It is built
 * once per page request and read by templates through the siteNav() global, so
 * individual pages do not have to pass it in.
 */
export interface SiteNavigation {
  isAuthenticated: boolean;
  accountName: string;
  isStaff: boolean;
  categories: string[];
  basketSummary: BasketSummary;
  currentPath: string;
  currentCategory: string;
}

export interface SiteNavigationDependencies {
  backendOrigin: string;
  loginSession: LoginSession;
  catalogService: CatalogService;
  getHeaderBasket: (req: Request) => Promise<BasketResponseDto | null>;
}

// Paths that are not customer pages: staff dashboards, the API proxy and files.
const EXCLUDED_PREFIXES = [
  '/admin',
  '/api',
  '/assets',
  '/controllers',
  '/product-catalog',
  '/health',
];

const GUEST_NAVIGATION: SiteNavigation = {
  isAuthenticated: false,
  accountName: 'Account',
  isStaff: false,
  categories: [],
  basketSummary: toBasketSummary(null),
  currentPath: '',
  currentCategory: '',
};

const navigationStore = new AsyncLocalStorage<SiteNavigation>();

function isCustomerPage(req: Request): boolean {
  if (
    req.method !== 'GET' &&
    !(req.method === 'POST' && req.path === '/login')
  ) {
    return false;
  }
  return !EXCLUDED_PREFIXES.some(
    (prefix) => req.path === prefix || req.path.startsWith(`${prefix}/`),
  );
}

/** Sessions created before roles were stored have no role to read. */
async function isStaffAccount(
  { backendOrigin }: SiteNavigationDependencies,
  req: Request,
  account: { role?: string } | null,
): Promise<boolean> {
  if (!account) return false;
  if (findStaffRole(account.role) !== undefined) return true;
  if (account.role) return false;
  const staff = await loadStaffAccount(
    backendOrigin,
    readAuthCookie(req.headers.cookie),
  );
  return staff?.role !== undefined;
}

async function buildNavigation(
  dependencies: SiteNavigationDependencies,
  req: Request,
  res: Response,
): Promise<SiteNavigation> {
  const [account, categories, basket] = await Promise.all([
    dependencies.loginSession.getAccount(req, res),
    dependencies.catalogService.getCategories(),
    req.path === '/basket' || req.path === '/checkout'
      ? null
      : dependencies.getHeaderBasket(req),
  ]);
  return {
    isAuthenticated: account !== null,
    accountName: account?.name ?? GUEST_NAVIGATION.accountName,
    isStaff: await isStaffAccount(dependencies, req, account),
    categories,
    basketSummary: toBasketSummary(basket),
    currentPath: req.path,
    currentCategory:
      typeof req.query.category === 'string' ? req.query.category : '',
  };
}

export function createSiteNavigationMiddleware(
  dependencies: SiteNavigationDependencies,
): RequestHandler {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (!isCustomerPage(req)) {
      next();
      return;
    }
    res.setHeader('Cache-Control', 'no-store');
    let navigation = GUEST_NAVIGATION;
    try {
      navigation = await buildNavigation(dependencies, req, res);
    } catch (error) {
      console.error('Unable to build the site navigation:', error);
    }
    navigationStore.run(navigation, next);
  };
}

/** Makes siteNav() available to the templates of the given environment. */
export function addSiteNavigationGlobal(environment: Environment): void {
  environment.addGlobal(
    'siteNav',
    (): SiteNavigation => navigationStore.getStore() ?? GUEST_NAVIGATION,
  );
}
