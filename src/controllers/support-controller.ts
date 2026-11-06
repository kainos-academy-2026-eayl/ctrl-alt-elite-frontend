import type { Request, Response } from 'express';
import { t } from '../i18n/runtime';
import { renderErrorPage } from '../middleware/errorHandler';
import {
  MAX_DESCRIPTION_LENGTH,
  MAX_SUBJECT_LENGTH,
  TICKET_CATEGORIES,
} from '../util/supportTickets';

type SupportPage = 'list' | 'new' | 'detail';

// Like the admin pages, these are page shells: src/controllers/support.ts
// loads and submits tickets through /api/support/tickets in the browser.
export class SupportController {
  private renderPage(res: Response, page: SupportPage, title: string): void {
    res.render(
      'support',
      {
        page,
        title,
        categories: TICKET_CATEGORIES,
        maxSubjectLength: MAX_SUBJECT_LENGTH,
        maxDescriptionLength: MAX_DESCRIPTION_LENGTH,
        currentYear: new Date().getFullYear(),
      },
      (error: Error | null, html: string) => {
        if (error) {
          console.error('Unable to load the support page:', error);
          renderErrorPage(res);
          return;
        }
        res.type('html').send(html);
      },
    );
  }

  showList = (_req: Request, res: Response): void => {
    this.renderPage(res, 'list', t('support.page.list'));
  };

  showNew = (_req: Request, res: Response): void => {
    this.renderPage(res, 'new', t('support.page.new'));
  };

  showDetail = (_req: Request, res: Response): void => {
    this.renderPage(res, 'detail', t('support.page.detail'));
  };
}
