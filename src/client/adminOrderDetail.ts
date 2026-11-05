import { ORDER_ID_PATTERN } from '../util/adminOrders';
import { createOrdersApi, OrderNotFoundError } from '../util/adminOrdersApi';
import { renderOrderDetail, renderOrderMessage } from '../util/adminOrderViews';
import {
  AccessDeniedError,
  loginRedirectFor,
  SessionExpiredError,
} from '../util/apiErrors';

const container = document.querySelector<HTMLElement>('[data-order-detail]');
if (!container) {
  throw new Error('Element not found: [data-order-detail]');
}
const detail = container;

async function loadOrder(): Promise<void> {
  const id = decodeURIComponent(
    window.location.pathname.split('/').filter(Boolean).pop() ?? '',
  );
  if (!ORDER_ID_PATTERN.test(id)) {
    detail.innerHTML = renderOrderMessage(
      'Order not found',
      'We could not find an order with that ID.',
    );
    return;
  }

  try {
    detail.innerHTML = renderOrderDetail(await createOrdersApi().getOrder(id));
  } catch (error) {
    if (error instanceof SessionExpiredError) {
      window.location.assign(loginRedirectFor(window.location));
    } else if (error instanceof AccessDeniedError) {
      detail.innerHTML = renderOrderMessage(
        'Access denied',
        'You do not have permission to view orders.',
      );
    } else if (error instanceof OrderNotFoundError) {
      detail.innerHTML = renderOrderMessage(
        'Order not found',
        'We could not find an order with that ID.',
      );
    } else {
      console.error('Unable to load the order:', error);
      detail.innerHTML = renderOrderMessage(
        'Unable to load the order',
        'Something went wrong while loading this order. Please try again.',
      );
    }
  }
}

void loadOrder();
