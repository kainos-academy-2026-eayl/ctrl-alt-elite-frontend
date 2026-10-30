import type { BasketResponseDto } from '../dtos/basketDto';
import type { CatalogProduct } from '../server/services/catalog-service';
import { type BasketSummary, toBasketSummary } from './basket.page';

/*
 * Page model for product-detail.njk: one product with its "Add to Basket"
 * form, and the header basket count.
 */

export interface ProductDetailPage {
  product: {
    id: string;
    name: string;
    category: string;
    description: string;
    imageUrl: string;
    price: string;
    stockLabel: string;
    isAvailable: boolean;
  };
  basketSummary: BasketSummary;
  addToBasketUrl: string;
  currentYear: number;
}

export interface ProductDetailInput {
  product: CatalogProduct;
  basket: BasketResponseDto | null;
  now: Date;
}

export function buildProductDetailPage({
  product,
  basket,
  now,
}: ProductDetailInput): ProductDetailPage {
  return {
    product: {
      id: String(product.id),
      name: product.name,
      category: product.category,
      description: product.description,
      imageUrl: product.image,
      price: product.priceLabel,
      stockLabel: product.stockLabel,
      isAvailable: product.available,
    },
    basketSummary: toBasketSummary(basket),
    addToBasketUrl: '/basket/items',
    currentYear: now.getFullYear(),
  };
}
