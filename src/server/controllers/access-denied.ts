import type { Response } from 'express';

export function sendAccessDenied(res: Response, message: string): void {
  res
    .status(403)
    .type('html')
    .send(
      '<!doctype html><html lang="en"><head><meta charset="utf-8" />' +
        '<title>Access denied | Ctrl-Alt-Elite</title></head><body>' +
        '<h1>Access denied</h1>' +
        `<p>${message}</p>` +
        '<p><a href="/">Return to the homepage</a></p></body></html>',
    );
}
