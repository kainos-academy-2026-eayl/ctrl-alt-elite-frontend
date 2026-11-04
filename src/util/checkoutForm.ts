import { normalisePostcode } from '../services/addressLookupService';

/*
 * Reads and checks the checkout form. The form posts every field on every
 * step (earlier steps as hidden inputs), so nothing is stored between steps.
 * The backend checks everything again when the order is placed.
 */

export const CHECKOUT_FIELDS = [
  'firstName',
  'lastName',
  'email',
  'phone',
  'postcode',
  'addressLine1',
  'addressLine2',
  'town',
  'deliveryOption',
] as const;

export type CheckoutField = (typeof CHECKOUT_FIELDS)[number];
export type CheckoutValues = Record<CheckoutField, string>;

export const CHECKOUT_ACTIONS = [
  'find-address',
  'use-address',
  'continue-to-delivery',
  'edit-details',
  'continue-to-payment',
  'edit-delivery',
  'place-order',
] as const;

export type CheckoutAction = (typeof CHECKOUT_ACTIONS)[number];

export interface CheckoutFieldError {
  field: CheckoutField | 'selectedAddress';
  message: string;
}

export interface CheckoutForm {
  values: CheckoutValues;
  action: CheckoutAction;
  /** Index of the looked-up address the customer picked, if any. */
  selectedAddress: number | null;
  /** The order total (pence) shown on the payment step when Checkout was pressed. */
  confirmedTotalPence: number | null;
}

const MAX_LENGTHS: Record<CheckoutField, number> = {
  firstName: 100,
  lastName: 100,
  email: 254,
  phone: 20,
  postcode: 8,
  addressLine1: 100,
  addressLine2: 100,
  town: 60,
  deliveryOption: 20,
};

// The same pattern the backend's validator (zod) uses, so both agree.
const EMAIL =
  /^(?:[A-Za-z0-9_'+-]+\.)*[A-Za-z0-9_'+-]*[A-Za-z0-9_+-]@(?:[A-Za-z0-9][A-Za-z0-9-]*\.)+[A-Za-z]{2,}$/;
const PHONE_CHARACTERS = /^[\d\s+().-]+$/;
// UK numbers in national form: 01 has 9 or 10 digits after the 0, 08 has 9
// or 10, and 02, 03, 07 and 09 have 10.
const UK_PHONE = /^0(?:1\d{8,9}|[2379]\d{9}|8\d{8,9})$/;

/**
 * "+44 (0)7700 900-123" becomes "07700900123". Returns null if the number is
 * too long, has other characters or is not a valid UK number.
 */
export function normaliseUkPhone(phone: string): string | null {
  if (phone.length > MAX_LENGTHS.phone || !PHONE_CHARACTERS.test(phone)) {
    return null;
  }
  const national = phone
    .replace(/^\s*\+44\s*\(0\)/, '+44')
    .replace(/[\s().-]/g, '')
    .replace(/^(?:\+44|0044)/, '0');
  return UK_PHONE.test(national) ? national : null;
}

export function isValidEmail(email: string): boolean {
  const [local = ''] = email.split('@');
  return (
    email.length <= MAX_LENGTHS.email && local.length <= 64 && EMAIL.test(email)
  );
}

export function emptyCheckoutValues(): CheckoutValues {
  return Object.fromEntries(
    CHECKOUT_FIELDS.map((field) => [field, '']),
  ) as CheckoutValues;
}

function readText(body: Record<string, unknown>, field: string): string {
  const value = body[field];
  // Over-long input is cut short here and reported by the checks below.
  return typeof value === 'string' ? value.trim().slice(0, 300) : '';
}

export function readCheckoutForm(body: unknown): CheckoutForm {
  const fields =
    typeof body === 'object' && body !== null
      ? (body as Record<string, unknown>)
      : {};
  const values = emptyCheckoutValues();
  for (const field of CHECKOUT_FIELDS) {
    values[field] = readText(fields, field);
  }
  const action = readText(fields, 'action');
  const selected = readText(fields, 'selectedAddress');
  const confirmedTotal = readText(fields, 'confirmedTotalPence');
  return {
    values,
    action: (CHECKOUT_ACTIONS as readonly string[]).includes(action)
      ? (action as CheckoutAction)
      : 'edit-details',
    selectedAddress: /^\d{1,2}$/.test(selected) ? Number(selected) : null,
    confirmedTotalPence: /^\d{1,9}$/.test(confirmedTotal)
      ? Number(confirmedTotal)
      : null,
  };
}

function checkLength(
  values: CheckoutValues,
  field: CheckoutField,
  label: string,
): CheckoutFieldError | null {
  const max = MAX_LENGTHS[field];
  return values[field].length > max
    ? { field, message: `${label} must be ${max} characters or fewer` }
    : null;
}

export function validatePostcode(
  values: CheckoutValues,
): CheckoutFieldError | null {
  if (!values.postcode) {
    return { field: 'postcode', message: 'Enter your postcode' };
  }
  if (!normalisePostcode(values.postcode)) {
    return {
      field: 'postcode',
      message: 'Enter a real UK postcode, like BT1 1AA',
    };
  }
  return null;
}

/** Checks step 1, your details and address, in the order they are shown. */
export function validateDetails(values: CheckoutValues): CheckoutFieldError[] {
  const errors: (CheckoutFieldError | null)[] = [
    values.firstName
      ? checkLength(values, 'firstName', 'First name')
      : { field: 'firstName', message: 'Enter your first name' },
    values.lastName
      ? checkLength(values, 'lastName', 'Last name')
      : { field: 'lastName', message: 'Enter your last name' },
    !values.email
      ? { field: 'email', message: 'Enter your email address' }
      : !isValidEmail(values.email)
        ? {
            field: 'email',
            message:
              'Enter an email address in the correct format, like name@example.com',
          }
        : null,
    !values.phone
      ? { field: 'phone', message: 'Enter your phone number' }
      : !normaliseUkPhone(values.phone)
        ? {
            field: 'phone',
            message:
              'Enter a UK phone number using only numbers, like 07700 900123',
          }
        : null,
    validatePostcode(values),
    values.addressLine1
      ? checkLength(values, 'addressLine1', 'Address line 1')
      : {
          field: 'addressLine1',
          message: 'Enter address line 1, usually the house number and street',
        },
    checkLength(values, 'addressLine2', 'Address line 2'),
    values.town
      ? checkLength(values, 'town', 'Town or city')
      : { field: 'town', message: 'Enter your town or city' },
  ];
  return errors.filter((error) => error !== null);
}

/** Checks step 2: one of the backend's delivery options is chosen. */
export function validateDelivery(
  values: CheckoutValues,
  optionIds: readonly string[],
): CheckoutFieldError[] {
  return optionIds.includes(values.deliveryOption)
    ? []
    : [
        {
          field: 'deliveryOption',
          message: 'Choose how you would like to get your order',
        },
      ];
}
