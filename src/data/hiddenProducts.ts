/*
 * Products the homepage never shows, in Featured or on the conveyor. They are
 * the six sample products Featured used before it loaded the real catalogue.
 * The ids match the backend's product catalogue (prisma/seed.ts).
 */
export const HIDDEN_HOMEPAGE_PRODUCT_IDS: ReadonlySet<string> = new Set([
  '99a89432-b64d-4c54-b6af-71591fdb0a01', // Swaggy Jeans
  '99a89432-b64d-4c54-b6af-71591fdb0a02', // POU Shirt
  '99a89432-b64d-4c54-b6af-71591fdb0a03', // Kainos Hoodie
  '99a89432-b64d-4c54-b6af-71591fdb0a04', // Princess Dylan Crown
  '99a89432-b64d-4c54-b6af-71591fdb0a05', // Lee's Hair
  '99a89432-b64d-4c54-b6af-71591fdb0a06', // Metellica Band Shirt
]);
