import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  it,
  vi,
} from 'vitest';
import { createApp } from '../src/app';
import type { PlaceOrderRequestDto } from '../src/dtos/checkoutDto';
import {
  AddressLookupService,
  normalisePostcode,
} from '../src/services/addressLookupService';
import {
  readCheckoutForm,
  validateDelivery,
  validateDetails,
} from '../src/util/checkoutForm';

const BACKEND_ORIGIN = 'https://backend.example.test';
const TEST_JWT_SECRET = 'test-only-profile-secret-with-at-least-32-bytes';
const ORDER_ID = 'dcfea2c5-bd8f-4297-91dd-7f791e7e07e3';
const TOKEN = 'customer.jwt.token';

const DETAILS = {
  firstName: 'Sam',
  lastName: 'Jones',
  email: 'sam@example.com',
  phone: '07700 900123',
  postcode: 'bt11aa',
  addressLine1: '1 High Street',
  addressLine2: '',
  town: 'Belfast',
};

const DELIVERY_OPTIONS = [
  ['standard', 'delivery', 'Standard delivery', '3–5 working days', 0],
  ['express', 'delivery', 'Express delivery', '1–2 working days', 499],
  ['collection-1', 'collection', 'Collection point', '0.5 miles away', 0],
  ['collection-2', 'collection', 'Collection point', '1.2 miles away', 0],
  ['collection-3', 'collection', 'Collection point', '2.4 miles away', 0],
].map(([id, kind, name, description, pricePence]) => ({
  id,
  kind,
  name,
  description,
  pricePence,
}));

function orderResult(creditBalancePence: number) {
  return {
    order: {
      id: ORDER_ID,
      status: 'PENDING',
      createdAt: '2026-11-04T10:08:00.000Z',
      items: [
        {
          productId: 'lamp-1',
          name: 'Desk Lamp',
          unitPricePence: 2499,
          quantity: 2,
          lineTotalPence: 4998,
        },
      ],
      itemsTotalPence: 4998,
      deliveryPricePence: 499,
      totalPence: 5497,
      delivery: {
        id: 'express',
        name: 'Express delivery',
        description: '1–2 working days',
      },
      customer: {
        firstName: 'Sam',
        lastName: 'Jones',
        email: 'sam@example.com',
        phone: '07700900123',
      },
      address: {
        line1: '1 High Street',
        line2: null,
        town: 'Belfast',
        postcode: 'BT1 1AA',
      },
    },
    creditBalancePence,
  };
}

interface FakeBackend {
  creditBalancePence: number;
  orderStatus: number;
  orderMessage: string;
  isAccountExpired: boolean;
  orders: PlaceOrderRequestDto[];
  /** Holds POST /api/orders open until released, to test double submits. */
  holdOrders: Promise<void> | null;
}

let backend: FakeBackend;
// Each test gets its own basket, because an ordered basket is remembered.
let BASKET_ID: string;
let CUSTOMER_COOKIES: string;
let LOGIN_COOKIES: string;

function resetBackend(): void {
  BASKET_ID = randomUUID();
  backend = {
    creditBalancePence: 50000,
    orderStatus: 201,
    orderMessage: '',
    isAccountExpired: false,
    orders: [],
    holdOrders: null,
  };
}

async function handleBackend(req: Request): Promise<Response> {
  const { pathname } = new URL(req.url);
  const isLoggedIn = req.headers.get('authorization') === `Bearer ${TOKEN}`;
  if (pathname === `/api/baskets/${BASKET_ID}`) {
    return Response.json({
      id: BASKET_ID,
      items: [
        {
          id: 'lamp-1',
          name: 'Desk Lamp',
          unitPricePence: 2499,
          quantity: 2,
          lineTotalPence: 4998,
        },
      ],
      itemCount: 2,
      totalPence: 4998,
      maxQuantity: 99,
    });
  }
  if (pathname === '/api/delivery-options') {
    return Response.json({ deliveryOptions: DELIVERY_OPTIONS });
  }
  if (pathname === '/api/auth/login') {
    return Response.json({
      user: {
        id: 'customer-1',
        firstName: 'Sam',
        lastName: 'Jones',
        email: 'sam@example.com',
        role: 'CUSTOMER',
      },
      token: TOKEN,
    });
  }
  if (!isLoggedIn || backend.isAccountExpired) {
    return Response.json(
      { message: 'Authentication required.' },
      { status: 401 },
    );
  }
  if (pathname === '/api/account') {
    return Response.json({
      account: {
        firstName: 'Sam',
        lastName: 'Jones',
        email: 'sam@example.com',
        creditBalancePence: backend.creditBalancePence,
      },
    });
  }
  if (pathname === '/api/orders' && req.method === 'POST') {
    backend.orders.push((await req.json()) as PlaceOrderRequestDto);
    await backend.holdOrders;
    if (backend.orderStatus !== 201) {
      return Response.json(
        { message: backend.orderMessage },
        { status: backend.orderStatus },
      );
    }
    return Response.json(orderResult(44503), { status: 201 });
  }
  if (pathname === `/api/orders/${ORDER_ID}`) {
    return Response.json(orderResult(44503));
  }
  if (pathname.startsWith('/api/orders/')) {
    return Response.json({ message: 'Order not found.' }, { status: 404 });
  }
  throw new Error(`Unexpected backend request: ${req.method} ${req.url}`);
}

function listen(server: Server): Promise<string> {
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      resolve(`http://127.0.0.1:${(server.address() as AddressInfo).port}`);
    });
  });
}

describe('checkout (server-rendered, no JavaScript)', () => {
  const fetchFrontend = globalThis.fetch;
  let frontend: Server;
  let base: string;

  beforeAll(async () => {
    frontend = createServer(
      createApp(BACKEND_ORIGIN, { jwtSecret: TEST_JWT_SECRET }),
    );
    base = await listen(frontend);
  });

  afterAll(async () => {
    await new Promise((resolve) => frontend.close(resolve));
  });

  beforeEach(async () => {
    resetBackend();
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const req = new Request(input, init);
      assert.equal(new URL(req.url).origin, BACKEND_ORIGIN);
      return handleBackend(req);
    });
    // Log in through the real form, so the site's login session is set too.
    const login = await fetchFrontend(`${base}/login`, {
      method: 'POST',
      redirect: 'manual',
      headers: {
        origin: base,
        'content-type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        email: 'sam@example.com',
        password: 'Password1@',
      }),
    });
    LOGIN_COOKIES = login.headers
      .getSetCookie()
      .map((cookie) => cookie.split(';')[0])
      .join('; ');
    CUSTOMER_COOKIES = `basket_id=${BASKET_ID}; ${LOGIN_COOKIES}`;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function getCheckout(cookies: string = CUSTOMER_COOKIES) {
    return fetchFrontend(`${base}/checkout`, {
      redirect: 'manual',
      headers: { cookie: cookies },
    });
  }

  function postCheckout(
    form: Record<string, string>,
    cookies: string = CUSTOMER_COOKIES,
  ) {
    return fetchFrontend(`${base}/checkout`, {
      method: 'POST',
      redirect: 'manual',
      headers: {
        origin: base,
        cookie: cookies,
        'content-type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams(form),
    });
  }

  it('asks guests to log in or create an account first', async () => {
    const res = await getCheckout(`basket_id=${BASKET_ID}`);
    assert.equal(res.status, 200);
    const html = await res.text();
    assert.match(html, /Log in to check out/);
    assert.match(
      html,
      /<a class="basket-button" href="\/login\?returnTo=%2Fcheckout">Log in<\/a>/,
    );
    assert.match(
      html,
      /<a class="checkout-secondary-button" href="\/register">Create an account<\/a>/,
    );
    assert.doesNotMatch(html, /name="firstName"/);
    assert.doesNotMatch(html, /<script/);
  });

  it('treats an expired login like a guest', async () => {
    backend.isAccountExpired = true;
    const html = await (await getCheckout()).text();
    assert.match(html, /Log in to check out/);
  });

  it('needs the site login session, not just a backend token', async () => {
    const html = await (
      await getCheckout(`basket_id=${BASKET_ID}; auth_token=${TOKEN}`)
    ).text();
    assert.match(html, /Log in to check out/);
    assert.doesNotMatch(html, /name="firstName"/);
  });

  it('sends people without a basket back to the basket page', async () => {
    const res = await getCheckout(`auth_token=${TOKEN}`);
    assert.equal(res.status, 303);
    assert.equal(res.headers.get('location'), '/basket');
  });

  it('starts with an empty details form', async () => {
    const res = await getCheckout();
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('cache-control'), 'no-store');
    const html = await res.text();
    assert.match(html, /id="firstName" name="firstName" type="text" value=""/);
    assert.match(html, /id="email" name="email" type="email" value=""/);
    assert.match(html, /id="phone" name="phone" type="tel" value=""/);
    assert.match(html, /value="find-address" formnovalidate>Find address/);
    assert.match(html, /value="continue-to-delivery">Continue to delivery/);
    assert.match(html, /2 × Desk Lamp/);
    assert.doesNotMatch(html, /<script/);
  });

  it('finds addresses for a postcode and copies the chosen one into the form', async () => {
    const found = await postCheckout({ ...DETAILS, action: 'find-address' });
    assert.equal(found.status, 200);
    const foundHtml = await found.text();
    assert.match(foundHtml, /Choose your address/);
    assert.equal((foundHtml.match(/name="selectedAddress"/g) ?? []).length, 6);
    assert.match(foundHtml, /, Belfast, BT1 1AA<\/label>/);
    assert.match(
      foundHtml,
      /id="postcode" name="postcode" type="text" value="BT1 1AA"/,
    );

    const used = await postCheckout({
      ...DETAILS,
      addressLine1: '',
      town: '',
      selectedAddress: '2',
      action: 'use-address',
    });
    const usedHtml = await used.text();
    const [chosen] = (
      await new AddressLookupService().findAddresses('BT1 1AA')
    ).slice(2);
    assert.match(
      usedHtml,
      new RegExp(
        `id="addressLine1" name="addressLine1" type="text" value="${chosen?.line1}"`,
      ),
    );
    assert.match(usedHtml, /id="town" name="town" type="text" value="Belfast"/);
  });

  it('explains a bad postcode or a missing address choice', async () => {
    const badPostcode = await postCheckout({
      ...DETAILS,
      postcode: 'nope',
      action: 'find-address',
    });
    assert.equal(badPostcode.status, 400);
    assert.match(
      await badPostcode.text(),
      /<a href="#postcode">Enter a real UK postcode, like BT1 1AA<\/a>/,
    );

    const noChoice = await postCheckout({ ...DETAILS, action: 'use-address' });
    assert.equal(noChoice.status, 400);
    assert.match(await noChoice.text(), /Choose your address from the list/);
  });

  it('lists every missing detail before moving on', async () => {
    const res = await postCheckout({ action: 'continue-to-delivery' });
    assert.equal(res.status, 400);
    const html = await res.text();
    assert.match(html, /<title>Error: Checkout/);
    assert.match(html, /There is a problem/);
    for (const [field, message] of [
      ['firstName', 'Enter your first name'],
      ['email', 'Enter your email address'],
      ['phone', 'Enter your phone number'],
      ['postcode', 'Enter your postcode'],
      ['addressLine1', 'Enter address line 1'],
      ['town', 'Enter your town or city'],
    ]) {
      assert.match(html, new RegExp(`<a href="#${field}">${message}`));
    }
    assert.match(html, /id="email"[^>]*aria-invalid="true"/);
  });

  it('shows home delivery and three collection points after your details', async () => {
    const res = await postCheckout({
      ...DETAILS,
      action: 'continue-to-delivery',
    });
    assert.equal(res.status, 200);
    const html = await res.text();
    assert.match(html, /<dd>Sam Jones<\/dd>/);
    assert.match(
      html,
      /<input type="hidden" name="email" value="sam@example\.com" \/>/,
    );
    assert.match(html, /value="standard" checked \/>/);
    assert.match(
      html,
      /Standard delivery<\/strong> \(3–5 working days\) <span class="checkout-option-price">Free/,
    );
    assert.match(
      html,
      /Express delivery<\/strong> \(1–2 working days\) <span class="checkout-option-price">£4\.99/,
    );
    for (const distance of ['0.5', '1.2', '2.4']) {
      assert.match(
        html,
        new RegExp(`Collection point</strong>, ${distance} miles away`),
      );
    }
    // Collection points only give a distance, never an address.
    const options =
      html.match(
        /<fieldset[^>]*id="deliveryOption"[\s\S]*?<\/fieldset>/,
      )?.[0] ?? '';
    assert.match(options, /0\.5 miles away/);
    assert.doesNotMatch(options, /Street|Road|Lane|Belfast/);
  });

  it('shows the credit balance and totals before you check out', async () => {
    const res = await postCheckout({
      ...DETAILS,
      deliveryOption: 'express',
      action: 'continue-to-payment',
    });
    assert.equal(res.status, 200);
    const html = await res.text();
    assert.match(html, /<dt>Credit balance<\/dt><dd>£500\.00<\/dd>/);
    assert.match(html, /<dt>Order total<\/dt><dd>£54\.97<\/dd>/);
    assert.match(html, /<dt>Balance after this order<\/dt><dd>£445\.03<\/dd>/);
    assert.match(
      html,
      /<button class="basket-button checkout-submit" type="submit" name="action" value="place-order">Checkout<\/button>/,
    );
  });

  it('asks for a delivery choice before payment', async () => {
    const res = await postCheckout({
      ...DETAILS,
      deliveryOption: 'rocket',
      action: 'continue-to-payment',
    });
    assert.equal(res.status, 400);
    assert.match(
      await res.text(),
      /Choose how you would like to get your order/,
    );
  });

  it('disables Checkout when the credit balance is too low', async () => {
    backend.creditBalancePence = 1000;
    const html = await (
      await postCheckout({
        ...DETAILS,
        deliveryOption: 'standard',
        action: 'continue-to-payment',
      })
    ).text();
    assert.match(
      html,
      /Your credit balance is not enough to pay for this order/,
    );
    assert.match(html, /value="place-order" disabled>Checkout/);
  });

  it('places the order, clears the basket and shows the confirmation', async () => {
    const res = await postCheckout({
      ...DETAILS,
      deliveryOption: 'express',
      action: 'place-order',
    });
    assert.equal(res.status, 303);
    assert.equal(
      res.headers.get('location'),
      `/checkout/confirmation/${ORDER_ID}`,
    );
    assert.match(res.headers.getSetCookie().join('\n'), /^basket_id=;/m);
    assert.deepEqual(backend.orders, [
      {
        items: [{ productId: 'lamp-1', quantity: 2 }],
        customer: {
          firstName: 'Sam',
          lastName: 'Jones',
          email: 'sam@example.com',
          phone: '07700 900123',
        },
        address: {
          line1: '1 High Street',
          line2: '',
          town: 'Belfast',
          postcode: 'BT1 1AA',
        },
        deliveryOption: 'express',
      },
    ]);

    const page = await fetchFrontend(
      `${base}/checkout/confirmation/${ORDER_ID}`,
      {
        headers: { cookie: `auth_token=${TOKEN}` },
      },
    );
    assert.equal(page.status, 200);
    const html = await page.text();
    assert.match(html, /Thank you, Sam! You have successfully made an order\./);
    assert.match(html, new RegExp(ORDER_ID));
    assert.match(html, /<th scope="row">Desk Lamp<\/th>/);
    assert.match(html, /<dt>Paid from credit<\/dt><dd>£54\.97<\/dd>/);
    assert.match(html, /<dt>Remaining credit balance<\/dt><dd>£445\.03<\/dd>/);
    assert.match(html, /Express delivery, 1–2 working days/);
    assert.match(html, /1 High Street<br \/>Belfast<br \/>BT1 1AA/);
    assert.match(
      html,
      /<span class="basket-badge" aria-hidden="true">0<\/span>/,
    );
  });

  it('places only one order when Checkout is pressed twice', async () => {
    let release = () => {};
    backend.holdOrders = new Promise((resolve) => {
      release = resolve;
    });
    const form = {
      ...DETAILS,
      deliveryOption: 'standard',
      action: 'place-order',
    };
    const first = postCheckout(form);
    const second = postCheckout(form);
    await vi.waitFor(() => assert.equal(backend.orders.length, 1));
    release();
    const responses = await Promise.all([first, second]);
    for (const res of responses) {
      assert.equal(res.status, 303);
      assert.equal(
        res.headers.get('location'),
        `/checkout/confirmation/${ORDER_ID}`,
      );
    }
    assert.equal(backend.orders.length, 1);
  });

  it('shows the backend’s reason when it refuses the order', async () => {
    backend.orderStatus = 409;
    backend.orderMessage =
      'Your credit balance of £10.00 is not enough to pay £54.97.';
    const res = await postCheckout({
      ...DETAILS,
      deliveryOption: 'express',
      action: 'place-order',
    });
    assert.equal(res.status, 409);
    const html = await res.text();
    assert.match(
      html,
      /role="alert">Your credit balance of £10\.00 is not enough to pay £54\.97\.<\/p>/,
    );
    assert.match(html, /value="place-order">Checkout/);
  });

  it('sends guests who post the form back to the login prompt', async () => {
    const res = await postCheckout(
      { ...DETAILS, action: 'place-order' },
      `basket_id=${BASKET_ID}`,
    );
    assert.equal(res.status, 303);
    assert.equal(res.headers.get('location'), '/checkout');
    assert.equal(backend.orders.length, 0);
  });

  it('rejects checkout form posts from other sites', async () => {
    const res = await fetchFrontend(`${base}/checkout`, {
      method: 'POST',
      headers: {
        origin: 'https://evil.example',
        cookie: CUSTOMER_COOKIES,
        'content-type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ ...DETAILS, action: 'place-order' }),
    });
    assert.equal(res.status, 403);
    assert.equal(backend.orders.length, 0);
  });

  it('shows a 404 for an order that is not yours and asks guests to log in', async () => {
    const missing = await fetchFrontend(
      `${base}/checkout/confirmation/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa`,
      { headers: { cookie: `auth_token=${TOKEN}` } },
    );
    assert.equal(missing.status, 404);

    const guest = await fetchFrontend(
      `${base}/checkout/confirmation/${ORDER_ID}`,
      { redirect: 'manual' },
    );
    assert.equal(guest.status, 303);
    assert.equal(guest.headers.get('location'), '/login');
  });

  it('shows the account’s credit balance on the profile page', async () => {
    backend.creditBalancePence = 44503;
    const res = await fetchFrontend(`${base}/profile`, {
      headers: { cookie: LOGIN_COOKIES },
    });
    assert.equal(res.status, 200);
    const html = await res.text();
    assert.match(html, /<h3 class="profile-credit-label">Credit balance<\/h3>/);
    assert.match(html, /<p class="profile-credit-amount">£445\.03<\/p>/);

    backend.isAccountExpired = true;
    const unavailable = await (
      await fetchFrontend(`${base}/profile`, {
        headers: { cookie: LOGIN_COOKIES },
      })
    ).text();
    assert.match(unavailable, /Your credit balance is not available right now/);
  });

  it('returns to checkout after logging in, but never to another site', async () => {
    const loginPage = await (
      await fetchFrontend(`${base}/login?returnTo=%2Fcheckout`)
    ).text();
    assert.match(
      loginPage,
      /<input type="hidden" name="returnTo" value="\/checkout" \/>/,
    );
    const evilPage = await (
      await fetchFrontend(`${base}/login?returnTo=https%3A%2F%2Fevil.example`)
    ).text();
    assert.doesNotMatch(evilPage, /name="returnTo"/);

    async function logIn(returnTo: string) {
      return fetchFrontend(`${base}/login`, {
        method: 'POST',
        redirect: 'manual',
        headers: {
          origin: base,
          'content-type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          email: 'sam@example.com',
          password: 'Password1@',
          returnTo,
        }),
      });
    }
    assert.equal(
      (await logIn('/checkout')).headers.get('location'),
      '/checkout',
    );
    assert.equal(
      (await logIn('https://evil.example')).headers.get('location'),
      '/',
    );
  });
});

describe('checkout form checks', () => {
  it('reads the fields and action, ignoring unknown actions', () => {
    const form = readCheckoutForm({
      ...DETAILS,
      firstName: '  Sam  ',
      action: 'hack',
      selectedAddress: '3',
    });
    assert.equal(form.values.firstName, 'Sam');
    assert.equal(form.action, 'edit-details');
    assert.equal(form.selectedAddress, 3);
    assert.equal(readCheckoutForm(null).values.email, '');
  });

  it('accepts good details and explains bad ones', () => {
    assert.deepEqual(validateDetails(readCheckoutForm(DETAILS).values), []);
    const errors = validateDetails(
      readCheckoutForm({
        ...DETAILS,
        email: 'not-an-email',
        phone: '12345',
        postcode: 'ZZZ',
        firstName: 'x'.repeat(101),
      }).values,
    );
    assert.deepEqual(
      errors.map((error) => error.field),
      ['firstName', 'email', 'phone', 'postcode'],
    );
    assert.equal(
      errors[0]?.message,
      'First name must be 100 characters or fewer',
    );
  });

  it('only accepts the delivery options the backend offers', () => {
    const values = readCheckoutForm({ deliveryOption: 'express' }).values;
    assert.deepEqual(validateDelivery(values, ['standard', 'express']), []);
    assert.equal(validateDelivery(values, ['standard']).length, 1);
  });
});

describe('AddressLookupService', () => {
  it('normalises UK postcodes', () => {
    assert.equal(normalisePostcode(' bt71nn '), 'BT7 1NN');
    assert.equal(normalisePostcode('SW1A 1AA'), 'SW1A 1AA');
    assert.equal(normalisePostcode('12345'), null);
  });

  it('returns the same six sample addresses for a postcode every time', async () => {
    const lookup = new AddressLookupService();
    const first = await lookup.findAddresses('bt7 1nn');
    assert.equal(first.length, 6);
    assert.deepEqual(first, await lookup.findAddresses('BT71NN'));
    assert.ok(first.every((address) => address.postcode === 'BT7 1NN'));
    assert.ok(first.every((address) => address.town === 'Belfast'));
    assert.equal(
      (await lookup.findAddresses('ZZ99 9ZZ'))[0]?.town,
      'Sampletown',
    );
    assert.deepEqual(await lookup.findAddresses('nope'), []);
  });
});
