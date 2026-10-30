import type { Request, Response } from 'express';
import type { Environment } from 'nunjucks';
import { clearAuthCookie } from '../../util/authCookie';
import type { LoginSession } from '../../util/loginSession';

export class AccountController {
  constructor(
    private readonly loginSession: LoginSession,
    private readonly templates: Environment,
  ) {}

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
    res.redirect(303, '/login');
  };
}
