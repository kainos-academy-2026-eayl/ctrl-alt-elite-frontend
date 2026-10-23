import type { Request, Response } from 'express';
import {
  clearAuthCookie,
  readAuthCookie,
  setAuthCookie,
} from '../../util/authCookie';
import type { LoginSession } from '../../util/loginSession';

const ROLE_REDIRECTS: Record<string, string> = Object.assign(
  Object.create(null),
  { ADMIN: '/admin', CUSTOMER: '/' },
);

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null
    ? (value as Record<string, unknown>)
    : undefined;
}

function accountFrom(payload: unknown): Record<string, unknown> | undefined {
  const record = asRecord(payload);
  return asRecord(record?.user) ?? record;
}

function extractRole(payload: unknown): string | undefined {
  const record = asRecord(payload);
  const user = asRecord(record?.user);
  for (const source of [record, user]) {
    if (typeof source?.role === 'string') {
      return source.role.trim().toUpperCase();
    }
  }
  return undefined;
}

function extractToken(payload: unknown): string | undefined {
  const token = asRecord(payload)?.token;
  return typeof token === 'string' && token.length > 0 ? token : undefined;
}

function extractUserId(
  account: Record<string, unknown> | undefined,
): string | undefined {
  const id = account?.id ?? account?.userId;
  if (typeof id === 'string' && id.trim()) return id;
  if (typeof id === 'number' && Number.isSafeInteger(id)) return String(id);
  return undefined;
}

function extractAccountName(
  account: Record<string, unknown> | undefined,
): string {
  const firstName =
    typeof account?.firstName === 'string' ? account.firstName.trim() : '';
  const lastName =
    typeof account?.lastName === 'string' ? account.lastName.trim() : '';
  const email = typeof account?.email === 'string' ? account.email.trim() : '';
  return [firstName, lastName].filter(Boolean).join(' ') || email || 'Account';
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
    let payload: unknown;
    try {
      response = await fetch(new URL('/api/auth/login', this.backendOrigin), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
        redirect: 'manual',
        signal: AbortSignal.timeout(10_000),
      });
      if (response.status === 200) {
        payload = await response.json().catch(() => null);
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
      const account = accountFrom(payload);
      const userId = extractUserId(account);
      const role = extractRole(payload);
      const destination = role ? ROLE_REDIRECTS[role] : undefined;
      if (!destination) {
        if (!role && !userId && payload !== null) {
          console.error(
            'Backend login did not identify an authenticated user.',
          );
          this.render(
            res,
            502,
            email,
            'Unable to confirm your login. Please try again.',
          );
          return;
        }
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
      const token = extractToken(payload);
      try {
        if (this.loginSession.isConfigured) {
          if (userId) {
            await this.loginSession.save(
              res,
              userId,
              extractAccountName(account),
            );
          } else {
            this.loginSession.clear(res);
          }
        }
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
        );
        return;
      }
      if (token) {
        setAuthCookie(res, token);
      } else if (readAuthCookie(req.headers.cookie)) {
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
