import type { Product } from '../data/sampleProducts';
import type { BasketResponseDto } from '../dtos/basketDto';
import { type BasketSummary, toBasketSummary } from './basket.page';

/*
 * Page model for homepage.njk: the account menu, the product cards with their
 * "Add to Basket" forms, and the header basket count.
 */

export interface HomepageProductView {
  id: string;
  name: string;
  price: string;
}

export interface HomepagePage {
  isAuthenticated: boolean;
  accountName: string;
  products: HomepageProductView[];
  basketSummary: BasketSummary;
  addToBasketUrl: string;
}

export interface HomepageInput {
  account: { name: string } | null;
  products: readonly Product[];
  basket: BasketResponseDto | null;
}

export function buildHomepage({
  account,
  products,
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
    basketSummary: toBasketSummary(basket),
    addToBasketUrl: '/basket/items',
  };
}
