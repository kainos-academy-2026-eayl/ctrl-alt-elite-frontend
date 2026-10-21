export type Role = 'ADMIN' | 'CUSTOMER';

export function getRedirectPath(role: unknown): string {
  return role === 'ADMIN' ? '/admin' : '/';
}
