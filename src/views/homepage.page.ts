import type { BasketResponseDto } from '../dtos/basketDto';
import { t } from '../i18n/runtime';
import type { CatalogProduct } from '../services/catalog-service';
import { type BasketSummary, toBasketSummary } from './basket.page';

/*
 * Page model for homepage.njk: the account menu, the product conveyor, the
 * product cards with their "Add to Basket" forms, and the header basket count.
 */

export interface HomepageProductView {
  id: string;
  name: string;
  price: string;
  imageUrl: string;
  detailsUrl: string;
}

/** One card on the looping product conveyor; it links to the product page. */
export interface ConveyorCardView {
  name: string;
  imageUrl: string;
  price: string;
  url: string;
}

export interface HomepagePage {
  isAuthenticated: boolean;
  accountName: string;
  products: HomepageProductView[];
  conveyorCards: ConveyorCardView[];
  basketSummary: BasketSummary;
  addToBasketUrl: string;
}

export interface HomepageInput {
  account: { name: string } | null;
  /** The Featured products, each shown with an Add to Basket form. */
  products: readonly CatalogProduct[];
  conveyorProducts?: readonly CatalogProduct[];
  basket: BasketResponseDto | null;
}

function productUrl(id: CatalogProduct['id']): string {
  return `/products/${encodeURIComponent(String(id))}`;
}

export function buildHomepage({
  account,
  products,
  conveyorProducts = [],
  basket,
}: HomepageInput): HomepagePage {
  return {
    isAuthenticated: account !== null,
    accountName: account?.name ?? t('account.label'),
    products: products.map(({ id, name, priceLabel, image }) => ({
      id: String(id),
      name,
      price: priceLabel,
      imageUrl: image,
      detailsUrl: productUrl(id),
    })),
    conveyorCards: conveyorProducts.map((product) => ({
      name: product.name,
      imageUrl: product.image,
      price: product.priceLabel,
      url: productUrl(product.id),
    })),
    basketSummary: toBasketSummary(basket),
    addToBasketUrl: '/basket/items',
  };
}
