import { failureMessage, submitJson } from './apiResponse';

export const UPDATE_PROFILE_PATH = '/api/admin/profile';
export const MAX_NAME_LENGTH = 100;
export const MAX_EMAIL_LENGTH = 254;

export interface ProfileForm {
  name: string;
  email: string;
}

export interface ProfileResult {
  ok: boolean;
  message: string;
  profile?: ProfileForm;
}

const DEFAULT_SUCCESS_MESSAGE = 'Profile updated successfully.';
const GENERIC_ERROR_MESSAGE =
  'Unable to update your profile. Please try again later.';
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Returns a user-facing message, or null when the form can be submitted.
export function validateProfileForm(form: ProfileForm): string | null {
  const name = form.name.trim();
  const email = form.email.trim();
  if (!name) return 'Enter your name.';
  if (name.length > MAX_NAME_LENGTH) {
    return `Name must be ${MAX_NAME_LENGTH} characters or fewer.`;
  }
  if (!email) return 'Enter your email address.';
  if (email.length > MAX_EMAIL_LENGTH || !EMAIL_PATTERN.test(email)) {
    return 'Enter a valid email address.';
  }
  return null;
}

function readProfile(body: unknown): ProfileForm | null {
  if (typeof body !== 'object' || body === null) return null;
  const { name, email } = body as Record<string, unknown>;
  if (typeof name === 'string' && typeof email === 'string') {
    return { name: name.trim(), email: email.trim() };
  }
  return null;
}

// Never throws: a failure is returned as a result. On success the profile the
// backend echoes back is used when present, otherwise the submitted values.
export async function updateProfile(
  form: ProfileForm,
  fetchImpl: typeof fetch = (input, init) => fetch(input, init),
  timeoutMs = 10_000,
): Promise<ProfileResult> {
  const submitted = { name: form.name.trim(), email: form.email.trim() };
  const result = await submitJson(
    UPDATE_PROFILE_PATH,
    'PUT',
    submitted,
    fetchImpl,
    timeoutMs,
  );
  if (result?.ok) {
    return {
      ok: true,
      message: result.message ?? DEFAULT_SUCCESS_MESSAGE,
      profile: readProfile(result.body) ?? submitted,
    };
  }
  return { ok: false, message: failureMessage(result, GENERIC_ERROR_MESSAGE) };
}
