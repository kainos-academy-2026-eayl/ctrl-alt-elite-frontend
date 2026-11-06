export interface ProfileDetails {
  id: string;
  username: string | null;
  firstName: string;
  lastName: string;
  email: string;
  addressLine1: string | null;
  addressLine2: string | null;
  town?: string | null;
  postcode: string | null;
  phoneNumber: string | null;
  hasPhoto: boolean;
}

export class ProfileAuthenticationError extends Error {}

export class ProfileUpdateError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export function profileDisplayName(profile: ProfileDetails): string {
  return profile.username || `${profile.firstName} ${profile.lastName}`.trim();
}

export class ProfileService {
  constructor(private readonly backendOrigin: string) {}

  getOwnProfile(token: string): Promise<ProfileDetails> {
    return this.request(token, 'GET');
  }

  updateOwnProfile(token: string, fields: unknown): Promise<ProfileDetails> {
    return this.request(token, 'PATCH', fields);
  }

  private async request(
    token: string,
    method: 'GET' | 'PATCH',
    fields?: unknown,
  ): Promise<ProfileDetails> {
    const response = await fetch(new URL('/api/profile', this.backendOrigin), {
      method,
      headers: {
        authorization: `Bearer ${token}`,
        accept: 'application/json',
        ...(method === 'PATCH' ? { 'Content-Type': 'application/json' } : {}),
      },
      ...(method === 'PATCH' ? { body: JSON.stringify(fields) } : {}),
      redirect: 'manual',
      signal: AbortSignal.timeout(5000),
    });
    if (response.status === 401 || response.status === 403) {
      await response.body?.cancel();
      throw new ProfileAuthenticationError('Your profile login has expired.');
    }
    if (response.status !== 200) {
      if (
        method === 'PATCH' &&
        (response.status === 400 || response.status === 409)
      ) {
        const error: unknown = await response.json();
        if (
          typeof error === 'object' &&
          error !== null &&
          'message' in error &&
          typeof error.message === 'string'
        ) {
          throw new ProfileUpdateError(response.status, error.message);
        }
        throw new Error(
          'The profile API returned an unexpected error response.',
        );
      }
      await response.body?.cancel();
      throw new Error(`Profile API returned ${response.status}.`);
    }
    const body: unknown = await response.json();
    const town =
      typeof body === 'object' && body !== null && 'town' in body
        ? body.town
        : undefined;
    if (
      typeof body !== 'object' ||
      body === null ||
      !('id' in body) ||
      typeof body.id !== 'string' ||
      !('username' in body) ||
      (body.username !== null && typeof body.username !== 'string') ||
      !('firstName' in body) ||
      typeof body.firstName !== 'string' ||
      !('lastName' in body) ||
      typeof body.lastName !== 'string' ||
      !('email' in body) ||
      typeof body.email !== 'string' ||
      !('hasPhoto' in body) ||
      typeof body.hasPhoto !== 'boolean' ||
      !('addressLine1' in body) ||
      (body.addressLine1 !== null && typeof body.addressLine1 !== 'string') ||
      !('addressLine2' in body) ||
      (body.addressLine2 !== null && typeof body.addressLine2 !== 'string') ||
      (town !== undefined && town !== null && typeof town !== 'string') ||
      !('postcode' in body) ||
      (body.postcode !== null && typeof body.postcode !== 'string') ||
      !('phoneNumber' in body) ||
      (body.phoneNumber !== null && typeof body.phoneNumber !== 'string')
    ) {
      throw new Error('The profile API returned an unexpected response.');
    }
    return {
      id: body.id,
      username: body.username,
      firstName: body.firstName,
      lastName: body.lastName,
      email: body.email,
      addressLine1: body.addressLine1,
      addressLine2: body.addressLine2,
      ...(town === undefined ? {} : { town }),
      postcode: body.postcode,
      phoneNumber: body.phoneNumber,
      hasPhoto: body.hasPhoto,
    };
  }
}
