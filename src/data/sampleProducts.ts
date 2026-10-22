/*
 * TEMPORARY sample products so the basket can be tested before the product
 * ticket is complete. To remove: delete this file and the SAMPLE_PRODUCTS
 * import/usage in src/app.ts, then pass the real products to the homepage and
 * the search page.
 * The ids must exist in the backend's product catalogue (prisma/seed.ts), which
 * is the source of truth for prices in the basket.
 */

export interface Product {
  id: string;
  name: string;
  description: string;
  imageUrl: string;
  /** Price in pounds as a 2 decimal place string, e.g. "24.99". */
  price: string;
  keywords: readonly string[];
  isInStock: boolean;
}

const PLACEHOLDER_IMAGE = '/assets/images/placeholder.svg';

export const SAMPLE_PRODUCTS: readonly Product[] = [
  {
    id: 'sample-lamp',
    name: 'Desk Lamp',
    description: 'Adjustable LED lamp with a warm and a cool light setting.',
    imageUrl: PLACEHOLDER_IMAGE,
    price: '24.99',
    keywords: ['light', 'lighting', 'office', 'desk'],
    isInStock: true,
  },
  {
    id: 'sample-mug',
    name: 'Ceramic Mug',
    description: 'Dishwasher-safe 350ml mug for tea and coffee.',
    imageUrl: PLACEHOLDER_IMAGE,
    price: '5.50',
    keywords: ['cup', 'coffee', 'tea', 'kitchen'],
    isInStock: true,
  },
  {
    id: 'sample-keyboard',
    name: 'Wireless Keyboard',
    description: 'Slim bluetooth keyboard with a quiet typing action.',
    imageUrl: PLACEHOLDER_IMAGE,
    price: '49.00',
    keywords: ['computer', 'typing', 'bluetooth', 'office'],
    isInStock: true,
  },
  {
    id: 'sample-headphones',
    name: 'Noise-Cancelling Headphones',
    description: 'Over-ear headphones with active noise cancelling.',
    imageUrl: PLACEHOLDER_IMAGE,
    price: '129.99',
    keywords: ['headphone', 'audio', 'music', 'headset'],
    isInStock: true,
  },
  {
    id: 'sample-notebook',
    name: 'A5 Notebook',
    description: 'Lined A5 notebook with 120 pages.',
    imageUrl: PLACEHOLDER_IMAGE,
    price: '3.75',
    keywords: ['paper', 'stationery', 'journal', 'notes'],
    isInStock: true,
  },
  {
    id: 'sample-bottle',
    name: 'Water Bottle',
    description: 'Insulated 500ml steel bottle that keeps drinks cold.',
    imageUrl: PLACEHOLDER_IMAGE,
    price: '12.00',
    keywords: ['drink', 'flask', 'hydration', 'travel'],
    isInStock: true,
  },
  {
    id: 'sample-studio-headphones',
    name: 'Studio Headphones',
    description: 'Wired studio headphones with a flat sound profile.',
    imageUrl: PLACEHOLDER_IMAGE,
    price: '89.00',
    keywords: ['headphone', 'audio', 'music', 'wired'],
    isInStock: false,
  },
  {
    id: 'sample-earbuds',
    name: 'Wireless Earbuds',
    description: 'Compact earbuds with a charging case.',
    imageUrl: PLACEHOLDER_IMAGE,
    price: '59.99',
    keywords: ['earphone', 'audio', 'music', 'bluetooth'],
    isInStock: false,
  },
];
