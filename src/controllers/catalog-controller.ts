import type { Request, Response } from 'express';
import { t, tCount } from '../i18n/runtime';
import type { CatalogService } from '../services/catalog-service';
import { buildFilterPanel, readFilterQuery } from '../util/productFilters';

function productCount(count: number): string {
  return tCount('count.products', count);
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
            ? t('catalogue.noMatches')
            : t('catalogue.showing', {
                count: products.length,
                total: productCount(total),
              });
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
        productError: t('catalogue.unavailable'),
      });
    }
  };
}
