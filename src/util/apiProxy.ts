import type { Request, RequestHandler, Response } from 'express';
import { readAuthCookie } from './authCookie';

const REQUEST_HEADERS_TO_SKIP = new Set([
  'host',
  'connection',
  'content-length',
]);
const RESPONSE_HEADERS_TO_SKIP = new Set([
  'connection',
  'content-encoding',
  'content-length',
  'transfer-encoding',
  'set-cookie',
]);

export function createApiProxy(backendOrigin: string): RequestHandler {
  const origin = new URL(backendOrigin).origin;

  return async (req: Request, res: Response) => {
    const headers = new Headers();
    for (const [name, value] of Object.entries(req.headers)) {
      if (value === undefined || REQUEST_HEADERS_TO_SKIP.has(name)) continue;
      headers.set(name, Array.isArray(value) ? value.join(', ') : value);
    }

    // The browser cannot read the httpOnly token, so the proxy attaches it.
    const token = readAuthCookie(req.headers.cookie);
    if (token && !headers.has('authorization')) {
      headers.set('authorization', `Bearer ${token}`);
    }

    const hasBody = req.method !== 'GET' && req.method !== 'HEAD';

    try {
      const upstream = await fetch(`${origin}${req.originalUrl}`, {
        method: req.method,
        headers,
        body: hasBody ? (req as never) : undefined,
        redirect: 'manual',
        // Required by Node's fetch when streaming a request body
        ...(hasBody ? { duplex: 'half' } : {}),
      } as unknown as RequestInit);

      res.status(upstream.status);
      upstream.headers.forEach((value, name) => {
        if (!RESPONSE_HEADERS_TO_SKIP.has(name)) res.setHeader(name, value);
      });
      const cookies = upstream.headers.getSetCookie();
      if (cookies.length > 0) res.setHeader('set-cookie', cookies);

      res.send(Buffer.from(await upstream.arrayBuffer()));
    } catch (error) {
      console.error('Unable to reach the backend API:', error);
      res.status(502).json({ message: 'Unable to reach the backend API.' });
    }
  };
}
