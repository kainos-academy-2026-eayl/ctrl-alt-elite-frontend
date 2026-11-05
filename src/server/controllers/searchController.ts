import type { Request, Response } from 'express';
import type { BasketResponseDto } from '../../dtos/basketDto';
import { t } from '../../i18n/runtime';
import { renderErrorPage } from '../../middleware/errorHandler';
import type { ProductService } from '../../services/productService';
import { readFilterQuery } from '../../util/productFilters';
import { buildSearchPage } from '../../views/search.page';

/** Matches the backend, which caps search terms at 100 characters. */
export const MAX_SEARCH_TERM_LENGTH = 100;

/** A missing, repeated or very long `q` is cleaned up rather than rejected. */
export function normaliseSearchTerm(rawTerm: unknown): string {
  if (typeof rawTerm !== 'string') return '';
  return rawTerm.trim().slice(0, MAX_SEARCH_TERM_LENGTH);
}

/**
 * Handles GET /search. It only deals with the request and response;
 * ProductService talks to the backend and search.page.ts builds the data that
 * search.njk renders.
 */
export class SearchController {
  constructor(
    private readonly productService: ProductService,
    private readonly getHeaderBasket: (
      req: Request,
    ) => Promise<BasketResponseDto | null>,
  ) {}

  show = async (req: Request, res: Response): Promise<void> => {
    const searchTerm = normaliseSearchTerm(req.query.q);
    const filters = readFilterQuery(req.query);
    const basketPromise = this.getHeaderBasket(req);

    let result = null;
    let errorMessage = '';
    if (searchTerm !== '') {
      try {
        result = await this.productService.search(searchTerm, filters);
      } catch (error) {
        console.error('Unable to search products:', error);
        errorMessage = t('search.unavailable');
        res.status(503);
      }
    }

    const page = buildSearchPage({
      searchTerm,
      filters,
      result,
      errorMessage,
      basket: await basketPromise,
      now: new Date(),
    });
    res.render('search', page, (error: Error | null, html: string) => {
      if (error) {
        console.error('Unable to load the search page:', error);
        renderErrorPage(res);
        return;
      }
      res.type('html').send(html);
    });
  };
}
