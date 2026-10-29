// Every admin portal section is guarded by one of these permissions. A role
// only gets the sections listed in its `permissions`, so adding a staff role
// (Finance, Super Admin, ...) means adding one entry to STAFF_ROLES.
export type StaffPermission =
  | 'dashboard'
  | 'orders'
  | 'customers'
  | 'support'
  | 'inventory'
  | 'reports'
  | 'settings';

export interface StaffRole {
  key: string;
  label: string;
  dashboardPath: string;
  dashboardTemplate: string;
  permissions: readonly StaffPermission[];
}

export const STAFF_ROLES: Readonly<Record<string, StaffRole>> = Object.assign(
  Object.create(null),
  {
    ADMIN: {
      key: 'ADMIN',
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
    CUSTOMER_SERVICE: {
      key: 'CUSTOMER_SERVICE',
      label: 'Customer Service',
      dashboardPath: '/admin/customer-service',
      dashboardTemplate: 'admin/customer-service-dashboard.njk',
      permissions: ['dashboard', 'orders', 'customers', 'support', 'settings'],
    },
  } satisfies Record<string, StaffRole>,
);

export const CUSTOMER_ROLE_KEY = 'CUSTOMER';

// Accepts "customer service", "Customer-Service" and "CUSTOMER_SERVICE" alike.
export function normaliseRole(role: unknown): string | undefined {
  if (typeof role !== 'string') return undefined;
  const key = role
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, '_');
  return key || undefined;
}

export function findStaffRole(role: unknown): StaffRole | undefined {
  const key = normaliseRole(role);
  return key ? STAFF_ROLES[key] : undefined;
}

// Where a freshly logged-in user lands.
export function landingPathForRole(role: unknown): string | undefined {
  const key = normaliseRole(role);
  if (key === CUSTOMER_ROLE_KEY) return '/';
  return key ? STAFF_ROLES[key]?.dashboardPath : undefined;
}

export function hasPermission(
  role: StaffRole,
  permission: StaffPermission,
): boolean {
  return role.permissions.includes(permission);
}
