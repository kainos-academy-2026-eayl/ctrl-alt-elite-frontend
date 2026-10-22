/*
 * TEMPORARY sample products so the basket can be tested before the product
 * ticket is complete. To remove: delete this file and the SAMPLE_PRODUCTS
 * import/usage in src/app.ts, then pass the real products to the homepage.
 * The ids must exist in the backend's product catalogue (prisma/seed.ts), which
 * is the source of truth for prices in the basket.
 */

export interface Product {
  id: string;
  name: string;
  /** Price in pounds as a 2 decimal place string, e.g. "24.99". */
  price: string;
}

export const SAMPLE_PRODUCTS: readonly Product[] = [
  { id: 'sample-lamp', name: 'Desk Lamp', price: '24.99' },
  { id: 'sample-mug', name: 'Ceramic Mug', price: '5.50' },
  { id: 'sample-keyboard', name: 'Wireless Keyboard', price: '49.00' },
  {
    id: 'sample-headphones',
    name: 'Noise-Cancelling Headphones',
    price: '129.99',
  },
  { id: 'sample-notebook', name: 'A5 Notebook', price: '3.75' },
  { id: 'sample-bottle', name: 'Water Bottle', price: '12.00' },
];
