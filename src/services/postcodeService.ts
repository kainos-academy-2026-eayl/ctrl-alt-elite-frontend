/*
 * Checks that a postcode really exists, using postcodes.io (free, no API key).
 * Only the postcode is sent. Answers are cached so each postcode is only
 * checked once while the server runs.
 */

export interface RealPostcode {
  /** The postcode in its standard form, for example "BT7 1NN". */
  postcode: string;
  /**
   * The local council area, for example "Belfast" or "Westminster", or a
   * wider area if it has none. Empty if postcodes.io gives no area at all.
   */
  district: string;
}

const DEFAULT_BASE_URL = 'https://api.postcodes.io';
const REQUEST_TIMEOUT_MS = 5000;
const MAX_CACHED_POSTCODES = 1000;

export class PostcodeServiceError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'PostcodeServiceError';
  }
}

export class PostcodeService {
  private readonly cache = new Map<string, RealPostcode | null>();

  constructor(
    private readonly baseUrl: string = DEFAULT_BASE_URL,
    private readonly fetchImpl: typeof fetch = (input, init) =>
      fetch(input, init),
  ) {}

  /**
   * Returns the postcode's details, or null if it does not exist. Throws
   * PostcodeServiceError if postcodes.io cannot be reached.
   */
  async findPostcode(postcode: string): Promise<RealPostcode | null> {
    const key = postcode.replace(/\s+/g, '').toUpperCase();
    if (this.cache.has(key)) {
      return this.cache.get(key) ?? null;
    }

    let response: Response;
    try {
      response = await this.fetchImpl(
        new URL(`/postcodes/${encodeURIComponent(key)}`, this.baseUrl),
        {
          headers: { accept: 'application/json' },
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        },
      );
    } catch (error) {
      throw new PostcodeServiceError('Postcode check failed.', {
        cause: error,
      });
    }

    if (response.status === 404) {
      await response.body?.cancel();
      this.remember(key, null);
      return null;
    }
    if (!response.ok) {
      await response.body?.cancel();
      throw new PostcodeServiceError(
        `Postcode check failed with status ${response.status}.`,
      );
    }

    const body: unknown = await response.json().catch(() => null);
    const result =
      typeof body === 'object' && body !== null && 'result' in body
        ? (body.result as Record<string, unknown> | null)
        : null;
    if (typeof result?.postcode !== 'string') {
      throw new PostcodeServiceError('Postcode check returned bad data.');
    }
    // Some real postcodes have no council area, so fall back to wider areas.
    const district = [
      result.admin_district,
      result.admin_county,
      result.region,
      result.country,
    ].find((area): area is string => typeof area === 'string' && area !== '');
    const found = { postcode: result.postcode, district: district ?? '' };
    this.remember(key, found);
    return found;
  }

  private remember(key: string, value: RealPostcode | null): void {
    if (this.cache.size >= MAX_CACHED_POSTCODES) {
      const oldest = this.cache.keys().next().value;
      if (oldest !== undefined) this.cache.delete(oldest);
    }
    this.cache.set(key, value);
  }
}
