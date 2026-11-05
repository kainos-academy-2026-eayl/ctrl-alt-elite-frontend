import type { Request, Response } from 'express';
import type { Environment } from 'nunjucks';
import {
  type CheckoutService,
  CheckoutServiceError,
} from '../../services/checkoutService';
import { clearAuthCookie, readAuthCookie } from '../../util/authCookie';
import { clearBasketCookie, clearBasketNotice } from '../../util/basketCookie';
import type { LoginSession } from '../../util/loginSession';
import { formatPrice } from '../../views/basket.page';

export class AccountController {
  constructor(
    private readonly loginSession: LoginSession,
    private readonly templates: Environment,
    private readonly checkoutService?: CheckoutService,
  ) {}

  /** The account's credit balance, or null if it cannot be loaded right now. */
  private async loadCreditBalance(req: Request): Promise<string | null> {
    const token = readAuthCookie(req.headers.cookie);
    if (!token || !this.checkoutService) return null;
    try {
      const { creditBalancePence } =
        await this.checkoutService.getAccount(token);
      return formatPrice(creditBalancePence);
    } catch (error) {
      if (!(error instanceof CheckoutServiceError && error.isUnauthenticated)) {
        console.error('Unable to load the credit balance:', error);
      }
      return null;
    }
  }

  showProfile = async (req: Request, res: Response): Promise<void> => {
    res.setHeader('Cache-Control', 'no-store');
    try {
      const account = await this.loginSession.getAccount(req, res);
      if (!account) {
        res.redirect('/login');
        return;
      }
      res.type('html').send(
        this.templates.render('profile.njk', {
          account,
          creditBalance: await this.loadCreditBalance(req),
          currentYear: new Date().getFullYear(),
        }),
      );
    } catch (error) {
      console.error('Unable to load the profile page:', error);
      res.redirect('/unavailable');
    }
  };

  showRegister = (_req: Request, res: Response): void => {
    try {
      res.type('html').send(this.templates.render('register.njk'));
    } catch (error) {
      console.error('Unable to load the register page:', error);
      res.redirect('/unavailable');
    }
  };

  logout = (_req: Request, res: Response): void => {
    res.setHeader('Cache-Control', 'no-store');
    clearAuthCookie(res);
    this.loginSession.clear(res);
    clearBasketCookie(res);
    clearBasketNotice(res);
    res.redirect(303, '/login');
  };
}
