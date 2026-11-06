import type { Request, Response } from 'express';
import type { Environment } from 'nunjucks';
import { getStaffContext } from '../middleware/admin-guard';
import { ORDER_SORT_OPTIONS, ORDER_STATUSES } from '../util/adminOrders';
import { findAdminModule, navItemsForRole } from '../util/adminPortal';
import {
  ADMIN_QUICK_ACTIONS,
  ADMIN_SUMMARY_CARDS,
  ADMIN_SYSTEM_STATUS,
  CUSTOMER_SERVICE_SHORTCUTS,
} from '../util/adminResources';
import { DASHBOARD_WIDGETS } from '../util/adminSettings';
import { STOCK_STATUS_OPTIONS } from '../util/adminStock';
import { loadAdminFirstName } from '../util/adminUser';
import { readAuthCookie } from '../util/authCookie';
import { CUSTOMER_SORT_OPTIONS } from '../util/customers';
import { hasPermission } from '../util/staffRoles';
import { TICKET_CATEGORIES, TICKET_STATUSES } from '../util/supportTickets';
import { sendAccessDenied } from './access-denied';

// The server only serves page shells. Live data is loaded in the browser by the
// matching controller in src/controllers, which calls the backend through /api.
export class AdminController {
  constructor(
    private readonly backendOrigin: string,
    private readonly templates: Environment,
    private readonly readAppVersion: () => Promise<string>,
  ) {}

  private renderPage(
    res: Response,
    template: string,
    context: Record<string, unknown>,
  ): void {
    const { profile, role } = getStaffContext(res);
    try {
      res.type('html').send(
        this.templates.render(template, {
          navItems: navItemsForRole(role),
          profile,
          showStorefrontLink: role.storefrontLink,
          ...context,
        }),
      );
    } catch (error) {
      console.error(`Unable to load the admin page ${template}:`, error);
      res.redirect('/unavailable');
    }
  }

  showDashboard = async (req: Request, res: Response): Promise<void> => {
    const firstName = await loadAdminFirstName(
      this.backendOrigin,
      readAuthCookie(req.headers.cookie),
    );
    this.renderPage(res, 'admin/dashboard.njk', {
      title: 'Dashboard',
      firstName,
      activeSlug: 'dashboard',
      summaryCards: ADMIN_SUMMARY_CARDS,
      quickActions: ADMIN_QUICK_ACTIONS,
      systemStatus: ADMIN_SYSTEM_STATUS,
    });
  };

  showCustomerServiceDashboard = (_req: Request, res: Response): void => {
    const firstName = getStaffContext(res).profile.name.split(/\s+/)[0];
    this.renderPage(res, 'admin/customer-service-dashboard.njk', {
      title: 'Customer Service Dashboard',
      firstName,
      activeSlug: 'dashboard',
      shortcuts: CUSTOMER_SERVICE_SHORTCUTS,
    });
  };

  showOrders = (_req: Request, res: Response): void => {
    this.renderPage(res, 'admin/orders.njk', {
      title: 'Orders',
      activeSlug: 'orders',
      statuses: ORDER_STATUSES,
      sortOptions: ORDER_SORT_OPTIONS,
    });
  };

  showOrderDetail = (_req: Request, res: Response): void => {
    this.renderPage(res, 'admin/order-detail.njk', {
      title: 'Order details',
      activeSlug: 'orders',
    });
  };

  showReports = (_req: Request, res: Response): void => {
    this.renderPage(res, 'admin/reports.njk', {
      title: 'Reports',
      activeSlug: 'reports',
    });
  };

  showCustomers = (_req: Request, res: Response): void => {
    this.renderPage(res, 'admin/customers.njk', {
      title: 'Customers',
      activeSlug: 'customers',
      sortOptions: CUSTOMER_SORT_OPTIONS,
    });
  };

  showCustomerDetail = (_req: Request, res: Response): void => {
    this.renderPage(res, 'admin/customer-detail.njk', {
      title: 'Customer details',
      activeSlug: 'customers',
    });
  };

  showSupport = (_req: Request, res: Response): void => {
    this.renderPage(res, 'admin/support.njk', {
      title: 'Support Tickets',
      activeSlug: 'support',
      statuses: TICKET_STATUSES,
      categories: TICKET_CATEGORIES,
    });
  };

  showSupportDetail = (_req: Request, res: Response): void => {
    this.renderPage(res, 'admin/support-detail.njk', {
      title: 'Ticket details',
      activeSlug: 'support',
    });
  };

  showSettings = async (_req: Request, res: Response): Promise<void> => {
    this.renderPage(res, 'admin/settings.njk', {
      title: 'Settings',
      activeSlug: 'settings',
      appVersion: await this.readAppVersion(),
      dashboardWidgets: DASHBOARD_WIDGETS,
      showDashboardPreferences: hasPermission(
        getStaffContext(res).role,
        'dashboard',
      ),
    });
  };

  showInventory = (_req: Request, res: Response): void => {
    this.renderPage(res, 'admin/inventory.njk', {
      title: 'Products',
      activeSlug: 'inventory',
    });
  };

  showStockDashboard = (_req: Request, res: Response): void => {
    this.renderPage(res, 'admin/stock-dashboard.njk', {
      title: 'Inventory Dashboard',
      activeSlug: 'stock-dashboard',
    });
  };

  showStock = (_req: Request, res: Response): void => {
    this.renderPage(res, 'admin/stock.njk', {
      title: 'Inventory',
      activeSlug: 'stock',
      statuses: STOCK_STATUS_OPTIONS,
    });
  };

  showNewProduct = (_req: Request, res: Response): void => {
    this.renderPage(res, 'admin/inventory-form.njk', {
      title: 'Add product',
      activeSlug: 'inventory',
    });
  };

  showEditProduct = (_req: Request, res: Response): void => {
    this.renderPage(res, 'admin/inventory-form.njk', {
      title: 'Edit product',
      activeSlug: 'inventory',
    });
  };

  showModule = (
    req: Request,
    res: Response,
    next: (error?: unknown) => void,
  ): void => {
    const adminModule = findAdminModule(String(req.params.section));
    if (!adminModule) {
      next();
      return;
    }
    if (!hasPermission(getStaffContext(res).role, adminModule.slug)) {
      sendAccessDenied(res, 'You do not have permission to view this page.');
      return;
    }
    this.renderPage(res, 'admin/module.njk', {
      title: adminModule.label,
      activeSlug: adminModule.key,
    });
  };
}
