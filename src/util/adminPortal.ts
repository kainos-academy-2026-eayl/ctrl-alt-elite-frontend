import {
  hasPermission,
  type StaffPermission,
  type StaffRole,
} from './staffRoles';

export interface AdminNavItem {
  // Identifies the menu entry so the current page can be highlighted.
  key: string;
  // The permission a role needs to see the entry.
  slug: StaffPermission;
  label: string;
  href: string;
}

export const ADMIN_NAV_ITEMS: readonly AdminNavItem[] = [
  { key: 'dashboard', slug: 'dashboard', label: 'Dashboard', href: '/admin' },
  { key: 'orders', slug: 'orders', label: 'Orders', href: '/admin/orders' },
  {
    key: 'customers',
    slug: 'customers',
    label: 'Customers',
    href: '/admin/customers',
  },
  {
    key: 'support',
    slug: 'support',
    label: 'Support Tickets',
    href: '/admin/support',
  },
  {
    key: 'inventory',
    slug: 'inventory',
    label: 'Products',
    href: '/admin/inventory',
  },
  {
    key: 'stock-dashboard',
    slug: 'stock-dashboard',
    label: 'Inventory Dashboard',
    href: '/admin/stock/dashboard',
  },
  { key: 'stock', slug: 'stock', label: 'Inventory', href: '/admin/stock' },
  { key: 'reports', slug: 'reports', label: 'Reports', href: '/admin/reports' },
  {
    key: 'settings',
    slug: 'settings',
    label: 'Settings',
    href: '/admin/settings',
  },
];

// These entries have their own pages, so they are not placeholder modules.
const NON_MODULE_KEYS: ReadonlySet<string> = new Set([
  'dashboard',
  'orders',
  'reports',
  'stock-dashboard',
  'stock',
]);

// The Dashboard entry points at the dashboard of the signed-in role.
export function navItemsForRole(role: StaffRole): AdminNavItem[] {
  return ADMIN_NAV_ITEMS.filter((item) => hasPermission(role, item.slug)).map(
    (item) =>
      item.key === 'dashboard' ? { ...item, href: role.dashboardPath } : item,
  );
}

export function findAdminModule(slug: string): AdminNavItem | undefined {
  return ADMIN_NAV_ITEMS.find(
    (item) => item.key === slug && !NON_MODULE_KEYS.has(item.key),
  );
}
