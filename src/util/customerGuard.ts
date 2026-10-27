import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { readAuthCookie } from './authCookie';

// Only the presence of a session is checked here. The backend authorises every
// /api/support request, and the browser controller returns to the login page if
// it answers 401.
export function createCustomerGuard(): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    res.setHeader('Cache-Control', 'no-store');
    if (!readAuthCookie(req.headers.cookie)) {
      res.redirect(303, '/login');
      return;
    }
    next();
  };
}
