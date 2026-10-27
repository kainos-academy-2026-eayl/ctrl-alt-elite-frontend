export interface JsonResult {
  ok: boolean;
  status: number;
  body: unknown;
  message: string | null;
}

function readMessage(body: unknown): string | null {
  if (typeof body === 'object' && body !== null && 'message' in body) {
    const message = body.message;
    if (typeof message === 'string' && message.trim()) return message.trim();
  }
  return null;
}

// Returns null when the request itself fails (network error or timeout), and
// never includes the request payload in anything it logs or returns.
export async function submitJson(
  path: string,
  method: string,
  payload: unknown,
  fetchImpl: typeof fetch,
  timeoutMs: number,
): Promise<JsonResult | null> {
  try {
    const response = await fetchImpl(path, {
      method,
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(timeoutMs),
    });
    let body: unknown = null;
    try {
      body = await response.json();
    } catch {
      // The body was empty or not JSON.
    }
    return {
      ok: response.ok,
      status: response.status,
      body,
      message: readMessage(body),
    };
  } catch {
    return null;
  }
}

// Server errors may carry internal detail, so only 4xx messages are shown.
export function failureMessage(
  result: JsonResult | null,
  genericMessage: string,
): string {
  const isClientError =
    result !== null && result.status >= 400 && result.status < 500;
  return (isClientError && result.message) || genericMessage;
}
