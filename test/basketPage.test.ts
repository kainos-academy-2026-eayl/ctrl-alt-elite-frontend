import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import {
  type BasketResponseDto,
  isBasketId,
  isBasketResponseDto,
} from '../src/dtos/basketDto';
import {
  buildBasketPage,
  formatItemCount,
  formatPrice,
} from '../src/views/basket.page';
import { buildHomepage } from '../src/views/homepage.page';

const BASKET_ID = '9ab2045d-fed8-4003-8051-6d2c1305a002';
const NOW = new Date('2026-10-29T12:00:00Z');

const basketResponse: BasketResponseDto = {
  id: BASKET_ID,
  items: [
    {
      id: 'jeans',
      name: 'Swaggy Jeans',
      unitPricePence: 2499,
      quantity: 2,
      lineTotalPence: 4998,
    },
    {
      id: 'hoodie',
      name: 'Kainos Hoodie',
      unitPricePence: 899,
      quantity: 99,
      lineTotalPence: 89001,
    },
  ],
  itemCount: 101,
  totalPence: 93999,
  maxQuantity: 99,
};

describe('formatPrice and formatItemCount', () => {
  it('formats pence as pounds with thousands separators', () => {
    assert.equal(formatPrice(2499), '£24.99');
    assert.equal(formatPrice(0), '£0.00');
    assert.equal(formatPrice(123456), '£1,234.56');
  });

  it('uses "item" for exactly one and "items" otherwise', () => {
    assert.equal(formatItemCount(1), '1 item');
    assert.equal(formatItemCount(0), '0 items');
  });
});

describe('basket DTO checks', () => {
  it('only accepts UUID basket ids', () => {
    assert.equal(isBasketId(BASKET_ID), true);
    assert.equal(isBasketId('not-a-uuid'), false);
  });

  it('accepts a consistent basket', () => {
    assert.equal(isBasketResponseDto(basketResponse), true);
  });

  for (const [description, value] of [
    ['null', null],
    [
      'a basket whose total does not add up',
      { ...basketResponse, totalPence: 1 },
    ],
    [
      'a basket whose item count does not add up',
      { ...basketResponse, itemCount: 1 },
    ],
    [
      'a line above the maximum quantity',
      { ...basketResponse, maxQuantity: 10 },
    ],
  ] as const) {
    it(`rejects ${description}`, () => {
      assert.equal(isBasketResponseDto(value), false);
    });
  }

  it('rejects monetary values outside the safe integer range', () => {
    const unsafePrice = Number.MAX_SAFE_INTEGER + 1;
    assert.equal(
      isBasketResponseDto({
        ...basketResponse,
        items: [
          {
            ...basketResponse.items[0],
            unitPricePence: unsafePrice,
            lineTotalPence: unsafePrice * 2,
          },
        ],
        itemCount: 2,
        totalPence: unsafePrice * 2,
      }),
      false,
    );
    assert.equal(
      isBasketResponseDto({
        ...basketResponse,
        items: [
          {
            ...basketResponse.items[0],
            unitPricePence: Number.MAX_SAFE_INTEGER,
            quantity: 2,
            lineTotalPence: Number.MAX_SAFE_INTEGER * 2,
          },
        ],
        itemCount: 2,
        totalPence: Number.MAX_SAFE_INTEGER * 2,
      }),
      false,
    );
  });
});

describe('buildBasketPage', () => {
  it('turns the backend basket into display-ready lines and totals', () => {
    const page = buildBasketPage({
      basket: basketResponse,
      notice: null,
      loadErrorMessage: '',
      now: NOW,
    });
    assert.equal(page.isEmpty, false);
    assert.equal(page.total, '£939.99');
    assert.deepEqual(page.basketSummary, {
      itemCount: 101,
      itemCountText: '101 items',
    });
    assert.equal(page.currentYear, 2026);
    assert.deepEqual(page.lines[0], {
      name: 'Swaggy Jeans',
      id: 'jeans',
      quantity: 2,
      unitPrice: '£24.99',
      lineTotal: '£49.98',
      canDecrease: true,
      canIncrease: true,
      focusDecrease: false,
      focusIncrease: false,
      updateUrl: '/basket/items/jeans',
      removeUrl: '/basket/items/jeans/remove',
    });
    assert.equal(page.lines[1]?.canIncrease, false);
  });

  it('stops the quantity going below 1', () => {
    const page = buildBasketPage({
      basket: {
        ...basketResponse,
        items: [
          { ...basketResponse.items[0], quantity: 1, lineTotalPence: 2499 },
        ],
        itemCount: 1,
        totalPence: 2499,
      } as BasketResponseDto,
      notice: null,
      loadErrorMessage: '',
      now: NOW,
    });
    assert.equal(page.lines[0]?.canDecrease, false);
  });

  it('encodes product ids so they cannot change the form URL path', () => {
    const page = buildBasketPage({
      basket: {
        ...basketResponse,
        items: [{ ...basketResponse.items[0], id: '../admin?x=1' }],
        itemCount: 2,
        totalPence: 4998,
      } as BasketResponseDto,
      notice: null,
      loadErrorMessage: '',
      now: NOW,
    });
    assert.equal(page.lines[0]?.updateUrl, '/basket/items/..%2Fadmin%3Fx%3D1');
  });

  it('shows an empty basket when there is no basket yet', () => {
    const page = buildBasketPage({
      basket: null,
      notice: { isError: false, message: 'Hello' },
      loadErrorMessage: '',
      now: NOW,
    });
    assert.equal(page.isEmpty, true);
    assert.equal(page.total, '£0.00');
    assert.equal(page.basketSummary.itemCountText, '0 items');
    assert.deepEqual(page.notice, { isError: false, message: 'Hello' });
  });
});

describe('buildHomepage', () => {
  it('builds the account menu, product forms and basket count', () => {
    const page = buildHomepage({
      account: { name: 'Grace' },
      products: [{ id: 'jeans', name: 'Swaggy Jeans', price: '24.99' }],
      basket: basketResponse,
    });
    assert.deepEqual(page, {
      isAuthenticated: true,
      accountName: 'Grace',
      products: [{ id: 'jeans', name: 'Swaggy Jeans', price: '£24.99' }],
      basketSummary: { itemCount: 101, itemCountText: '101 items' },
      addToBasketUrl: '/basket/items',
    });
  });

  it('shows guests the Account label and an empty basket', () => {
    const page = buildHomepage({ account: null, products: [], basket: null });
    assert.equal(page.isAuthenticated, false);
    assert.equal(page.accountName, 'Account');
    assert.equal(page.basketSummary.itemCount, 0);
  });
});
