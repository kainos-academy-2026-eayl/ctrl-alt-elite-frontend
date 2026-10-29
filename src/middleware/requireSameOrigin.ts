import type { NextFunction, Request, Response } from 'express';

/** Rejects form posts from other sites (cross-site request forgery). */
export function requireSameOrigin(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const source = req.get('origin') ?? req.get('referer');
  if (source) {
    try {
      const requestOrigin = new URL(`${req.protocol}://${req.get('host')}`)
        .origin;
      if (new URL(source).origin === requestOrigin) {
        next();
        return;
      }
    } catch {
      // Reject malformed origin and referer values.
    }
  }
  res.status(403).type('text').send('Forbidden');
}
