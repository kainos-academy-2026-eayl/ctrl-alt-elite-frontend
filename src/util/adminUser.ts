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
