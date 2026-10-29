import express, { Router } from 'express';
import { requireSameOrigin } from '../middleware/requireSameOrigin';
import type { BasketController } from '../server/controllers/basketController';

export function createBasketRouter(controller: BasketController): Router {
  const router = Router();
  const parseForm = express.urlencoded({ extended: false, limit: '16kb' });

  router.get('/', controller.show);
  router.post('/items', requireSameOrigin, parseForm, controller.addItem);
  router.post(
    '/items/:productId',
    requireSameOrigin,
    parseForm,
    controller.changeQuantity,
  );
  router.post(
    '/items/:productId/remove',
    requireSameOrigin,
    controller.removeItem,
  );
  router.post('/checkout', requireSameOrigin, controller.startCheckout);

  return router;
}
