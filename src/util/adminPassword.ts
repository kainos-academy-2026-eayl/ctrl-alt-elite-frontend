export const CHANGE_PASSWORD_PATH = '/api/admin/change-password';

export interface PasswordForm {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
}

export interface PasswordResult {
  ok: boolean;
  message: string;
}

const DEFAULT_SUCCESS_MESSAGE = 'Password updated successfully.';
const GENERIC_ERROR_MESSAGE =
  'Unable to update your password. Please try again later.';

// Returns a user-facing message, or null when the form can be submitted.
export function validatePasswordForm(form: PasswordForm): string | null {
  if (!form.currentPassword) return 'Enter your current password.';
  if (!form.newPassword) return 'Enter a new password.';
  if (!form.confirmPassword) return 'Confirm your new password.';
  if (form.newPassword !== form.confirmPassword) {
    return 'The new password and confirmation do not match.';
  }
  return null;
}

async function readMessage(response: Response): Promise<string | null> {
  try {
    const body: unknown = await response.json();
    if (typeof body === 'object' && body !== null && 'message' in body) {
      const message = body.message;
      if (typeof message === 'string' && message.trim()) return message.trim();
    }
  } catch {
    // The body was empty or not JSON.
  }
  return null;
}

// Never throws and never logs the passwords: a failure is returned as a result.
export async function changePassword(
  form: PasswordForm,
  fetchImpl: typeof fetch = (input, init) => fetch(input, init),
  timeoutMs = 10_000,
): Promise<PasswordResult> {
  try {
    const response = await fetchImpl(CHANGE_PASSWORD_PATH, {
      method: 'PUT',
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        currentPassword: form.currentPassword,
        newPassword: form.newPassword,
        confirmPassword: form.confirmPassword,
      }),
      signal: AbortSignal.timeout(timeoutMs),
    });
    const message = await readMessage(response);
    if (response.ok) {
      return { ok: true, message: message ?? DEFAULT_SUCCESS_MESSAGE };
    }
    // Server errors may carry internal detail, so only 4xx messages are shown.
    const isClientError = response.status >= 400 && response.status < 500;
    return {
      ok: false,
      message: (isClientError && message) || GENERIC_ERROR_MESSAGE,
    };
  } catch {
    return { ok: false, message: GENERIC_ERROR_MESSAGE };
  }
}
