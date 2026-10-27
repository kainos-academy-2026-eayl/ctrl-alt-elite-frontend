import { failureMessage, submitJson } from './apiResponse';
import type { Customer } from './customers';

export const MAX_CUSTOMER_NAME_LENGTH = 100;
export const MAX_CUSTOMER_EMAIL_LENGTH = 254;

export interface CustomerForm {
  firstName: string;
  lastName: string;
  email: string;
}

export interface CustomerPasswordForm {
  newPassword: string;
  confirmPassword: string;
}

export interface CustomerUpdateResult {
  ok: boolean;
  message: string;
  customer?: Customer;
}

export interface ActionResult {
  ok: boolean;
  message: string;
}

const UPDATE_SUCCESS_MESSAGE = 'Customer updated successfully.';
const UPDATE_ERROR_MESSAGE =
  'Unable to update this customer. Please try again later.';
const PASSWORD_SUCCESS_MESSAGE = 'Password reset successfully.';
const PASSWORD_ERROR_MESSAGE =
  'Unable to reset this password. Please try again later.';
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function customerPath(id: string): string {
  return `/api/admin/customers/${encodeURIComponent(id)}`;
}

export function customerPasswordPath(id: string): string {
  return `${customerPath(id)}/password`;
}

// Returns a user-facing message, or null when the form can be submitted.
export function validateCustomerForm(form: CustomerForm): string | null {
  const firstName = form.firstName.trim();
  const lastName = form.lastName.trim();
  const email = form.email.trim();
  if (!firstName) return 'Enter a first name.';
  if (
    firstName.length > MAX_CUSTOMER_NAME_LENGTH ||
    lastName.length > MAX_CUSTOMER_NAME_LENGTH
  ) {
    return `Names must be ${MAX_CUSTOMER_NAME_LENGTH} characters or fewer.`;
  }
  if (!email) return 'Enter an email address.';
  if (email.length > MAX_CUSTOMER_EMAIL_LENGTH || !EMAIL_PATTERN.test(email)) {
    return 'Enter a valid email address.';
  }
  return null;
}

// Returns a user-facing message, or null when the form can be submitted.
export function validateCustomerPasswordForm(
  form: CustomerPasswordForm,
): string | null {
  if (!form.newPassword) return 'Enter a new password.';
  if (!form.confirmPassword) return 'Confirm the new password.';
  if (form.newPassword !== form.confirmPassword) {
    return 'The new password and confirmation do not match.';
  }
  return null;
}

// The backend returns either the customer itself or { customer }.
function readCustomer(body: unknown, current: Customer): Customer | null {
  const candidate =
    typeof body === 'object' && body !== null && 'customer' in body
      ? body.customer
      : body;
  if (typeof candidate !== 'object' || candidate === null) return null;
  const { firstName, lastName, email } = candidate as Record<string, unknown>;
  if (
    typeof firstName === 'string' &&
    typeof lastName === 'string' &&
    typeof email === 'string'
  ) {
    return { ...current, firstName, lastName, email };
  }
  return null;
}

// Never throws: a failure is returned as a result. On success the customer the
// backend echoes back is used when present, otherwise the submitted values.
export async function updateCustomer(
  current: Customer,
  form: CustomerForm,
  fetchImpl: typeof fetch = (input, init) => fetch(input, init),
  timeoutMs = 10_000,
): Promise<CustomerUpdateResult> {
  const submitted = {
    firstName: form.firstName.trim(),
    lastName: form.lastName.trim(),
    email: form.email.trim(),
  };
  const result = await submitJson(
    customerPath(current.id),
    'PUT',
    submitted,
    fetchImpl,
    timeoutMs,
  );
  if (result?.ok) {
    return {
      ok: true,
      message: result.message ?? UPDATE_SUCCESS_MESSAGE,
      customer: readCustomer(result.body, current) ?? {
        ...current,
        ...submitted,
      },
    };
  }
  return { ok: false, message: failureMessage(result, UPDATE_ERROR_MESSAGE) };
}

// Never throws and never logs the password: a failure is returned as a result.
export async function resetCustomerPassword(
  id: string,
  form: CustomerPasswordForm,
  fetchImpl: typeof fetch = (input, init) => fetch(input, init),
  timeoutMs = 10_000,
): Promise<ActionResult> {
  const result = await submitJson(
    customerPasswordPath(id),
    'PUT',
    {
      newPassword: form.newPassword,
      confirmPassword: form.confirmPassword,
    },
    fetchImpl,
    timeoutMs,
  );
  if (result?.ok) {
    return { ok: true, message: result.message ?? PASSWORD_SUCCESS_MESSAGE };
  }
  return { ok: false, message: failureMessage(result, PASSWORD_ERROR_MESSAGE) };
}
