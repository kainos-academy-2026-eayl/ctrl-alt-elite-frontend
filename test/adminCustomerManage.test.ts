import assert from 'node:assert/strict';
import { describe, it, vi } from 'vitest';
import {
  customerPasswordPath,
  customerPath,
  resetCustomerPassword,
  updateCustomer,
  validateCustomerForm,
  validateCustomerPasswordForm,
} from '../src/util/adminCustomerManage';
import type { Customer } from '../src/util/customers';
import { renderCustomerDetail } from '../src/util/customerViews';

const customer: Customer = {
  id: 'c-1',
  firstName: 'Ada',
  lastName: 'Lovelace',
  email: 'ada@example.com',
  registrationDate: '2026-10-21',
};
const form = {
  firstName: 'Grace',
  lastName: 'Hopper',
  email: 'grace@example.com',
};

type FetchArgs = [string | URL | Request, RequestInit?];

describe('customer management paths', () => {
  it('builds encoded endpoint paths', () => {
    assert.equal(customerPath('c-1'), '/api/admin/customers/c-1');
    assert.equal(customerPath('a/b'), '/api/admin/customers/a%2Fb');
    assert.equal(
      customerPasswordPath('c-1'),
      '/api/admin/customers/c-1/password',
    );
  });
});

describe('customer form validation', () => {
  it('accepts valid details, with an optional last name', () => {
    assert.equal(validateCustomerForm(form), null);
    assert.equal(validateCustomerForm({ ...form, lastName: '' }), null);
  });

  it('rejects a missing first name, long names and bad emails', () => {
    assert.match(
      validateCustomerForm({ ...form, firstName: ' ' }) ?? '',
      /first name/,
    );
    assert.match(
      validateCustomerForm({ ...form, lastName: 'a'.repeat(101) }) ?? '',
      /100 characters/,
    );
    assert.match(validateCustomerForm({ ...form, email: '' }) ?? '', /email/);
    for (const email of ['plain', 'a@b', 'a b@c.com']) {
      assert.match(
        validateCustomerForm({ ...form, email }) ?? '',
        /valid email/,
        email,
      );
    }
  });

  it('checks the password reset form', () => {
    assert.equal(
      validateCustomerPasswordForm({ newPassword: 'x', confirmPassword: 'x' }),
      null,
    );
    assert.match(
      validateCustomerPasswordForm({ newPassword: '', confirmPassword: '' }) ??
        '',
      /new password/,
    );
    assert.match(
      validateCustomerPasswordForm({ newPassword: 'x', confirmPassword: '' }) ??
        '',
      /Confirm/,
    );
    assert.match(
      validateCustomerPasswordForm({
        newPassword: 'x',
        confirmPassword: 'y',
      }) ?? '',
      /do not match/,
    );
  });
});

describe('updateCustomer', () => {
  it('sends a trimmed PUT and uses the customer the backend returns', async () => {
    const fetchImpl = vi.fn(async (..._args: FetchArgs) =>
      Response.json({ customer: { ...customer, firstName: 'Grace G.' } }),
    );
    const result = await updateCustomer(
      customer,
      {
        firstName: ' Grace ',
        lastName: ' Hopper ',
        email: ' grace@example.com ',
      },
      fetchImpl,
    );
    assert.equal(result.ok, true);
    assert.equal(result.message, 'Customer updated successfully.');
    assert.equal(result.customer?.firstName, 'Grace G.');
    assert.equal(result.customer?.registrationDate, '2026-10-21');
    const [url, init] = fetchImpl.mock.calls[0] ?? [];
    assert.equal(url, '/api/admin/customers/c-1');
    assert.equal(init?.method, 'PUT');
    assert.deepEqual(JSON.parse(String(init?.body)), form);
  });

  it('accepts a bare customer body and falls back to the submitted values', async () => {
    const bare = await updateCustomer(customer, form, async () =>
      Response.json({ ...customer, firstName: 'Bare' }),
    );
    assert.equal(bare.customer?.firstName, 'Bare');

    const empty = await updateCustomer(
      customer,
      form,
      async () => new Response(null, { status: 204 }),
    );
    assert.deepEqual(empty.customer, { ...customer, ...form });
  });

  it('shows the backend message for client errors', async () => {
    const result = await updateCustomer(customer, form, async () =>
      Response.json({ message: 'Email is already in use.' }, { status: 409 }),
    );
    assert.deepEqual(result, {
      ok: false,
      message: 'Email is already in use.',
    });
  });

  it('shows a generic message for server errors and network failures', async () => {
    const generic = /Unable to update this customer/;
    const serverError = await updateCustomer(customer, form, async () =>
      Response.json({ message: 'stack trace at db.ts' }, { status: 500 }),
    );
    assert.match(serverError.message, generic);
    assert.doesNotMatch(serverError.message, /stack trace/);
    const unreachable = await updateCustomer(customer, form, async () => {
      throw new Error('down');
    });
    assert.equal(unreachable.ok, false);
    assert.match(unreachable.message, generic);
  });
});

describe('resetCustomerPassword', () => {
  const passwords = {
    newPassword: 'NewPassword123',
    confirmPassword: 'NewPassword123',
  };

  it('sends a PUT with both fields and returns the success message', async () => {
    const fetchImpl = vi.fn(async (..._args: FetchArgs) =>
      Response.json({ message: 'Password reset.' }),
    );
    const result = await resetCustomerPassword('c-1', passwords, fetchImpl);
    assert.deepEqual(result, { ok: true, message: 'Password reset.' });
    const [url, init] = fetchImpl.mock.calls[0] ?? [];
    assert.equal(url, '/api/admin/customers/c-1/password');
    assert.equal(init?.method, 'PUT');
    assert.deepEqual(JSON.parse(String(init?.body)), passwords);
  });

  it('falls back to a default success message', async () => {
    const result = await resetCustomerPassword(
      'c-1',
      passwords,
      async () => new Response(null, { status: 204 }),
    );
    assert.deepEqual(result, {
      ok: true,
      message: 'Password reset successfully.',
    });
  });

  it('shows 4xx messages and hides server detail', async () => {
    const rejected = await resetCustomerPassword('c-1', passwords, async () =>
      Response.json({ message: 'Password is too short.' }, { status: 400 }),
    );
    assert.deepEqual(rejected, {
      ok: false,
      message: 'Password is too short.',
    });

    const broken = await resetCustomerPassword('c-1', passwords, async () =>
      Response.json({ message: 'db password=hunter2' }, { status: 500 }),
    );
    assert.match(broken.message, /Unable to reset this password/);
    assert.doesNotMatch(broken.message, /hunter2/);

    const unreachable = await resetCustomerPassword(
      'c-1',
      passwords,
      async () => {
        throw new Error('down');
      },
    );
    assert.match(unreachable.message, /Unable to reset this password/);
  });
});

describe('customer management markup', () => {
  it('renders the edit form prefilled and the password reset form', () => {
    const html = renderCustomerDetail(customer);
    assert.match(html, /<button[^>]*data-customer-edit>Edit<\/button>/);
    assert.match(html, /<form[^>]*hidden data-customer-form>/);
    assert.match(html, /name="firstName"[^>]*value="Ada"/);
    assert.match(html, /name="lastName"[^>]*value="Lovelace"/);
    assert.match(html, /name="email"[^>]*value="ada@example\.com"/);
    assert.match(html, /data-customer-heading>Ada Lovelace<\/h1>/);
    assert.match(html, /<h2[^>]*>Reset password<\/h2>/);
    assert.match(html, /name="newPassword" type="password"/);
    assert.match(html, /name="confirmPassword" type="password"/);
    assert.match(html, />Reset Password<\/button>/);
  });

  it('escapes customer values in the form inputs', () => {
    const html = renderCustomerDetail({
      ...customer,
      firstName: '"><script>x</script>',
    });
    assert.doesNotMatch(html, /<script>/);
    assert.match(html, /value="&quot;&gt;&lt;script&gt;x&lt;\/script&gt;"/);
  });
});
