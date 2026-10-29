import {
  hasPermission,
  type StaffPermission,
  type StaffRole,
} from './staffRoles';

export interface AdminNavItem {
  slug: StaffPermission;
  label: string;
  href: string;
}

export const ADMIN_NAV_ITEMS: readonly AdminNavItem[] = [
  { slug: 'dashboard', label: 'Dashboard', href: '/admin' },
  { slug: 'orders', label: 'Orders', href: '/admin/orders' },
  { slug: 'customers', label: 'Customers', href: '/admin/customers' },
  { slug: 'support', label: 'Support Tickets', href: '/admin/support' },
  { slug: 'inventory', label: 'Inventory', href: '/admin/inventory' },
  { slug: 'reports', label: 'Reports', href: '/admin/reports' },
  { slug: 'settings', label: 'Settings', href: '/admin/settings' },
];

// The Dashboard entry points at the dashboard of the signed-in role.
export function navItemsForRole(role: StaffRole): AdminNavItem[] {
  return ADMIN_NAV_ITEMS.filter((item) => hasPermission(role, item.slug)).map(
    (item) =>
      item.slug === 'dashboard' ? { ...item, href: role.dashboardPath } : item,
  );
}

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

export function findAdminModule(slug: string): AdminNavItem | undefined {
  return ADMIN_NAV_ITEMS.find(
    (item) => item.slug === slug && item.slug !== 'dashboard',
  );
}
