import type { NextFunction, Request, Response } from 'express';
import { buildErrorPage } from '../views/error.page';

/** Shows error.njk with the given status, or plain text if that also fails. */
export function renderErrorPage(res: Response, status = 500): void {
  res
    .status(status)
    .render(
      'error',
      buildErrorPage(status),
      (error: Error | null, html: string) => {
        if (error) {
          console.error('Unable to load the error page:', error);
          res.type('text').send('Sorry, something went wrong.');
          return;
        }
        res.type('html').send(html);
      },
    );
}

/** Last-resort handler: any unexpected error in a route shows error.njk. */
export function errorHandler(
  error: unknown,
  _req: Request,
  res: Response,
  next: NextFunction,
): void {
  console.error('Unexpected error while handling a request:', error);
  if (res.headersSent) {
    next(error);
    return;
  }
  renderErrorPage(res, 500);
}
