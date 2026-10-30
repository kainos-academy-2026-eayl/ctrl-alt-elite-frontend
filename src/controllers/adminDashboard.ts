import {
  buildNotifications,
  buildSystemStatus,
  loadDashboardCustomerData,
  loadProductCount,
  renderActivity,
  renderNotifications,
  renderSystemStatus,
} from '../util/adminDashboard';
import { createApiCustomerSource } from './customerApi';

const DASHBOARD_TIMEOUT_MS = 3000;

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

  const notifications = document.querySelector(
    '[data-dashboard-notifications]',
  );
  if (notifications) {
    notifications.innerHTML = renderNotifications(buildNotifications(data));
  }

  const activity = document.querySelector('[data-dashboard-activity]');
  if (activity) activity.innerHTML = renderActivity(data.recentCustomers);

  const status = document.querySelector('[data-dashboard-status]');
  if (status) status.innerHTML = renderSystemStatus(buildSystemStatus(true));
}

void updateDashboard();
void updateProductCount();
