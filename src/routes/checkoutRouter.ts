import express, { Router } from 'express';
import { requireSameOrigin } from '../middleware/requireSameOrigin';
import type { CheckoutController } from '../server/controllers/checkoutController';

export function createCheckoutRouter(controller: CheckoutController): Router {
  const router = Router();
  const parseForm = express.urlencoded({ extended: false, limit: '16kb' });

  router.get('/', controller.show);
  router.post('/', requireSameOrigin, parseForm, controller.submit);
  router.get('/confirmation/:orderId', controller.showConfirmation);

  return router;
}
