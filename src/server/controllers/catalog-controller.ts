import type { Request, Response } from 'express';
import { buildFilterPanel, readFilterQuery } from '../../util/productFilters';
import type { CatalogService } from '../services/catalog-service';

function productCount(count: number): string {
  return `${count} ${count === 1 ? 'product' : 'products'}`;
}

export class CatalogController {
  constructor(private readonly catalogService: CatalogService) {}

  showProducts = async (req: Request, res: Response): Promise<void> => {
    const filters = readFilterQuery(req.query);
    try {
      const { products, categories, facets } =
        await this.catalogService.getProducts(filters);
      const filterPanel =
        facets && facets.total > 0
          ? buildFilterPanel({
              action: '/products',
              searchTerm: null,
              query: filters,
              facets,
            })
          : null;
      const total = facets?.total ?? products.length;
      let resultsSummary = productCount(products.length);
      if (filterPanel && filterPanel.activeCount > 0) {
        resultsSummary =
          products.length === 0
            ? 'No products match your filters. Remove a filter or choose Clear all.'
            : `Showing ${products.length} of ${productCount(total)}`;
      }
      res.render('product.njk', {
        products,
        categories,
        filterPanel,
        resultsSummary,
        // A single chosen category, e.g. from the site navigation, titles the page.
        ...(filters.categories.length === 1
          ? { pageHeading: filters.categories[0] }
          : {}),
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
