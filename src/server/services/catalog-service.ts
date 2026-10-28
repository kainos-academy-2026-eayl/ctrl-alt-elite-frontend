type BackendProduct = {
  id: string | number;
  name: string;
  category: string;
  price: number | string;
  image: string;
  description: string;
  stock?: unknown;
};

type CatalogProduct = Omit<BackendProduct, 'stock'> & {
  stock: number | null;
  stockLabel: string;
  available: boolean;
  priceLabel: string;
};

function getStock(value: unknown): number | null {
  if (
    typeof value !== 'number' &&
    (typeof value !== 'string' || value.trim() === '')
  ) {
    return null;
  }

  const stock = Number(value);
  return Number.isSafeInteger(stock) && stock >= 0 ? stock : null;
}

function getProducts(payload: unknown): BackendProduct[] {
  if (Array.isArray(payload)) return payload as BackendProduct[];

  if (
    typeof payload === 'object' &&
    payload !== null &&
    'products' in payload &&
    Array.isArray(payload.products)
  ) {
    return payload.products as BackendProduct[];
  }

  throw new Error('The products API returned an unexpected response.');
}

export class CatalogService {
  constructor(private readonly backendOrigin: string) {}

  async getProducts(): Promise<{
    products: CatalogProduct[];
    categories: string[];
  }> {
    const response = await fetch(new URL('/api/products', this.backendOrigin), {
      headers: { accept: 'application/json' },
    });

    if (!response.ok) {
      throw new Error(`Products API returned ${response.status}.`);
    }

    const records = getProducts(await response.json());
    const products = records.map((product) => {
      const stock = getStock(product.stock);
      return {
        ...product,
        stock,
        stockLabel:
          stock === null
            ? 'Stock unavailable'
            : stock === 0
              ? 'Out of stock'
              : `${stock} in stock`,
        available: stock !== null && stock > 0,
        priceLabel: new Intl.NumberFormat('en-GB', {
          style: 'currency',
          currency: 'GBP',
        }).format(Number(product.price)),
      };
    });

    const categories = [
      ...new Set(products.map((product) => product.category)),
    ];
    return { products, categories };
  }
}
