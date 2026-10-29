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
  {
    id: '99a89432-b64d-4c54-b6af-71591fdb0a01',
    name: 'Swaggy Jeans',
    price: '24.99',
  },
  {
    id: '99a89432-b64d-4c54-b6af-71591fdb0a02',
    name: 'POU Shirt',
    price: '12.50',
  },
  {
    id: '99a89432-b64d-4c54-b6af-71591fdb0a03',
    name: 'Kainos Hoodie',
    price: '8.99',
  },
  {
    id: '99a89432-b64d-4c54-b6af-71591fdb0a04',
    name: 'Princess Dylan Crown',
    price: '9999.00',
  },
  {
    id: '99a89432-b64d-4c54-b6af-71591fdb0a05',
    name: "Lee's Hair",
    price: '828938392829282.00',
  },
  {
    id: '99a89432-b64d-4c54-b6af-71591fdb0a06',
    name: 'Metellica Band Shirt',
    price: '15.99',
  },
];
