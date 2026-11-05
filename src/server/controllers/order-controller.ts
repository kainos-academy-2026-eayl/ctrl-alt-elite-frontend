import type { Request, Response } from 'express';
import { formatPounds } from '../../i18n/money';
import { t } from '../../i18n/runtime';
import { readAuthCookie } from '../../util/authCookie';
import type { OrderService } from '../services/order-service';

export class OrderController {
  constructor(private readonly orderService: OrderService) {}

  showOrders = async (req: Request, res: Response): Promise<void> => {
    res.setHeader('Cache-Control', 'no-store');
    const token = readAuthCookie(req.headers.cookie);
    if (!token) {
      res.redirect(303, '/login');
      return;
    }

    try {
      const { orders } = await this.orderService.getOrders(token);
      res.render('order_history.njk', {
        orders: orders.map((order) => ({
          ...order,
          total: formatPounds(Math.round(order.order_total * 100)),
        })),
        currentYear: new Date().getFullYear(),
      });
    } catch (error) {
      console.error('Unable to load orders from the backend:', error);
      res.status(502).render('order_history.njk', {
        orders: [],
        orderError: t('orders.unavailable'),
        currentYear: new Date().getFullYear(),
      });
    }
  };
}
