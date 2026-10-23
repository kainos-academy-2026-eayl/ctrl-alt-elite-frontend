import { SignJWT } from 'jose';

export const TEST_JWT_SECRET =
  'test-only-frontend-jwt-secret-at-least-32-bytes';

export function issueLoginToken(
  claims: Record<string, unknown> = {},
  secret = TEST_JWT_SECRET,
  algorithm = 'HS256',
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({
    sub: 'user-1',
    iss: 'ctrl-alt-elite-frontend',
    aud: 'ctrl-alt-elite-homepage',
    iat: now,
    exp: now + 3600,
    ...claims,
  })
    .setProtectedHeader({ alg: algorithm, typ: 'JWT' })
    .sign(new TextEncoder().encode(secret));
}
