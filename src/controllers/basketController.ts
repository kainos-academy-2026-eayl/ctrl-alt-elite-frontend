import type { Request, Response } from 'express';
import type { BasketResponseDto } from '../dtos/basketDto';
import { t } from '../i18n/runtime';
import { localiseProduct } from '../i18n/server';
import {
  type BasketService,
  BasketServiceError,
} from '../services/basketService';
import {
  type BasketNotice,
  clearBasketCookie,
  clearBasketNotice,
  readBasketCookie,
  readBasketNotice,
  setBasketCookie,
  setBasketNotice,
} from '../util/basketCookie';
import { buildBasketPage } from '../views/basket.page';

const MAX_PRODUCT_ID_LENGTH = 100;
// Functions, not constants, so each message is in the visitor's language.
const ADD_FAILED_MESSAGE = () => t('basket.addFailed');
const UPDATE_FAILED_MESSAGE = () => t('basket.updateFailed');
const LOAD_FAILED_MESSAGE = () => t('basket.loadFailed');
const EMPTY_CHECKOUT_MESSAGE = () => t('basket.empty');
const BASKET_RESET_MESSAGE = () => t('basket.reset');

function readProductId(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const productId = value.trim();
  return productId !== '' && productId.length <= MAX_PRODUCT_ID_LENGTH
    ? productId
    : null;
}

function readQuantityChange(body: unknown): 1 | -1 | null {
  if (typeof body !== 'object' || body === null || !('change' in body)) {
    return null;
  }
  if (body.change === '1') return 1;
  if (body.change === '-1') return -1;
  return null;
}

function messageFor(error: unknown, fallback: string): string {
  return error instanceof BasketServiceError ? error.message : fallback;
}

/**
 * Handles the basket page and its forms. It only deals with the request and
 * response; BasketService talks to the backend and basket.page.ts builds the
 * data that basket.njk renders.
 */
export class BasketController {
  constructor(private readonly basketService: BasketService) {}

  show = async (req: Request, res: Response): Promise<void> => {
    res.setHeader('Cache-Control', 'no-store');
    let notice = readBasketNotice(req.headers.cookie);
    if (notice) {
      clearBasketNotice(res);
    }

    let basket: BasketResponseDto | null = null;
    let loadErrorMessage = '';
    const basketId = readBasketCookie(req.headers.cookie);
    if (basketId !== null) {
      try {
        basket = await this.basketService.getBasket(basketId);
      } catch (error) {
        if (error instanceof BasketServiceError && error.isNotFound) {
          clearBasketCookie(res);
          notice = { isError: true, message: BASKET_RESET_MESSAGE() };
        } else {
          console.error('Unable to load the basket:', error);
          loadErrorMessage = LOAD_FAILED_MESSAGE();
        }
      }
    }

    const page = buildBasketPage({
      basket,
      notice,
      loadErrorMessage,
      focusTarget: typeof req.query.focus === 'string' ? req.query.focus : null,
      now: new Date(),
    });
    res.render('basket', page, (error: Error | null, html: string) => {
      if (error) {
        console.error('Unable to load the basket page:', error);
        this.renderUnavailablePage(res);
        return;
      }
      res.type('html').send(html);
    });
  };

  startCheckout = async (req: Request, res: Response): Promise<void> => {
    res.setHeader('Cache-Control', 'no-store');
    const basketId = readBasketCookie(req.headers.cookie);
    if (basketId === null) {
      this.redirectToBasket(res, {
        isError: true,
        message: EMPTY_CHECKOUT_MESSAGE(),
      });
      return;
    }

    try {
      const basket = await this.basketService.getBasket(basketId);
      if (basket.items.length === 0) {
        this.redirectToBasket(res, {
          isError: true,
          message: EMPTY_CHECKOUT_MESSAGE(),
        });
        return;
      }
      res.redirect(303, '/checkout');
    } catch (error) {
      this.redirectAfterFailedUpdate(res, error);
    }
  };

  addItem = async (req: Request, res: Response): Promise<void> => {
    const productId = readProductId(req.body?.productId);
    if (productId === null) {
      this.redirectToBasket(res, {
        isError: true,
        message: ADD_FAILED_MESSAGE(),
      });
      return;
    }

    try {
      const basket = await this.basketService.addItem(
        readBasketCookie(req.headers.cookie),
        productId,
      );
      setBasketCookie(res, basket.id);
      const line = basket.items.find((item) => item.id === productId);
      this.redirectToBasket(res, {
        isError: false,
        message: line
          ? t('basket.added', { name: localiseProduct(line).name })
          : t('basket.addedItem'),
      });
    } catch (error) {
      console.error('Unable to add to the basket:', error);
      this.redirectToBasket(res, {
        isError: true,
        message: messageFor(error, ADD_FAILED_MESSAGE()),
      });
    }
  };

  changeQuantity = async (req: Request, res: Response): Promise<void> => {
    const productId = readProductId(req.params.productId);
    const change = readQuantityChange(req.body);
    const basketId = readBasketCookie(req.headers.cookie);
    if (productId === null || change === null || basketId === null) {
      this.redirectToBasket(res, {
        isError: true,
        message: UPDATE_FAILED_MESSAGE(),
      });
      return;
    }

    try {
      const basket = await this.basketService.changeItemQuantity(
        basketId,
        productId,
        change,
      );
      const item = basket.items.find((line) => line.id === productId);
      const focusDirection =
        item === undefined
          ? null
          : change === 1
            ? item.quantity < basket.maxQuantity
              ? 'increase'
              : 'decrease'
            : item.quantity > 1
              ? 'decrease'
              : 'increase';
      this.redirectToBasket(
        res,
        undefined,
        focusDirection === null ? 'heading' : `${productId}:${focusDirection}`,
      );
    } catch (error) {
      this.redirectAfterFailedUpdate(res, error);
    }
  };

  removeItem = async (req: Request, res: Response): Promise<void> => {
    const productId = readProductId(req.params.productId);
    const basketId = readBasketCookie(req.headers.cookie);
    if (productId === null || basketId === null) {
      this.redirectToBasket(res, {
        isError: true,
        message: UPDATE_FAILED_MESSAGE(),
      });
      return;
    }

    try {
      const name = await this.basketService.removeItem(basketId, productId);
      this.redirectToBasket(
        res,
        {
          isError: false,
          message: name
            ? t('basket.removed', {
                name: localiseProduct({ id: productId, name }).name,
              })
            : t('basket.removedItem'),
        },
        'heading',
      );
    } catch (error) {
      this.redirectAfterFailedUpdate(res, error);
    }
  };

  /** The basket for the header count on other pages; null if there is none. */
  // The site navigation and the page itself both ask for the header basket, so
  // a request loads it only once.
  private readonly headerBaskets = new WeakMap<
    Request,
    Promise<BasketResponseDto | null>
  >();

  getHeaderBasket = (req: Request): Promise<BasketResponseDto | null> => {
    let basket = this.headerBaskets.get(req);
    if (!basket) {
      basket = this.loadHeaderBasket(req);
      this.headerBaskets.set(req, basket);
    }
    return basket;
  };

  private loadHeaderBasket = async (
    req: Request,
  ): Promise<BasketResponseDto | null> => {
    const basketId = readBasketCookie(req.headers.cookie);
    if (basketId === null) {
      return null;
    }
    try {
      return await this.basketService.getBasket(basketId);
    } catch (error) {
      if (!(error instanceof BasketServiceError && error.isNotFound)) {
        console.error('Unable to load the basket count:', error);
      }
      return null;
    }
  };

  private redirectAfterFailedUpdate(res: Response, error: unknown): void {
    if (error instanceof BasketServiceError && error.isNotFound) {
      clearBasketCookie(res);
      this.redirectToBasket(res, {
        isError: true,
        message: BASKET_RESET_MESSAGE(),
      });
      return;
    }
    console.error('Unable to update the basket:', error);
    this.redirectToBasket(res, {
      isError: true,
      message: messageFor(error, UPDATE_FAILED_MESSAGE()),
    });
  }

  /** Post/Redirect/Get: every form post ends with a redirect to the basket. */
  private redirectToBasket(
    res: Response,
    notice?: BasketNotice,
    focusTarget?: string,
  ): void {
    if (notice) {
      setBasketNotice(res, notice);
    }
    const url = focusTarget
      ? `/basket?focus=${encodeURIComponent(focusTarget)}`
      : '/basket';
    res.redirect(303, url);
  }

  private renderUnavailablePage(res: Response): void {
    res
      .status(503)
      .render('unavailable', (error: Error | null, html: string) => {
        if (error) {
          console.error('Unable to load the unavailable page:', error);
          res.type('text').send('The website is currently unavailable.');
          return;
        }
        res.type('html').send(html);
      });
  }
}
