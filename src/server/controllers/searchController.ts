import type { Request, Response } from 'express';
import type { BasketResponseDto } from '../../dtos/basketDto';
import { renderErrorPage } from '../../middleware/errorHandler';
import type { ProductService } from '../../services/productService';
import { buildSearchPage } from '../../views/search.page';

/** Matches the backend, which caps search terms at 100 characters. */
export const MAX_SEARCH_TERM_LENGTH = 100;
const SEARCH_FAILED_MESSAGE =
  'Search is unavailable right now. Please try again in a little while.';

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
    const basketPromise = this.getHeaderBasket(req);

    let result = null;
    let errorMessage = '';
    if (searchTerm !== '') {
      try {
        result = await this.productService.search(searchTerm);
      } catch (error) {
        console.error('Unable to search products:', error);
        errorMessage = SEARCH_FAILED_MESSAGE;
        res.status(503);
      }
    }

    const page = buildSearchPage({
      searchTerm,
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
