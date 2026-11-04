import type { Request, Response } from 'express';
import type { OrderService } from '../services/order-service';

export class OrderController {
  constructor(private readonly orderService: OrderService) {}

  showOrders = async (_req: Request, res: Response): Promise<void> => {
    try {
      const orders = await this.orderService.getOrders('test-token');
      res.render('order.njk', { orders });
    } catch (error) {
      console.error('Unable to load orders from the backend:', error);
      res.status(502).render('order.njk', {
        orders: [],
        orderError: 'Orders are temporarily unavailable.',
      });
    }
  };
}
