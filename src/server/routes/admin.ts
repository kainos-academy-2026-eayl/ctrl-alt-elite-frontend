import { Router } from 'express';
import type { AdminController } from '../controllers/admin-controller';
import {
  createAdminGuard,
  requireDashboardRole,
  requirePermission,
} from '../middleware/admin-guard';

export function createAdminRouter(
  backendOrigin: string,
  controller: AdminController,
): Router {
  const router = Router();

  router.use(createAdminGuard(backendOrigin));

  router.get('/', requireDashboardRole('ADMIN'), controller.showDashboard);
  router.get(
    '/customer-service',
    requireDashboardRole('CUSTOMER_SERVICE'),
    controller.showCustomerServiceDashboard,
  );
  router.get(
    '/customers',
    requirePermission('customers'),
    controller.showCustomers,
  );
  router.get(
    '/customers/:id',
    requirePermission('customers'),
    controller.showCustomerDetail,
  );
  router.get('/support', requirePermission('support'), controller.showSupport);
  router.get(
    '/support/:id',
    requirePermission('support'),
    controller.showSupportDetail,
  );
  router.get(
    '/settings',
    requirePermission('settings'),
    controller.showSettings,
  );
  router.get('/:section', controller.showModule);

  return router;
}
