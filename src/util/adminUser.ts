import { findStaffRole, type StaffRole } from './staffRoles';

export interface AdminProfile {
  name: string;
  email: string;
  role: string;
}

function readText(record: Record<string, unknown>, key: string): string {
  const value = record[key];
  return typeof value === 'string' ? value.trim() : '';
}

// The login response and the token carry no name, so the name is looked up by
// the token's subject (user id). The token was already authorised by the admin
// guard, so it is only decoded here, never trusted for access decisions.
function readTokenSubject(token: string): string | null {
  const payload = token.split('.')[1];
  if (!payload) return null;
  try {
    const claims: unknown = JSON.parse(
      Buffer.from(payload, 'base64url').toString('utf8'),
    );
    if (
      typeof claims === 'object' &&
      claims !== null &&
      'sub' in claims &&
      typeof claims.sub === 'string' &&
      claims.sub.length > 0
    ) {
      return claims.sub;
    }
  } catch {
    // Fall through to null for a malformed token.
  }
  return null;
}

export async function loadAdminFirstName(
  backendOrigin: string,
  token: string | null,
): Promise<string | null> {
  const userId = token ? readTokenSubject(token) : null;
  if (!token || !userId) return null;

  try {
    const response = await fetch(
      new URL(
        `/api/admin/customers/${encodeURIComponent(userId)}`,
        backendOrigin,
      ),
      {
        headers: { authorization: `Bearer ${token}` },
        redirect: 'manual',
        signal: AbortSignal.timeout(3000),
      },
    );
    if (response.status !== 200) {
      await response.body?.cancel();
      return null;
    }
    const body: unknown = await response.json();
    const customer =
      typeof body === 'object' && body !== null && 'customer' in body
        ? body.customer
        : null;
    if (
      typeof customer === 'object' &&
      customer !== null &&
      'firstName' in customer &&
      typeof customer.firstName === 'string'
    ) {
      return customer.firstName.trim() || null;
    }
  } catch (error) {
    console.error('Unable to load the admin name:', error);
  }
  return null;
}

const ADMIN_PROFILE_PATH = '/api/admin/profile';

function formatRole(role: string): string {
  return findStaffRole(role)?.label ?? role;
}

export interface StaffAccount {
  profile: AdminProfile;
  // Undefined when the backend reports a role this portal has no dashboard for.
  role: StaffRole | undefined;
}

// Never throws: returns null when the backend cannot confirm who is signed in.
export async function loadStaffAccount(
  backendOrigin: string,
  token: string | null,
): Promise<StaffAccount | null> {
  if (!token) return null;

  try {
    const response = await fetch(new URL(ADMIN_PROFILE_PATH, backendOrigin), {
      headers: { authorization: `Bearer ${token}`, accept: 'application/json' },
      redirect: 'manual',
      signal: AbortSignal.timeout(3000),
    });
    if (response.status !== 200) {
      await response.body?.cancel();
      return null;
    }
    const body: unknown = await response.json();
    if (typeof body !== 'object' || body === null) return null;
    const record = body as Record<string, unknown>;
    const name = readText(record, 'name');
    const email = readText(record, 'email');
    const role = readText(record, 'role');
    if (!name || !email || !role) return null;
    return {
      profile: { name, email, role: formatRole(role) },
      role: findStaffRole(role),
    };
  } catch (error) {
    console.error('Unable to load the admin profile:', error);
    return null;
  }
}

// Never throws: the settings page shows an error message when this returns null.
export async function loadAdminProfile(
  backendOrigin: string,
  token: string | null,
): Promise<AdminProfile | null> {
  return (await loadStaffAccount(backendOrigin, token))?.profile ?? null;
}
