// Every admin portal section is guarded by one of these permissions.
export type StaffPermission =
  | 'dashboard'
  | 'orders'
  | 'customers'
  | 'support'
  | 'inventory'
  | 'reports'
  | 'settings';

export enum Role {
  CUSTOMER = 'CUSTOMER',
  ADMIN = 'ADMIN',
  CUSTOMER_SERVICE = 'CUSTOMER_SERVICE',
}

export interface StaffRole {
  key: Role;
  label: string;
  dashboardPath: string;
  dashboardTemplate: string;
  permissions: readonly StaffPermission[];
}

export const STAFF_ROLES: Readonly<Partial<Record<Role, StaffRole>>> = {
  [Role.ADMIN]: {
    key: Role.ADMIN,
    label: 'Administrator',
    dashboardPath: '/admin',
    dashboardTemplate: 'admin/dashboard.njk',
    permissions: [
      'dashboard',
      'orders',
      'customers',
      'support',
      'inventory',
      'reports',
      'settings',
    ],
  },

  [Role.CUSTOMER_SERVICE]: {
    key: Role.CUSTOMER_SERVICE,
    label: 'Customer Service',
    dashboardPath: '/admin/customer-service',
    dashboardTemplate: 'admin/customer-service-dashboard.njk',
    permissions: ['dashboard', 'orders', 'customers', 'support', 'settings'],
  },
};

// Accepts "customer service", "Customer-Service"
// and "CUSTOMER_SERVICE" alike.
export function normaliseRole(role: unknown): Role | undefined {
  if (typeof role !== 'string') {
    return undefined;
  }

  const key = role
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, '_');

  return Object.values(Role).includes(key as Role) ? (key as Role) : undefined;
}

export function findStaffRole(role: unknown): StaffRole | undefined {
  const key = normaliseRole(role);

  return key ? STAFF_ROLES[key] : undefined;
}

// Where a freshly logged-in user lands.
export function landingPathForRole(role: unknown): string | undefined {
  const key = normaliseRole(role);

  if (key === Role.CUSTOMER) {
    return '/';
  }

  return key ? STAFF_ROLES[key]?.dashboardPath : undefined;
}

export function hasPermission(
  role: StaffRole,
  permission: StaffPermission,
): boolean {
  return role.permissions.includes(permission);
}
