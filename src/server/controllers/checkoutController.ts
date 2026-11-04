import type { Request, Response } from 'express';
import type { BasketResponseDto } from '../../dtos/basketDto';
import type {
  AccountDto,
  DeliveryOptionDto,
  OrderResultDto,
} from '../../dtos/checkoutDto';
import { renderErrorPage } from '../../middleware/errorHandler';
import type {
  AddressLookupService,
  LookedUpAddress,
} from '../../services/addressLookupService';
import { normalisePostcode } from '../../services/addressLookupService';
import {
  type BasketService,
  BasketServiceError,
} from '../../services/basketService';
import {
  type CheckoutService,
  CheckoutServiceError,
} from '../../services/checkoutService';
import { readAuthCookie } from '../../util/authCookie';
import { clearBasketCookie, readBasketCookie } from '../../util/basketCookie';
import {
  type CheckoutForm,
  type CheckoutValues,
  readCheckoutForm,
  validateDelivery,
  validateDetails,
  validatePostcode,
} from '../../util/checkoutForm';
import type { LoginSession } from '../../util/loginSession';
import {
  buildCheckoutPage,
  buildOrderConfirmationPage,
  CHECKOUT_LOGIN_URL,
  type CheckoutPageInput,
} from '../../views/checkout.page';

const NO_ADDRESSES_MESSAGE =
  'We could not find any addresses for that postcode. Enter your address below.';
const CHOOSE_ADDRESS_MESSAGE = 'Choose your address from the list';
// Long enough to catch a double-click or a refresh, short enough to forget.
const RECENT_ORDER_MS = 10 * 60 * 1000;

/** Everything a checkout step needs to render, apart from the time. */
type StepPage = Omit<CheckoutPageInput, 'now'> & { values: CheckoutValues };

type LoadedCheckout =
  | { kind: 'redirect'; location: string }
  | { kind: 'unavailable' }
  | {
      kind: 'ready';
      basket: BasketResponseDto;
      token: string | null;
      account: AccountDto | null;
    };

/**
 * Handles the checkout steps and the order confirmation page. Customers must
 * be logged in, because orders are paid from their account's credit balance.
 * Every step is a normal form post, so checkout works without JavaScript.
 */
export class CheckoutController {
  /** Orders placed (or being placed) for each basket, to stop double orders. */
  private readonly ordersByBasket = new Map<string, Promise<OrderResultDto>>();

  constructor(
    private readonly checkoutService: CheckoutService,
    private readonly basketService: BasketService,
    private readonly addressLookup: AddressLookupService,
    private readonly loginSession: LoginSession,
  ) {}

  show = async (req: Request, res: Response): Promise<void> => {
    res.setHeader('Cache-Control', 'no-store');
    const loaded = await this.load(req, res);
    if (loaded.kind !== 'ready') {
      this.respondNotReady(res, loaded);
      return;
    }
    this.render(res, 200, { basket: loaded.basket, account: loaded.account });
  };

  submit = async (req: Request, res: Response): Promise<void> => {
    res.setHeader('Cache-Control', 'no-store');
    const loaded = await this.load(req, res);
    if (loaded.kind !== 'ready') {
      this.respondNotReady(res, loaded);
      return;
    }
    const { basket, token, account } = loaded;
    if (!token || !account) {
      res.redirect(303, '/checkout');
      return;
    }

    const form = readCheckoutForm(req.body);
    const page: StepPage = { basket, account, values: form.values };
    switch (form.action) {
      case 'find-address':
        await this.findAddress(res, page);
        return;
      case 'use-address':
        await this.useAddress(res, page, form);
        return;
      case 'continue-to-delivery':
      case 'edit-delivery':
      case 'continue-to-payment':
      case 'place-order':
        await this.continueCheckout(res, page, form, token);
        return;
      default:
        this.render(res, 200, page);
    }
  };

  showConfirmation = async (req: Request, res: Response): Promise<void> => {
    res.setHeader('Cache-Control', 'no-store');
    const token = readAuthCookie(req.headers.cookie);
    if (!token) {
      res.redirect(303, '/login');
      return;
    }

    let result: OrderResultDto;
    try {
      result = await this.checkoutService.getOrder(
        token,
        String(req.params.orderId),
      );
    } catch (error) {
      if (error instanceof CheckoutServiceError && error.isUnauthenticated) {
        res.redirect(303, '/login');
      } else if (error instanceof CheckoutServiceError && error.isNotFound) {
        renderErrorPage(res, 404);
      } else {
        console.error('Unable to load the order confirmation:', error);
        renderErrorPage(res, 503);
      }
      return;
    }

    const basket = await this.loadHeaderBasket(req);
    res.render(
      'order-confirmation',
      buildOrderConfirmationPage({ result, basket, now: new Date() }),
      (error: Error | null, html: string) => {
        if (error) {
          console.error('Unable to load the order confirmation page:', error);
          renderErrorPage(res, 500);
          return;
        }
        res.type('html').send(html);
      },
    );
  };

  private async findAddress(res: Response, page: StepPage): Promise<void> {
    const error = validatePostcode(page.values);
    if (error) {
      this.render(res, 400, { ...page, errors: [error] });
      return;
    }
    const addresses = await this.addressLookup.findAddresses(
      page.values.postcode,
    );
    const values = {
      ...page.values,
      postcode: normalisePostcode(page.values.postcode) ?? page.values.postcode,
    };
    this.render(res, 200, {
      ...page,
      values,
      addresses,
      notice: addresses.length === 0 ? NO_ADDRESSES_MESSAGE : '',
    });
  }

  /** Copies the chosen looked-up address into the address fields. */
  private async useAddress(
    res: Response,
    page: StepPage,
    form: CheckoutForm,
  ): Promise<void> {
    const addresses = await this.addressLookup.findAddresses(
      page.values.postcode,
    );
    const chosen: LookedUpAddress | undefined =
      form.selectedAddress === null
        ? undefined
        : addresses[form.selectedAddress];
    if (!chosen) {
      this.render(res, 400, {
        ...page,
        addresses,
        errors: [{ field: 'selectedAddress', message: CHOOSE_ADDRESS_MESSAGE }],
      });
      return;
    }
    this.render(res, 200, {
      ...page,
      values: {
        ...page.values,
        addressLine1: chosen.line1,
        addressLine2: '',
        town: chosen.town,
        postcode: chosen.postcode,
      },
    });
  }

  /** Checks each finished step in turn and shows the first one with errors. */
  private async continueCheckout(
    res: Response,
    page: StepPage,
    form: CheckoutForm,
    token: string,
  ): Promise<void> {
    const values = {
      ...page.values,
      postcode: normalisePostcode(page.values.postcode) ?? page.values.postcode,
    };
    const detailsErrors = validateDetails(values);
    if (detailsErrors.length > 0) {
      this.render(res, 400, { ...page, values, errors: detailsErrors });
      return;
    }

    let deliveryOptions: DeliveryOptionDto[];
    try {
      deliveryOptions = await this.checkoutService.getDeliveryOptions();
    } catch (error) {
      console.error('Unable to load the delivery options:', error);
      renderErrorPage(res, 503);
      return;
    }
    const deliveryPage = { ...page, values, deliveryOptions };
    if (
      form.action === 'continue-to-delivery' ||
      form.action === 'edit-delivery'
    ) {
      this.render(res, 200, { ...deliveryPage, step: 'delivery' });
      return;
    }

    const deliveryErrors = validateDelivery(
      values,
      deliveryOptions.map((option) => option.id),
    );
    if (deliveryErrors.length > 0) {
      this.render(res, 400, {
        ...deliveryPage,
        step: 'delivery',
        errors: deliveryErrors,
      });
      return;
    }
    if (form.action === 'continue-to-payment') {
      this.render(res, 200, { ...deliveryPage, step: 'payment' });
      return;
    }
    await this.placeOrder(res, { ...deliveryPage, step: 'payment' }, token);
  }

  private async placeOrder(
    res: Response,
    page: StepPage,
    token: string,
  ): Promise<void> {
    const { basket, values } = page;
    let result: OrderResultDto;
    try {
      result = await this.placeOrderOnce(basket, values, token);
    } catch (error) {
      if (error instanceof CheckoutServiceError && error.isUnauthenticated) {
        res.redirect(303, CHECKOUT_LOGIN_URL);
      } else if (error instanceof CheckoutServiceError && error.isRejected) {
        this.render(res, 409, { ...page, notice: error.message });
      } else {
        console.error('Unable to place the order:', error);
        this.render(res, 503, {
          ...page,
          notice:
            'Sorry, we could not place your order. You have not been charged. Please try again.',
        });
      }
      return;
    }
    // The basket has been bought, so the next visit starts a new one.
    clearBasketCookie(res);
    res.redirect(
      303,
      `/checkout/confirmation/${encodeURIComponent(result.order.id)}`,
    );
  }

  private placeOrderOnce(
    basket: BasketResponseDto,
    values: CheckoutValues,
    token: string,
  ): Promise<OrderResultDto> {
    const existing = this.ordersByBasket.get(basket.id);
    if (existing) return existing;

    const order = this.checkoutService.placeOrder(token, {
      items: basket.items.map((item) => ({
        productId: item.id,
        quantity: item.quantity,
      })),
      customer: {
        firstName: values.firstName,
        lastName: values.lastName,
        email: values.email,
        phone: values.phone,
      },
      address: {
        line1: values.addressLine1,
        line2: values.addressLine2,
        town: values.town,
        postcode: values.postcode,
      },
      deliveryOption: values.deliveryOption,
    });
    this.ordersByBasket.set(basket.id, order);
    order.then(
      () => {
        setTimeout(
          () => this.ordersByBasket.delete(basket.id),
          RECENT_ORDER_MS,
        ).unref();
      },
      () => this.ordersByBasket.delete(basket.id),
    );
    return order;
  }

  private async load(req: Request, res: Response): Promise<LoadedCheckout> {
    const basketId = readBasketCookie(req.headers.cookie);
    if (basketId === null) {
      return { kind: 'redirect', location: '/basket' };
    }

    // A basket that was just ordered goes to its confirmation, not checkout.
    const recentOrder = this.ordersByBasket.get(basketId);
    if (recentOrder) {
      const result = await recentOrder.catch(() => null);
      if (result) {
        return {
          kind: 'redirect',
          location: `/checkout/confirmation/${encodeURIComponent(result.order.id)}`,
        };
      }
    }

    let basket: BasketResponseDto;
    try {
      basket = await this.basketService.getBasket(basketId);
    } catch (error) {
      if (error instanceof BasketServiceError && error.isNotFound) {
        return { kind: 'redirect', location: '/basket' };
      }
      console.error('Unable to load the basket for checkout:', error);
      return { kind: 'unavailable' };
    }
    if (basket.items.length === 0) {
      return { kind: 'redirect', location: '/basket' };
    }

    // Logged in means the same as in the site header: a valid login session.
    // The backend token is also needed to read the credit balance and pay.
    const session = await this.loginSession.getAccount(req, res);
    const token = readAuthCookie(req.headers.cookie);
    if (!session || !token) {
      return { kind: 'ready', basket, token: null, account: null };
    }
    try {
      const account = await this.checkoutService.getAccount(token);
      return { kind: 'ready', basket, token, account };
    } catch (error) {
      if (error instanceof CheckoutServiceError && error.isUnauthenticated) {
        // An expired login is treated like a guest, who is asked to log in.
        return { kind: 'ready', basket, token: null, account: null };
      }
      console.error('Unable to load the account for checkout:', error);
      return { kind: 'unavailable' };
    }
  }

  private respondNotReady(
    res: Response,
    loaded: Exclude<LoadedCheckout, { kind: 'ready' }>,
  ): void {
    if (loaded.kind === 'redirect') {
      res.redirect(303, loaded.location);
    } else {
      renderErrorPage(res, 503);
    }
  }

  private async loadHeaderBasket(
    req: Request,
  ): Promise<BasketResponseDto | null> {
    const basketId = readBasketCookie(req.headers.cookie);
    if (basketId === null) return null;
    try {
      return await this.basketService.getBasket(basketId);
    } catch {
      return null;
    }
  }

  private render(
    res: Response,
    status: number,
    input: Omit<CheckoutPageInput, 'now'>,
  ): void {
    const page = buildCheckoutPage({ ...input, now: new Date() });
    res.render('checkout', page, (error: Error | null, html: string) => {
      if (error) {
        console.error('Unable to load the checkout page:', error);
        renderErrorPage(res, 500);
        return;
      }
      res.status(status).type('html').send(html);
    });
  }
}
