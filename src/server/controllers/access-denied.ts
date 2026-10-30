import type { Response } from 'express';

export function sendAccessDenied(res: Response, message: string): void {
  res.status(403).render('access-denied.njk', { message });
}
