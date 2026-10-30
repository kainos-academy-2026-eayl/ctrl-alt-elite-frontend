import type { Product } from '../data/sampleProducts';
import type { BasketResponseDto } from '../dtos/basketDto';
import type { PopularProductDto } from '../dtos/popularProductsDto';
import {
  type BasketSummary,
  formatPrice,
  toBasketSummary,
} from './basket.page';

/*
 * Page model for homepage.njk: the account menu, the product conveyor, the
 * product cards with their "Add to Basket" forms, and the header basket count.
 */

export interface HomepageProductView {
  id: string;
  name: string;
  price: string;
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
  products: readonly Product[];
  /** Best sellers from the backend's popular products API. */
  conveyorProducts?: readonly PopularProductDto[];
  basket: BasketResponseDto | null;
}

export function buildHomepage({
  account,
  products,
  conveyorProducts = [],
  basket,
}: HomepageInput): HomepagePage {
  return {
    isAuthenticated: account !== null,
    accountName: account?.name ?? 'Account',
    products: products.map(({ id, name, price }) => ({
      id,
      name,
      price: `£${price}`,
    })),
    conveyorCards: conveyorProducts.map((product) => ({
      name: product.name,
      imageUrl: product.imageUrl,
      price: formatPrice(Math.round(Number(product.price) * 100)),
      url: `/products/${encodeURIComponent(product.id)}`,
    })),
    basketSummary: toBasketSummary(basket),
    addToBasketUrl: '/basket/items',
  };
}
