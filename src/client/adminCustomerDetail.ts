import {
  resetCustomerPassword,
  updateCustomer,
  validateCustomerForm,
  validateCustomerPasswordForm,
} from '../util/adminCustomerManage';
import {
  CUSTOMER_ID_PATTERN,
  type Customer,
  customerFullName,
} from '../util/customers';
import {
  renderCustomerDetail,
  renderCustomerMessage,
} from '../util/customerViews';
import { createApiCustomerSource } from './customerApi';

const container = document.querySelector<HTMLElement>('[data-customer-detail]');
if (!container) {
  throw new Error('Element not found: [data-customer-detail]');
}
const detail = container;

const NOT_FOUND = renderCustomerMessage(
  'Customer not found',
  'We could not find a customer with that ID.',
);

function getElement<T extends Element>(selector: string): T {
  const element = detail.querySelector<T>(selector);
  if (!element) throw new Error(`Element not found: ${selector}`);
  return element;
}

function setUpEditForm(initial: Customer): void {
  let current = initial;
  const form = getElement<HTMLFormElement>('[data-customer-form]');
  const view = getElement<HTMLElement>('[data-customer-view]');
  const editButton = getElement<HTMLButtonElement>('[data-customer-edit]');
  const cancelButton = getElement<HTMLButtonElement>('[data-customer-cancel]');
  const saveButton = getElement<HTMLButtonElement>('[data-customer-save]');
  const error = getElement<HTMLElement>('[data-customer-error]');
  const success = getElement<HTMLElement>('[data-customer-success]');
  const heading = getElement<HTMLElement>('[data-customer-heading]');
  const nameText = getElement<HTMLElement>('[data-customer-name]');
  const emailText = getElement<HTMLElement>('[data-customer-email]');
  const firstName = getElement<HTMLInputElement>('#customer-first-name');
  const lastName = getElement<HTMLInputElement>('#customer-last-name');
  const email = getElement<HTMLInputElement>('#customer-email');

  function setEditing(editing: boolean): void {
    form.hidden = !editing;
    view.hidden = editing;
    editButton.hidden = editing;
    error.hidden = true;
    if (editing) success.hidden = true;
  }

  function fillForm(): void {
    firstName.value = current.firstName;
    lastName.value = current.lastName;
    email.value = current.email;
  }

  editButton.addEventListener('click', () => {
    fillForm();
    setEditing(true);
    firstName.focus();
  });

  cancelButton.addEventListener('click', () => setEditing(false));

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const values = {
      firstName: firstName.value,
      lastName: lastName.value,
      email: email.value,
    };

    const problem = validateCustomerForm(values);
    if (problem) {
      error.textContent = problem;
      error.hidden = false;
      return;
    }

    saveButton.disabled = true;
    const result = await updateCustomer(current, values);
    saveButton.disabled = false;

    if (!result.ok || !result.customer) {
      error.textContent = result.message;
      error.hidden = false;
      return;
    }
    current = result.customer;
    const fullName = customerFullName(current);
    heading.textContent = fullName;
    nameText.textContent = fullName;
    emailText.textContent = current.email;
    setEditing(false);
    success.textContent = result.message;
    success.hidden = false;
  });
}

function setUpPasswordForm(customerId: string): void {
  const form = getElement<HTMLFormElement>('[data-customer-password-form]');
  const saveButton = getElement<HTMLButtonElement>(
    '[data-customer-password-save]',
  );
  const error = getElement<HTMLElement>('[data-customer-password-error]');
  const success = getElement<HTMLElement>('[data-customer-password-success]');

  function show(element: HTMLElement, message: string): void {
    error.hidden = true;
    success.hidden = true;
    element.textContent = message;
    element.hidden = false;
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const data = new FormData(form);
    const values = {
      newPassword: String(data.get('newPassword') ?? ''),
      confirmPassword: String(data.get('confirmPassword') ?? ''),
    };

    const problem = validateCustomerPasswordForm(values);
    if (problem) {
      show(error, problem);
      return;
    }

    saveButton.disabled = true;
    const result = await resetCustomerPassword(customerId, values);
    saveButton.disabled = false;
    if (result.ok) {
      form.reset();
      show(success, result.message);
    } else {
      show(error, result.message);
    }
  });
}

async function loadCustomer(): Promise<void> {
  const id = decodeURIComponent(
    window.location.pathname.split('/').filter(Boolean).pop() ?? '',
  );
  if (!CUSTOMER_ID_PATTERN.test(id)) {
    detail.innerHTML = NOT_FOUND;
    return;
  }

  try {
    const customer = await createApiCustomerSource().findById(id);
    if (!customer) {
      detail.innerHTML = NOT_FOUND;
      return;
    }
    detail.innerHTML = renderCustomerDetail(customer);
    setUpEditForm(customer);
    setUpPasswordForm(customer.id);
  } catch (error) {
    console.error('Unable to load customer:', error);
    detail.innerHTML = renderCustomerMessage(
      'Unable to load customer',
      'Something went wrong while loading this customer. Please try again.',
    );
  }
}

void loadCustomer();
