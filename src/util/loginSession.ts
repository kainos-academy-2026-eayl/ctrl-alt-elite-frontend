import type { CookieOptions, Request, Response } from 'express';
import { jwtVerify, SignJWT } from 'jose';

const COOKIE_NAME = 'ctrl_alt_elite_login';

export class LoginSession {
  private readonly key: Uint8Array | undefined;
  private readonly cookieOptions: CookieOptions = {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
  };

  constructor(secret: string | undefined) {
    if (secret !== undefined && Buffer.byteLength(secret, 'utf8') < 32) {
      throw new Error('JWT_SECRET must contain at least 32 bytes.');
    }
    this.key = secret ? new TextEncoder().encode(secret) : undefined;
  }

  private async verify(token: string) {
    if (!this.key) throw new Error('JWT_SECRET is not configured.');
    if (token.length > 3800) throw new Error('Login token is too large.');
    const { payload } = await jwtVerify(token, this.key, {
      algorithms: ['HS256'],
      issuer: 'ctrl-alt-elite-frontend',
      audience: 'ctrl-alt-elite-homepage',
      requiredClaims: ['sub', 'iat', 'exp'],
      maxTokenAge: '1h',
    });
    if (
      typeof payload.sub !== 'string' ||
      !payload.sub ||
      typeof payload.exp !== 'number'
    ) {
      throw new Error('Login token has no valid identity or expiry.');
    }
    return payload;
  }

  async save(res: Response, userId: string, name: string): Promise<void> {
    if (!userId.trim() || userId.length > 128) {
      throw new Error('Backend login did not identify an authenticated user.');
    }
    if (!this.key) throw new Error('JWT_SECRET is not configured.');
    const expiresAt = Math.floor(Date.now() / 1000) + 3600;
    const token = await new SignJWT({ name })
      .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
      .setSubject(userId)
      .setIssuer('ctrl-alt-elite-frontend')
      .setAudience('ctrl-alt-elite-homepage')
      .setIssuedAt()
      .setExpirationTime(expiresAt)
      .sign(this.key);
    res.cookie(COOKIE_NAME, token, {
      ...this.cookieOptions,
      expires: new Date(expiresAt * 1000),
    });
  }

  async getAccount(
    req: Request,
    res: Response,
  ): Promise<{ name: string } | null> {
    const cookies = (req.headers.cookie ?? '')
      .split(';')
      .map((cookie) => cookie.trim())
      .filter((cookie) => cookie.startsWith(`${COOKIE_NAME}=`));
    if (cookies.length === 0) return null;
    try {
      if (cookies.length !== 1) throw new Error('Duplicate login cookies.');
      const payload = await this.verify(
        cookies[0]?.slice(COOKIE_NAME.length + 1) ?? '',
      );
      return {
        name:
          typeof payload.name === 'string' && payload.name.trim()
            ? payload.name
            : 'Account',
      };
    } catch (error) {
      console.warn(
        'Unable to validate login; showing guest options:',
        error instanceof Error ? error.name : 'Unknown error',
      );
      this.clear(res);
      return null;
    }
  }

  clear(res: Response): void {
    res.clearCookie(COOKIE_NAME, this.cookieOptions);
  }
}
