import { failureMessage, submitJson } from './apiResponse';

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

// Never throws and never logs the passwords: a failure is returned as a result.
export async function changePassword(
  form: PasswordForm,
  fetchImpl: typeof fetch = (input, init) => fetch(input, init),
  timeoutMs = 10_000,
): Promise<PasswordResult> {
  const result = await submitJson(
    CHANGE_PASSWORD_PATH,
    'PUT',
    {
      currentPassword: form.currentPassword,
      newPassword: form.newPassword,
      confirmPassword: form.confirmPassword,
    },
    fetchImpl,
    timeoutMs,
  );
  if (result?.ok) {
    return { ok: true, message: result.message ?? DEFAULT_SUCCESS_MESSAGE };
  }
  return { ok: false, message: failureMessage(result, GENERIC_ERROR_MESSAGE) };
}
