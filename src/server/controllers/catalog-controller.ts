import type { Request, Response } from 'express';
import type { CatalogService } from '../services/catalog-service';

export class CatalogController {
  constructor(private readonly catalogService: CatalogService) {}

  showProducts = async (req: Request, res: Response): Promise<void> => {
    try {
      const { products, categories } = await this.catalogService.getProducts();
      // Category links in the site navigation send ?category=<name>.
      const category =
        typeof req.query?.category === 'string' &&
        categories.includes(req.query.category)
          ? req.query.category
          : null;
      res.render('product.njk', {
        products: category
          ? products.filter((product) => product.category === category)
          : products,
        categories,
        ...(category ? { selectedCategory: category } : {}),
      });
    } catch (error) {
      console.error('Unable to load products from the backend:', error);
      res.status(502).render('product.njk', {
        products: [],
        productError: 'Products are temporarily unavailable.',
      });
    }
  };
}
