import type { Request, Response } from 'express';
import type { Environment } from 'nunjucks';
import { loadStaffAccount } from '../../util/adminUser';
import { readAuthCookie } from '../../util/authCookie';
import type { LoginSession } from '../../util/loginSession';
import { findStaffRole, normaliseRole, Role } from '../../util/staffRoles';
import { buildHomepage } from '../../views/homepage.page';
import type { CatalogService } from '../services/catalog-service';
import {
  type HomepageProducts,
  pickHomepageProducts,
} from '../services/homepage-products';
import type { BasketController } from './basketController';

const NO_PRODUCTS: HomepageProducts = { featured: [], conveyor: [] };

export class HomeController {
  constructor(
    private readonly backendOrigin: string,
    private readonly loginSession: LoginSession,
    private readonly templates: Environment,
    private readonly basketController: BasketController,
    private readonly catalogService?: CatalogService,
  ) {}

  /** If the catalogue cannot be loaded, the homepage is shown without products. */
  private async loadHomepageProducts(): Promise<HomepageProducts> {
    if (!this.catalogService) return NO_PRODUCTS;
    try {
      const { products } = await this.catalogService.getProducts();
      return pickHomepageProducts(products);
    } catch (error) {
      console.error('Unable to load products for the homepage:', error);
      return NO_PRODUCTS;
    }
  }

  show = async (req: Request, res: Response): Promise<void> => {
    res.setHeader('Cache-Control', 'no-store');
    try {
      const [account, basket, { featured, conveyor }] = await Promise.all([
        this.loginSession.getAccount(req, res),
        this.basketController.getHeaderBasket(req),
        this.loadHomepageProducts(),
      ]);
      res.type('html').send(
        this.templates.render('homepage.njk', {
          ...buildHomepage({
            account,
            products: featured,
            conveyorProducts: conveyor,
            basket,
          }),
          currentYear: new Date().getFullYear(),
        }),
      );
    } catch (error) {
      console.error('Unable to load the homepage:', error);
      res.redirect('/unavailable');
    }
  };

  // Sends staff to the dashboard of their role from any page's Account menu.
  redirectToDashboard = async (req: Request, res: Response): Promise<void> => {
    res.setHeader('Cache-Control', 'no-store');
    const account = await this.loginSession.getAccount(req, res);
    const sessionRole = normaliseRole(account?.role);
    if (sessionRole === Role.CUSTOMER) {
      res.redirect(303, '/');
      return;
    }
    let role = findStaffRole(sessionRole);
    if (!role) {
      const token = readAuthCookie(req.headers.cookie);
      role = (await loadStaffAccount(this.backendOrigin, token))?.role;
    }
    // The admin guard re-checks the role on the dashboard itself.
    res.redirect(303, role ? role.dashboardPath : '/login');
  };
}
