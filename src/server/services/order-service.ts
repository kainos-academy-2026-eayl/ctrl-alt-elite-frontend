export type OrderProduct = {
  product_id: string;
  amount: number;
  unit_price_pence: number;
};

export type OrderInformation = {
  id: string | number;
  order_total: number;
  order_status: string;
  createdAt: string;
  delivery_price_pence: number;
  products: OrderProduct[];
};

function isOrderProduct(value: unknown): value is OrderProduct {
  return (
    typeof value === 'object' &&
    value !== null &&
    'product_id' in value &&
    typeof value.product_id === 'string' &&
    'amount' in value &&
    typeof value.amount === 'number' &&
    Number.isSafeInteger(value.amount) &&
    value.amount > 0 &&
    'unit_price_pence' in value &&
    typeof value.unit_price_pence === 'number' &&
    Number.isSafeInteger(value.unit_price_pence) &&
    value.unit_price_pence >= 0
  );
}

function isOrder(value: unknown): value is OrderInformation {
  return (
    typeof value === 'object' &&
    value !== null &&
    'id' in value &&
    (typeof value.id === 'string' ||
      (typeof value.id === 'number' && Number.isSafeInteger(value.id))) &&
    'order_total' in value &&
    typeof value.order_total === 'number' &&
    Number.isFinite(value.order_total) &&
    'order_status' in value &&
    typeof value.order_status === 'string' &&
    'createdAt' in value &&
    typeof value.createdAt === 'string' &&
    Number.isFinite(Date.parse(value.createdAt)) &&
    'delivery_price_pence' in value &&
    typeof value.delivery_price_pence === 'number' &&
    Number.isSafeInteger(value.delivery_price_pence) &&
    value.delivery_price_pence >= 0 &&
    'products' in value &&
    Array.isArray(value.products) &&
    value.products.every(isOrderProduct)
  );
}

export class OrderService {
  constructor(private readonly backendOrigin: string) {}

  async getOrders(token: string): Promise<{ orders: OrderInformation[] }> {
    if (!token.trim()) {
      throw new Error('An authentication token is required to fetch orders.');
    }

    const response = await fetch(new URL('/api/orders', this.backendOrigin), {
      method: 'GET',
      headers: {
        accept: 'application/json',
        authorization: `Bearer ${token}`,
      },
      cache: 'no-store',
    });

    if (!response.ok) {
      throw new Error(`Orders API returned ${response.status}.`);
    }

    const payload: unknown = await response.json();
    if (
      typeof payload !== 'object' ||
      payload === null ||
      !('orders' in payload) ||
      !Array.isArray(payload.orders) ||
      !payload.orders.every(isOrder)
    ) {
      throw new Error('The orders API returned an unexpected response.');
    }

    return { orders: payload.orders };
  }
}
