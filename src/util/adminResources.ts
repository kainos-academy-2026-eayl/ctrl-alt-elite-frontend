export const ADMIN_SUMMARY_CARDS = [
  { label: 'Products', value: 0 },
  { label: 'Orders', value: 0 },
  { label: 'Customers', value: 0 },
  { label: 'Stock Alerts', value: 0 },
] as const;

export const ADMIN_QUICK_ACTIONS = [
  { label: 'Add Product', href: '/admin/inventory' },
  { label: 'View Orders', href: '/admin/orders' },
  { label: 'Manage Customers', href: '/admin/customers' },
  { label: 'Inventory Management', href: '/admin/inventory' },
] as const;

export const CUSTOMER_SERVICE_SHORTCUTS = [
  {
    label: 'Customers',
    href: '/admin/customers',
    description: 'Look up customer accounts and their details.',
  },
  {
    label: 'Orders',
    href: '/admin/orders',
    description: 'Review customer orders.',
  },
  {
    label: 'Support Tickets',
    href: '/admin/support',
    description: 'Respond to and manage support requests.',
  },
  {
    label: 'Settings',
    href: '/admin/settings',
    description: 'Manage your profile and display preferences.',
  },
] as const;

export const ADMIN_SYSTEM_STATUS = [
  { label: 'Database Connection' },
  { label: 'Backend Service' },
  { label: 'API Status' },
  { label: 'Email Service' },
] as const;
