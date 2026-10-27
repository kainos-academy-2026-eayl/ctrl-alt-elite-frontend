import type { Request, Response } from 'express';
import type { CatalogeService } from '../services/cataloge.service';

export class CatalogeController {
  constructor(private readonly catalogeService: CatalogeService) {}

  showProducts = async (_req: Request, res: Response): Promise<void> => {
    try {
      const { products, categories } = await this.catalogeService.getProducts();
      res.render('product.njk', { products, categories });
    } catch (error) {
      console.error('Unable to load products from the backend:', error);
      res.status(502).render('product.njk', {
        products: [],
        productError: 'Products are temporarily unavailable.',
      });
    }
  };
}
