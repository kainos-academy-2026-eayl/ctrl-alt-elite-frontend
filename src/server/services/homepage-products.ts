import { HIDDEN_HOMEPAGE_PRODUCT_IDS } from '../../data/hiddenProducts';
import type { CatalogProduct } from './catalog-service';

export const FEATURED_PRODUCT_COUNT = 6;
export const CONVEYOR_PRODUCT_COUNT = 6;

export interface HomepageProducts {
  featured: CatalogProduct[];
  conveyor: CatalogProduct[];
}

/**
 * Chooses the homepage products from the catalogue. Only in-stock products
 * that are not hidden are used. Featured is the first of them in catalogue
 * order, so it stays the same between visits. The conveyor is a random pick
 * of the rest, so it changes on each visit and never repeats a Featured
 * product.
 */
export function pickHomepageProducts(
  products: readonly CatalogProduct[],
  random: () => number = Math.random,
): HomepageProducts {
  const shown = products.filter(
    (product) =>
      product.available && !HIDDEN_HOMEPAGE_PRODUCT_IDS.has(String(product.id)),
  );
  const featured = shown.slice(0, FEATURED_PRODUCT_COUNT);
  const pool = shown.slice(FEATURED_PRODUCT_COUNT);
  const conveyor: CatalogProduct[] = [];
  while (conveyor.length < CONVEYOR_PRODUCT_COUNT && pool.length > 0) {
    const [picked] = pool.splice(Math.floor(random() * pool.length), 1);
    if (picked) conveyor.push(picked);
  }
  return { featured, conveyor };
}
