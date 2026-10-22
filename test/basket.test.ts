import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import {
  addedMessage,
  type BasketItem,
  type BasketResponse,
  calculateTotals,
  createCheckoutSnapshot,
  formatItemCount,
  formatPrice,
  isBasketResponse,
  isValidItem,
  MAX_QUANTITY,
  nextAddCount,
  parseProduct,
} from '../src/controllers/lib/basketLogic';

const lamp: BasketItem = {
  id: 'sample-lamp',
  name: 'Desk Lamp',
  unitPricePence: 2499,
  quantity: 2,
};
const mug: BasketItem = {
  id: 'sample-mug',
  name: 'Ceramic Mug',
  unitPricePence: 550,
  quantity: 1,
};

describe('formatPrice', () => {
  it('formats pence as pounds', () => {
    assert.equal(formatPrice(2499), '£24.99');
    assert.equal(formatPrice(550), '£5.50');
    assert.equal(formatPrice(0), '£0.00');
  });

  it('adds thousands separators', () => {
    assert.equal(formatPrice(123456), '£1,234.56');
  });
});

describe('formatItemCount', () => {
  it('uses "item" for exactly one', () => {
    assert.equal(formatItemCount(1), '1 item');
  });

  it('uses "items" for zero or more than one', () => {
    assert.equal(formatItemCount(0), '0 items');
    assert.equal(formatItemCount(3), '3 items');
  });
});

describe('isValidItem', () => {
  it('accepts a complete item', () => {
    assert.equal(isValidItem(lamp), true);
  });

  it('accepts a free item and the maximum quantity', () => {
    assert.equal(
      isValidItem({ ...lamp, unitPricePence: 0, quantity: MAX_QUANTITY }),
      true,
    );
  });

  for (const [description, value] of [
    ['null', null],
    ['a string', 'lamp'],
    ['an empty id', { ...lamp, id: '' }],
    ['a missing name', { ...lamp, name: undefined }],
    ['a negative price', { ...lamp, unitPricePence: -1 }],
    ['a fractional price', { ...lamp, unitPricePence: 24.99 }],
    ['a quantity of 0', { ...lamp, quantity: 0 }],
    ['a quantity over the maximum', { ...lamp, quantity: MAX_QUANTITY + 1 }],
    ['a fractional quantity', { ...lamp, quantity: 1.5 }],
  ] as const) {
    it(`rejects ${description}`, () => {
      assert.equal(isValidItem(value), false);
    });
  }
});

describe('isBasketResponse', () => {
  const response: BasketResponse = {
    id: '6f1c2f0e-6a8e-4c43-9a51-3f3c9b8f4b11',
    items: [
      { ...lamp, lineTotalPence: 4998 },
      { ...mug, lineTotalPence: 550 },
    ],
    itemCount: 3,
    totalPence: 5548,
    maxQuantity: MAX_QUANTITY,
  };

  it('accepts a consistent basket from the server', () => {
    assert.equal(isBasketResponse(response), true);
  });

  it('accepts an empty basket', () => {
    assert.equal(
      isBasketResponse({ ...response, items: [], itemCount: 0, totalPence: 0 }),
      true,
    );
  });

  for (const [description, value] of [
    ['null', null],
    ['a missing id', { ...response, id: '' }],
    ['items that are not a list', { ...response, items: 'lamp' }],
    [
      'a line total that does not match',
      { ...response, items: [{ ...lamp, lineTotalPence: 1 }] },
    ],
    ['an item count that does not add up', { ...response, itemCount: 4 }],
    ['a total that does not add up', { ...response, totalPence: 1 }],
    ['a missing maximum quantity', { ...response, maxQuantity: undefined }],
  ] as const) {
    it(`rejects ${description}`, () => {
      assert.equal(isBasketResponse(value), false);
    });
  }
});

describe('parseProduct', () => {
  it('converts button data into a basket item with a quantity of 1', () => {
    assert.deepEqual(
      parseProduct({ id: 'sample-lamp', name: 'Desk Lamp', price: '24.99' }),
      {
        id: 'sample-lamp',
        name: 'Desk Lamp',
        unitPricePence: 2499,
        quantity: 1,
      },
    );
  });

  it('trims whitespace from the id and name', () => {
    assert.deepEqual(
      parseProduct({ id: ' sample-mug ', name: ' Ceramic Mug ', price: '5.5' }),
      {
        id: 'sample-mug',
        name: 'Ceramic Mug',
        unitPricePence: 550,
        quantity: 1,
      },
    );
  });

  it('rounds prices to the nearest penny', () => {
    assert.equal(
      parseProduct({ id: 'a', name: 'A', price: '0.295' })?.unitPricePence,
      30,
    );
  });

  for (const [description, input] of [
    ['a missing id', { id: null, name: 'Desk Lamp', price: '24.99' }],
    ['a blank name', { id: 'sample-lamp', name: '  ', price: '24.99' }],
    ['a missing price', { id: 'sample-lamp', name: 'Desk Lamp', price: null }],
    [
      'a non-numeric price',
      { id: 'sample-lamp', name: 'Desk Lamp', price: 'abc' },
    ],
    ['a negative price', { id: 'sample-lamp', name: 'Desk Lamp', price: '-1' }],
  ] as const) {
    it(`returns null for ${description}`, () => {
      assert.equal(parseProduct(input), null);
    });
  }
});

describe('calculateTotals', () => {
  it('calculates line totals, item count and overall total', () => {
    assert.deepEqual(calculateTotals([lamp, mug]), {
      lines: [
        { ...lamp, lineTotalPence: 4998 },
        { ...mug, lineTotalPence: 550 },
      ],
      itemCount: 3,
      totalPence: 5548,
    });
  });

  it('returns zero totals for an empty basket', () => {
    assert.deepEqual(calculateTotals([]), {
      lines: [],
      itemCount: 0,
      totalPence: 0,
    });
  });
});

describe('add to basket notification', () => {
  describe('nextAddCount', () => {
    it('starts at 1 when nothing was recently added', () => {
      assert.equal(nextAddCount(null, 'sample-notebook'), 1);
    });

    it('counts up for the same product', () => {
      assert.equal(
        nextAddCount(
          { productId: 'sample-notebook', count: 4 },
          'sample-notebook',
        ),
        5,
      );
    });

    it('starts again at 1 for a different product', () => {
      assert.equal(
        nextAddCount({ productId: 'sample-notebook', count: 4 }, 'sample-mug'),
        1,
      );
    });
  });

  describe('addedMessage', () => {
    it('names the product when it is added once', () => {
      assert.equal(
        addedMessage('A5 Notebook', 1),
        'A5 Notebook added to your basket',
      );
    });

    it('shows the running count when added more than once', () => {
      assert.equal(
        addedMessage('A5 Notebook', 5),
        '5 × A5 Notebook added to your basket',
      );
    });
  });
});

describe('createCheckoutSnapshot', () => {
  it('captures the exact items, quantities and totals with a timestamp', () => {
    const createdAt = new Date('2026-10-21T14:00:00.000Z');

    assert.deepEqual(createCheckoutSnapshot([lamp, mug], createdAt), {
      version: 1,
      createdAt: '2026-10-21T14:00:00.000Z',
      itemCount: 3,
      totalPence: 5548,
      items: [
        { ...lamp, lineTotalPence: 4998 },
        { ...mug, lineTotalPence: 550 },
      ],
    });
  });
});
