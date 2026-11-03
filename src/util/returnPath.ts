const MAX_RETURN_PATH_LENGTH = 2048;
const SAFE_PATH = /^\/[A-Za-z0-9\-._~!$&'()*+,;=:@%/?]*$/;

// Only same-origin paths are accepted so a login link can never be turned
// into an open redirect. Returns null for anything else.
export function safeReturnPath(value: unknown): string | null {
  if (
    typeof value !== 'string' ||
    value.length > MAX_RETURN_PATH_LENGTH ||
    value.startsWith('//') ||
    !SAFE_PATH.test(value)
  ) {
    return null;
  }
  return value;
}

// The login page itself is never a useful place to come back to.
export function loginUrl(returnTo: string): string {
  const path = safeReturnPath(returnTo);
  if (!path || path === '/login' || path.startsWith('/login?')) return '/login';
  return `/login?returnTo=${encodeURIComponent(path)}`;
}

export function isAdminPath(path: string): boolean {
  return /^\/admin(?:[/?]|$)/.test(path);
}
