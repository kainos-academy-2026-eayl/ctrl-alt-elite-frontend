import type { Request, Response } from 'express';
import type { Environment } from 'nunjucks';
import { clearAuthCookie, readAuthCookie } from '../../util/authCookie';
import type { LoginSession } from '../../util/loginSession';
import {
  ProfileAuthenticationError,
  type ProfileDetails,
  type ProfileService,
  ProfileUpdateError,
  profileDisplayName,
} from '../services/profile-service';

export class AccountController {
  constructor(
    private readonly loginSession: LoginSession,
    private readonly templates: Environment,
    private readonly profileService: ProfileService,
  ) {}

  private renderProfile(
    res: Response,
    account: { name: string; role?: string },
    profile: ProfileDetails | null,
    {
      status = 200,
      message = '',
      error = '',
      fields,
    }: {
      status?: number;
      message?: string;
      error?: string;
      fields?: unknown;
    } = {},
  ): void {
    const form = profile ? { ...profile } : null;
    if (form && typeof fields === 'object' && fields !== null) {
      for (const key of [
        'username',
        'firstName',
        'lastName',
        'addressLine1',
        'addressLine2',
        'postcode',
        'phoneNumber',
      ] as const) {
        if (key in fields) {
          const value = Reflect.get(fields, key);
          if (typeof value === 'string') form[key] = value;
        }
      }
    }
    res
      .status(status)
      .type('html')
      .send(
        this.templates.render('profile.njk', {
          account: profile
            ? { ...account, name: profileDisplayName(profile) }
            : account,
          profile,
          form,
          profileLoadMessage: profile
            ? ''
            : 'Sign in again to load and save your profile.',
          message,
          error,
          currentYear: new Date().getFullYear(),
        }),
      );
  }

  private profileError(res: Response, error: unknown): void {
    if (error instanceof ProfileAuthenticationError) {
      console.warn('Saved profile access denied: login required.');
      clearAuthCookie(res);
      this.loginSession.clear(res);
      res.redirect('/login');
      return;
    }
    console.error('Unable to load or save the profile:', error);
    res.redirect('/unavailable');
  }

  showProfile = async (req: Request, res: Response): Promise<void> => {
    res.setHeader('Cache-Control', 'no-store');
    try {
      const account = await this.loginSession.getAccount(req, res);
      if (!account) {
        res.redirect('/login');
        return;
      }
      const token = readAuthCookie(req.headers.cookie);
      const profile = token
        ? await this.profileService.getOwnProfile(token)
        : null;
      if (!token) {
        console.warn('Saved profile details require a backend login.');
      }
      if (profile) {
        await this.loginSession.refreshName(
          req,
          res,
          profile.id,
          profileDisplayName(profile),
        );
      }
      this.renderProfile(res, account, profile, {
        message: req.query.saved === '1' ? 'Your profile has been saved.' : '',
      });
    } catch (error) {
      this.profileError(res, error);
    }
  };

  saveProfile = async (req: Request, res: Response): Promise<void> => {
    res.setHeader('Cache-Control', 'no-store');
    let profile: ProfileDetails | null = null;
    const account = await this.loginSession.getAccount(req, res);
    const token = readAuthCookie(req.headers.cookie);
    if (!account || !token) {
      console.warn('Saving a profile requires a current backend login.');
      clearAuthCookie(res);
      this.loginSession.clear(res);
      res.redirect('/login');
      return;
    }
    try {
      profile = await this.profileService.getOwnProfile(token);
      if (!req.is('application/x-www-form-urlencoded')) {
        this.renderProfile(res, account, profile, {
          status: 415,
          error: 'Please submit the profile form.',
        });
        return;
      }
      const updated = await this.profileService.updateOwnProfile(
        token,
        req.body,
      );
      await this.loginSession.refreshName(
        req,
        res,
        updated.id,
        profileDisplayName(updated),
      );
      res.redirect(303, '/profile?saved=1');
    } catch (error) {
      if (error instanceof ProfileUpdateError && profile) {
        this.renderProfile(res, account, profile, {
          status: error.status,
          error: error.message,
          fields: req.body,
        });
        return;
      }
      this.profileError(res, error);
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
