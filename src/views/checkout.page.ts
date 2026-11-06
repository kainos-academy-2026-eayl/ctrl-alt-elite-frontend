import type { BasketResponseDto } from '../dtos/basketDto';
import type {
  AccountDto,
  DeliveryOptionDto,
  OrderResultDto,
} from '../dtos/checkoutDto';
import { currentPreferences } from '../i18n/context';
import { intlLocale } from '../i18n/locales';
import { formatPounds } from '../i18n/money';
import { t } from '../i18n/runtime';
import { localiseProduct } from '../i18n/server';
import type { LookedUpAddress } from '../services/addressLookupService';
import {
  type CheckoutDetailsSource,
  type CheckoutFieldError,
  type CheckoutValues,
  emptyCheckoutValues,
} from '../util/checkoutForm';
import {
  type BasketSummary,
  formatItemCount,
  toBasketSummary,
} from './basket.page';

/**
 * A delivery option's name and description in the visitor's language. The
 * backend sends English; known options are translated, others shown as sent.
 */
export function translateDelivery(option: {
  id: string;
  name: string;
  description: string;
}): { name: string; description: string } {
  if (option.id === 'standard' || option.id === 'express') {
    return {
      name: t(`delivery.${option.id}.name`),
      description: t(`delivery.${option.id}.description`),
    };
  }
  const miles = /^(\d+(?:\.\d+)?) miles away$/.exec(option.description)?.[1];
  if (option.id.startsWith('collection-') && miles) {
    return {
      name: t('delivery.collection.name'),
      description: t('delivery.collection.description', {
        miles: Number(miles).toLocaleString(
          intlLocale(currentPreferences().locale),
        ),
      }),
    };
  }
  return { name: option.name, description: option.description };
}

/*
 * Page models for checkout.njk and order-confirmation.njk. Prices, totals and
 * labels are worked out here so the templates only render.
 */

export const CHECKOUT_URL = '/checkout';
export const CHECKOUT_LOGIN_URL = `/login?returnTo=${encodeURIComponent(CHECKOUT_URL)}`;
export const REGISTER_URL = '/register';

export type CheckoutStep = 'details' | 'delivery' | 'payment';

export interface CheckoutLineView {
  name: string;
  quantity: number;
  lineTotal: string;
}

export interface DeliveryOptionView {
  id: string;
  name: string;
  description: string;
  price: string;
  isChecked: boolean;
}

export interface CheckoutErrorView {
  message: string;
  href: string;
}

export interface CheckoutPage {
  detailsSource: CheckoutDetailsSource;
  basketSummary: BasketSummary;
  currentYear: number;
  isGuest: boolean;
  loginUrl: string;
  registerUrl: string;
  checkoutUrl: string;
  /** The basket, shown beside every step. */
  lines: CheckoutLineView[];
  itemCountText: string;
  itemsTotal: string;
  step: CheckoutStep;
  values: CheckoutValues;
  errors: CheckoutErrorView[];
  fieldErrors: Partial<Record<string, string>>;
  /** A message from the backend, such as not enough credit. */
  notice: string;
  orderOutcomeUnknown: boolean;
  addresses: { index: number; label: string }[];
  homeDeliveryOptions: DeliveryOptionView[];
  collectionOptions: DeliveryOptionView[];
  /** Your details and address, once step 1 is complete. */
  detailsSummary: {
    name: string;
    email: string;
    phone: string;
    addressLines: string[];
  } | null;
  /** The chosen delivery, once step 2 is complete. */
  deliverySummary: { name: string; description: string; price: string } | null;
  payment: {
    creditBalance: string;
    itemsTotal: string;
    deliveryPrice: string;
    total: string;
    balanceAfter: string;
    canAfford: boolean;
    /** Sent back with Checkout, so a changed basket is never charged unseen. */
    totalPence: number;
  } | null;
}

export interface CheckoutPageInput {
  detailsSource?: CheckoutDetailsSource;
  basket: BasketResponseDto;
  /** null for a guest, who is asked to log in or create an account. */
  account: AccountDto | null;
  step?: CheckoutStep;
  values?: CheckoutValues;
  errors?: readonly CheckoutFieldError[];
  notice?: string;
  orderOutcomeUnknown?: boolean;
  addresses?: readonly LookedUpAddress[];
  deliveryOptions?: readonly DeliveryOptionDto[];
  now: Date;
}

function toDeliveryView(
  option: DeliveryOptionDto,
  selectedId: string,
): DeliveryOptionView {
  return {
    id: option.id,
    ...translateDelivery(option),
    price:
      option.pricePence === 0
        ? t('checkout.free')
        : formatPounds(option.pricePence),
    isChecked: option.id === selectedId,
  };
}

function addressLines(values: CheckoutValues): string[] {
  return [
    values.addressLine1,
    values.addressLine2,
    values.town,
    values.postcode,
  ].filter((line) => line !== '');
}

export function buildCheckoutPage({
  basket,
  account,
  step = 'details',
  values,
  detailsSource = 'manual',
  errors = [],
  notice = '',
  orderOutcomeUnknown = false,
  addresses = [],
  deliveryOptions = [],
  now,
}: CheckoutPageInput): CheckoutPage {
  // The form always starts empty; nothing is filled in from the account.
  const formValues: CheckoutValues = values ?? emptyCheckoutValues();
  const selectedId = formValues.deliveryOption || 'standard';
  const delivery = deliveryOptions.find(
    (option) => option.id === formValues.deliveryOption,
  );
  const isPastDetails = step !== 'details';
  const isPayment = step === 'payment' && delivery !== undefined;
  const totalPence = basket.totalPence + (delivery?.pricePence ?? 0);
  const creditPence = account?.creditBalancePence ?? 0;

  return {
    detailsSource,
    basketSummary: toBasketSummary(basket),
    currentYear: now.getFullYear(),
    isGuest: account === null,
    loginUrl: CHECKOUT_LOGIN_URL,
    registerUrl: REGISTER_URL,
    checkoutUrl: CHECKOUT_URL,
    lines: basket.items.map((item) => ({
      name: localiseProduct(item).name,
      quantity: item.quantity,
      lineTotal: formatPounds(item.lineTotalPence),
    })),
    itemCountText: formatItemCount(basket.itemCount),
    itemsTotal: formatPounds(basket.totalPence),
    step,
    values: formValues,
    errors: errors.map((error) => ({
      message: error.message,
      href: `#${error.field}`,
    })),
    fieldErrors: Object.fromEntries(
      errors.map((error) => [error.field, error.message]),
    ),
    notice,
    orderOutcomeUnknown,
    addresses: addresses.map((address, index) => ({
      index,
      label: `${address.line1}, ${address.town}, ${address.postcode}`,
    })),
    homeDeliveryOptions: deliveryOptions
      .filter((option) => option.kind === 'delivery')
      .map((option) => toDeliveryView(option, selectedId)),
    collectionOptions: deliveryOptions
      .filter((option) => option.kind === 'collection')
      .map((option) => toDeliveryView(option, selectedId)),
    detailsSummary: isPastDetails
      ? {
          name: `${formValues.firstName} ${formValues.lastName}`,
          email: formValues.email,
          phone: formValues.phone,
          addressLines: addressLines(formValues),
        }
      : null,
    deliverySummary:
      isPayment && delivery ? toDeliveryView(delivery, delivery.id) : null,
    payment: isPayment
      ? {
          creditBalance: formatPounds(creditPence),
          itemsTotal: formatPounds(basket.totalPence),
          deliveryPrice: formatPounds(delivery?.pricePence ?? 0),
          total: formatPounds(totalPence),
          balanceAfter: formatPounds(Math.max(creditPence - totalPence, 0)),
          canAfford: creditPence >= totalPence,
          totalPence,
        }
      : null,
  };
}

export interface OrderConfirmationPage {
  basketSummary: BasketSummary;
  currentYear: number;
  orderNumber: string;
  orderDate: string;
  firstName: string;
  lines: {
    name: string;
    quantity: number;
    unitPrice: string;
    lineTotal: string;
  }[];
  itemsTotal: string;
  deliveryPrice: string;
  total: string;
  creditBalance: string;
  delivery: { name: string; description: string } | null;
  contact: { name: string; email: string; phone: string };
  addressLines: string[];
}

export function buildOrderConfirmationPage({
  result,
  basket,
  now,
}: {
  result: OrderResultDto;
  basket: BasketResponseDto | null;
  now: Date;
}): OrderConfirmationPage {
  const { order } = result;
  return {
    basketSummary: toBasketSummary(basket),
    currentYear: now.getFullYear(),
    orderNumber: order.id,
    orderDate: new Intl.DateTimeFormat(
      intlLocale(currentPreferences().locale),
      {
        dateStyle: 'long',
        timeStyle: 'short',
        timeZone: 'Europe/London',
      },
    ).format(new Date(order.createdAt)),
    firstName: order.customer.firstName,
    lines: order.items.map((item) => ({
      name: localiseProduct({ id: item.productId, name: item.name }).name,
      quantity: item.quantity,
      unitPrice: formatPounds(item.unitPricePence),
      lineTotal: formatPounds(item.lineTotalPence),
    })),
    itemsTotal: formatPounds(order.itemsTotalPence),
    deliveryPrice:
      order.deliveryPricePence === 0
        ? t('checkout.free')
        : formatPounds(order.deliveryPricePence),
    total: formatPounds(order.totalPence),
    creditBalance: formatPounds(result.creditBalancePence),
    delivery: order.delivery ? translateDelivery(order.delivery) : null,
    contact: {
      name: `${order.customer.firstName} ${order.customer.lastName}`.trim(),
      email: order.customer.email,
      phone: order.customer.phone,
    },
    addressLines: [
      order.address.line1,
      order.address.line2 ?? '',
      order.address.town,
      order.address.postcode,
    ].filter((line) => line !== ''),
  };
}
