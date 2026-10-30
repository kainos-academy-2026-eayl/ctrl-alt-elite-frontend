import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { sendAccessDenied } from '../server/controllers/access-denied';
import { type AdminProfile, loadStaffAccount } from './adminUser';
import { readAuthCookie } from './authCookie';
import {
  hasPermission,
  type StaffPermission,
  type StaffRole,
} from './staffRoles';

export interface StaffContext {
  profile: AdminProfile;
  role: StaffRole;
}

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
      const account = await loadStaffAccount(backendOrigin, token);
      if (!account) {
        res.redirect('/unavailable');
        return;
      }
      if (!account.role) {
        console.error('Staff account has an unrecognised role.');
        sendAccessDenied(
          res,
          'You do not have permission to view the admin area.',
        );
        return;
      }
      res.locals.staff = { profile: account.profile, role: account.role };
      next();
    } else if (status === 401) {
      res.redirect(303, '/login');
    } else if (status === 403) {
      sendAccessDenied(
        res,
        'You do not have permission to view the admin area.',
      );
    } else {
      console.error('Backend admin check failed with status:', status);
      res.redirect('/unavailable');
    }
  };
}

// Set by createAdminGuard for every request that reaches an admin route.
export function getStaffContext(res: Response): StaffContext {
  return res.locals.staff as StaffContext;
}

export function requirePermission(permission: StaffPermission): RequestHandler {
  return (_req: Request, res: Response, next: NextFunction) => {
    if (hasPermission(getStaffContext(res).role, permission)) {
      next();
      return;
    }
    sendAccessDenied(res, 'You do not have permission to view this page.');
  };
}

// Role dashboards are only for their own role; everyone else is sent to theirs.
export function requireDashboardRole(roleKey: string): RequestHandler {
  return (_req: Request, res: Response, next: NextFunction) => {
    const { role } = getStaffContext(res);
    if (role.key === roleKey) {
      next();
      return;
    }
    res.redirect(303, role.dashboardPath);
  };
}
