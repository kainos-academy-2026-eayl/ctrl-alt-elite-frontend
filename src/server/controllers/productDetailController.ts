import type { Request, Response } from 'express';
import type { BasketResponseDto } from '../../dtos/basketDto';
import { renderErrorPage } from '../../middleware/errorHandler';
import { buildProductDetailPage } from '../../views/product-detail.page';
import type { CatalogService } from '../services/catalog-service';

const MAX_PRODUCT_ID_LENGTH = 100;

/**
 * Handles GET /products/:id. It only deals with the request and response;
 * CatalogService loads the product and product-detail.page.ts builds the data
 * that product-detail.njk renders.
 */
export class ProductDetailController {
  constructor(
    private readonly catalogService: CatalogService,
    private readonly getHeaderBasket: (
      req: Request,
    ) => Promise<BasketResponseDto | null>,
  ) {}

  show = async (req: Request, res: Response): Promise<void> => {
    const productId = String(req.params.id ?? '').trim();
    if (productId === '' || productId.length > MAX_PRODUCT_ID_LENGTH) {
      renderErrorPage(res, 404);
      return;
    }

    const basketPromise = this.getHeaderBasket(req);
    let product: Awaited<ReturnType<CatalogService['getProduct']>>;
    try {
      product = await this.catalogService.getProduct(productId);
    } catch (error) {
      console.error('Unable to load the product:', error);
      renderErrorPage(res, 503);
      return;
    }
    if (product === null) {
      renderErrorPage(res, 404);
      return;
    }

    const page = buildProductDetailPage({
      product,
      basket: await basketPromise,
      now: new Date(),
    });
    res.render('product-detail', page, (error: Error | null, html: string) => {
      if (error) {
        console.error('Unable to load the product page:', error);
        renderErrorPage(res);
        return;
      }
      res.type('html').send(html);
    });
  };
}
