import {
  buildNotifications,
  buildSystemStatus,
  type DashboardCustomerData,
  type DashboardOrderData,
  loadDashboardCustomerData,
  loadDashboardOrderData,
  loadProductCount,
  renderActivity,
  renderNotifications,
  renderSystemStatus,
  UNAVAILABLE_CUSTOMER_DATA,
  UNAVAILABLE_ORDER_DATA,
} from '../util/adminDashboard';
import { createOrdersApi } from '../util/adminOrdersApi';
import { createApiCustomerSource } from './customerApi';

const DASHBOARD_TIMEOUT_MS = 3000;

let customerData: DashboardCustomerData = UNAVAILABLE_CUSTOMER_DATA;
let orderData: DashboardOrderData = UNAVAILABLE_ORDER_DATA;

// Customer and order data load independently, so notifications are rebuilt
// from whatever has arrived so far.
function updateNotifications(): void {
  const notifications = document.querySelector(
    '[data-dashboard-notifications]',
  );
  if (notifications) {
    notifications.innerHTML = renderNotifications(
      buildNotifications(customerData, orderData),
    );
  }
}

async function updateOrders(): Promise<void> {
  orderData = await loadDashboardOrderData(
    createOrdersApi({ timeoutMs: DASHBOARD_TIMEOUT_MS }),
  );
  const ordersValue = document.querySelector('[data-summary-card="Orders"]');
  if (ordersValue) {
    ordersValue.textContent = orderData.available
      ? String(orderData.totalOrders)
      : 'Unavailable';
  }
  updateNotifications();
}

async function updateProductCount(): Promise<void> {
  const count = await loadProductCount(undefined, DASHBOARD_TIMEOUT_MS);
  if (count === null) return;
  const productsValue = document.querySelector(
    '[data-summary-card="Products"]',
  );
  if (productsValue) productsValue.textContent = String(count);
}

async function updateDashboard(): Promise<void> {
  const data = await loadDashboardCustomerData(
    createApiCustomerSource({ timeoutMs: DASHBOARD_TIMEOUT_MS }),
  );
  // The server-rendered placeholders stay in place when the backend is unavailable.
  if (!data.available) return;

  const customersValue = document.querySelector(
    '[data-summary-card="Customers"]',
  );
  if (customersValue) customersValue.textContent = String(data.totalCustomers);

  customerData = data;
  updateNotifications();

  const activity = document.querySelector('[data-dashboard-activity]');
  if (activity) activity.innerHTML = renderActivity(data.recentCustomers);

  const status = document.querySelector('[data-dashboard-status]');
  if (status) status.innerHTML = renderSystemStatus(buildSystemStatus(true));
}

void updateDashboard();
void updateProductCount();
void updateOrders();
