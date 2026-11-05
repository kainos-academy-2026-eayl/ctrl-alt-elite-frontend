import type { Request, Response } from 'express';
import type { Environment } from 'nunjucks';

export class StatusController {
  constructor(private readonly templates: Environment) {}

  showUnavailable = (_req: Request, res: Response): void => {
    try {
      const unavailablePage = this.templates.render('unavailable.njk');
      res.status(503).type('html').send(unavailablePage);
    } catch (error) {
      console.error('Unable to load the unavailable page:', error);
      res
        .status(500)
        .type('text')
        .send('The website is currently unavailable.');
    }
  };

  health = (_req: Request, res: Response): void => {
    res.json({ status: 'ok', uptime: process.uptime() });
  };
}
