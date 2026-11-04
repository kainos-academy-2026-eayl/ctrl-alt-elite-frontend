import type { Request, Response } from 'express';
import type { Environment } from 'nunjucks';
import { SAMPLE_PRODUCTS } from '../../data/sampleProducts';
import type { PopularProductDto } from '../../dtos/popularProductsDto';
import type { ProductService } from '../../services/productService';
import { loadStaffAccount } from '../../util/adminUser';
import { readAuthCookie } from '../../util/authCookie';
import type { LoginSession } from '../../util/loginSession';
import { findStaffRole, normaliseRole, Role } from '../../util/staffRoles';
import { buildHomepage } from '../../views/homepage.page';
import type { BasketController } from './basketController';

/** How many best sellers the homepage conveyor shows. */
const CONVEYOR_PRODUCT_COUNT = 6;

export class HomeController {
  constructor(
    private readonly backendOrigin: string,
    private readonly loginSession: LoginSession,
    private readonly templates: Environment,
    private readonly basketController: BasketController,
    private readonly productService?: ProductService,
  ) {}

  /** The conveyor is optional: if products cannot be loaded it is left out. */
  private async loadConveyorProducts(): Promise<PopularProductDto[]> {
    if (!this.productService) return [];
    try {
      return await this.productService.getPopular(CONVEYOR_PRODUCT_COUNT);
    } catch (error) {
      console.error('Unable to load products for the conveyor:', error);
      return [];
    }
  }

  show = async (req: Request, res: Response): Promise<void> => {
    res.setHeader('Cache-Control', 'no-store');
    try {
      const [account, basket, conveyorProducts] = await Promise.all([
        this.loginSession.getAccount(req, res),
        this.basketController.getHeaderBasket(req),
        this.loadConveyorProducts(),
      ]);
      // Sessions created before roles were stored have no role to read.
      const role = account
        ? (findStaffRole(account.role) ??
          (account.role
            ? undefined
            : (
                await loadStaffAccount(
                  this.backendOrigin,
                  readAuthCookie(req.headers.cookie),
                )
              )?.role))
        : undefined;
      res.type('html').send(
        this.templates.render('homepage.njk', {
          ...buildHomepage({
            account,
            products: SAMPLE_PRODUCTS,
            conveyorProducts,
            basket,
          }),
          isStaff: role !== undefined,
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
