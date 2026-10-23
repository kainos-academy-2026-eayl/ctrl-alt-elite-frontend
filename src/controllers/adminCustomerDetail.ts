import { CUSTOMER_ID_PATTERN } from '../util/customers';
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
    detail.innerHTML = customer ? renderCustomerDetail(customer) : NOT_FOUND;
  } catch (error) {
    console.error('Unable to load customer:', error);
    detail.innerHTML = renderCustomerMessage(
      'Unable to load customer',
      'Something went wrong while loading this customer. Please try again.',
    );
  }
}

void loadCustomer();
