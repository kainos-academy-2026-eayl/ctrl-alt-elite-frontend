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

export function findAdminModule(slug: string): AdminNavItem | undefined {
  return ADMIN_NAV_ITEMS.find(
    (item) => item.slug === slug && item.slug !== 'dashboard',
  );
}
