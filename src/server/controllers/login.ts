import type { Request, Response } from 'express';
import type { LoginSession } from '../../util/loginSession';
import { clearAuthCookie, setAuthCookie } from '../../util/authCookie';

const ROLE_REDIRECTS: Record<string, string> = Object.assign(
  Object.create(null),
  { ADMIN: '/admin', CUSTOMER: '/' },
);

function extractRole(payload: unknown): string | undefined {
  if (typeof payload !== 'object' || payload === null) return undefined;
  const user = 'user' in payload ? payload.user : undefined;
  for (const source of [payload, user]) {
    if (
      typeof source === 'object' &&
      source !== null &&
      'role' in source &&
      typeof source.role === 'string'
    ) {
      return source.role.trim().toUpperCase();
    }
  }
  return undefined;
}

function extractToken(payload: unknown): string | undefined {
  return typeof payload === 'object' &&
    payload !== null &&
    'token' in payload &&
    typeof payload.token === 'string' &&
    payload.token.length > 0
    ? payload.token
    : undefined;
}

export class LoginController {
  constructor(
    private readonly backendOrigin: string,
    private readonly loginSession: LoginSession,
  ) {}

  private render(
    res: Response,
    status = 200,
    email = '',
    errorMessage = '',
  ): void {
    res.setHeader('Cache-Control', 'no-store');
    res.render(
      'login',
      { email, errorMessage, currentYear: new Date().getFullYear() },
      (error: Error | null, html: string) => {
        if (error) {
          console.error('Unable to load the login page:', error);
          res.redirect('/unavailable');
          return;
        }
        res.status(status).type('html').send(html);
      },
    );
  }

  show = (_req: Request, res: Response): void => {
    this.render(res);
  };

  submit = async (req: Request, res: Response): Promise<void> => {
    if (!req.is('application/x-www-form-urlencoded')) {
      this.render(res, 415, '', 'Please submit the login form.');
      return;
    }

    const body: unknown = req.body;
    if (typeof body !== 'object' || body === null) {
      this.render(res, 400, '', 'Please enter your email and password.');
      return;
    }
    const email =
      'email' in body && typeof body.email === 'string'
        ? body.email.trim()
        : '';
    const password =
      'password' in body && typeof body.password === 'string'
        ? body.password
        : '';

    if (!email || email.length > 254 || !password || password.length > 128) {
      this.render(res, 400, email, 'Please enter your email and password.');
      return;
    }

    let response: globalThis.Response;
    let role: string | undefined;
    let token: string | undefined;
    try {
      response = await fetch(new URL('/api/auth/login', this.backendOrigin), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
        redirect: 'manual',
        signal: AbortSignal.timeout(10_000),
      });
      if (response.status !== 200) await response.body?.cancel();
      if (response.status === 200) {
        const payload: unknown = await response.json().catch(() => null);
        role = extractRole(payload);
        token = extractToken(payload);
      } else {
        await response.body?.cancel();
      }
    } catch (error) {
      console.error('Unable to reach the backend login API:', error);
      this.render(
        res,
        502,
        email,
        'Unable to reach the server. Please try again later.',
      );
      return;
    }

    if (response.status === 200) {
      try {
        const body: unknown = await response.json();
        let userId: unknown;
        let accountName = 'Account';
        if (typeof body === 'object' && body !== null) {
          const account =
            'user' in body &&
            typeof body.user === 'object' &&
            body.user !== null
              ? body.user
              : body;
          userId =
            'id' in account
              ? account.id
              : 'userId' in account
                ? account.userId
                : undefined;
          const firstName =
            'firstName' in account && typeof account.firstName === 'string'
              ? account.firstName.trim()
              : '';
          const lastName =
            'lastName' in account && typeof account.lastName === 'string'
              ? account.lastName.trim()
              : '';
          const accountEmail =
            'email' in account && typeof account.email === 'string'
              ? account.email.trim()
              : '';
          accountName =
            [firstName, lastName].filter(Boolean).join(' ') ||
            accountEmail ||
            'Account';
        }
        await this.loginSession.save(res, userId, accountName);
      } catch (error) {
        console.error(
          'Unable to validate the login session:',
          error instanceof Error ? error.name : 'Unknown error',
        );
        this.render(
          res,
          502,
          email,
          'Unable to confirm your login. Please try again.',
      const destination = role ? ROLE_REDIRECTS[role] : undefined;
      if (!destination) {
        console.error('Backend login returned an unknown role:', role);
        this.render(
          res,
          403,
          email,
          'Your account role is not recognised. Please contact support.',
        );
        return;
      }
      res.setHeader('Cache-Control', 'no-store');
      if (token) {
        setAuthCookie(res, token);
      } else {
        clearAuthCookie(res);
      }
      res.redirect(303, destination);
    } else if (response.status === 401) {
      this.render(res, 401, email, 'Incorrect email or password.');
    } else {
      console.error('Backend login failed with status:', response.status);
      this.render(res, 502, email, 'Unable to log in. Please try again later.');
    }
  };
}
