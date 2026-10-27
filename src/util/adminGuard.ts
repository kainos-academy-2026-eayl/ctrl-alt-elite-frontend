import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { readAuthCookie } from './authCookie';

// The backend is the source of truth for roles, so the guard asks it to
// authorise the caller against an admin-only endpoint instead of trusting
// anything the browser holds.
const ADMIN_CHECK_PATH = '/api/admin/customers?pageSize=1';

export function createAdminGuard(backendOrigin: string): RequestHandler {
  const origin = new URL(backendOrigin).origin;

  return async (req: Request, res: Response, next: NextFunction) => {
    res.setHeader('Cache-Control', 'no-store');

    const token = readAuthCookie(req.headers.cookie);
    if (!token) {
      res.redirect(303, '/login');
      return;
    }

    let status: number;
    try {
      const response = await fetch(`${origin}${ADMIN_CHECK_PATH}`, {
        headers: { authorization: `Bearer ${token}` },
        redirect: 'manual',
        signal: AbortSignal.timeout(10_000),
      });
      await response.body?.cancel();
      status = response.status;
    } catch (error) {
      console.error('Unable to verify admin access with the backend:', error);
      res.redirect('/unavailable');
      return;
    }

    if (status === 200) {
      next();
    } else if (status === 401) {
      res.redirect(303, '/login');
    } else if (status === 403) {
      res
        .status(403)
        .type('html')
        .send(
          '<!doctype html><html lang="en"><head><meta charset="utf-8" />' +
            '<title>Access denied | Ctrl-Alt-Elite</title></head><body>' +
            '<h1>Access denied</h1>' +
            '<p>You do not have permission to view the admin area.</p>' +
            '<p><a href="/">Return to the homepage</a></p></body></html>',
        );
    } else {
      console.error('Backend admin check failed with status:', status);
      res.redirect('/unavailable');
    }
  };
}
