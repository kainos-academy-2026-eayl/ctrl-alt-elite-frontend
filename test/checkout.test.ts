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
  PostcodeService,
  PostcodeServiceError,
} from '../src/services/postcodeService';
import {
  isValidEmail,
  normalisePostcode,
  normaliseUkPhone,
  readCheckoutForm,
  validateDelivery,
  validateDetails,
} from '../src/util/checkoutForm';
import { withoutAccessibilityMenu } from './accessibilityMenu';

const BACKEND_ORIGIN = 'https://backend.example.test';
const POSTCODES_ORIGIN = 'https://api.postcodes.io';
/** Postcodes the fake postcodes.io knows, with their council area. */
const REAL_POSTCODES: Record<string, string> = {
  BT11AA: 'Belfast',
  BT71NN: 'Belfast',
  BT95AB: 'Belfast',
  SW1A1AA: 'Westminster',
  // A real postcode with no council area: postcodes.io sends null for it.
  BT11AB: '',
};

function fakePostcodesIo(req: Request): Response {
  if (backend.isPostcodesDown) {
    throw new TypeError('fetch failed');
  }
  const key = decodeURIComponent(
    new URL(req.url).pathname.replace('/postcodes/', ''),
  );
  const district = REAL_POSTCODES[key];
  if (district === undefined) {
    return Response.json(
      { status: 404, error: 'Postcode not found' },
      { status: 404 },
    );
  }
  const postcode = `${key.slice(0, -3)} ${key.slice(-3)}`;
  return Response.json({
    status: 200,
    result: {
      postcode,
      admin_district: district || null,
      country: 'Northern Ireland',
    },
  });
}

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
  isPostcodesDown: boolean;
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
    isPostcodesDown: false,
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
  if (
    !isLoggedIn ||
    (backend.isAccountExpired && pathname !== '/api/profile')
  ) {
    return Response.json(
      { message: 'Authentication required.' },
      { status: 401 },
    );
  }
  if (pathname === '/api/profile') {
    return Response.json({
      id: 'customer-1',
      username: null,
      firstName: 'Sam',
      lastName: 'Jones',
      email: 'sam@example.com',
      addressLine1: null,
      addressLine2: null,
      postcode: null,
      phoneNumber: null,
      hasPhoto: false,
    });
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
      if (new URL(req.url).origin === POSTCODES_ORIGIN) {
        return fakePostcodesIo(req);
      }
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
    assert.doesNotMatch(withoutAccessibilityMenu(html), /<script/);
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
    assert.match(html, /id="addressLine1" name="addressLine1"/);
    assert.doesNotMatch(
      html,
      /Find address|Choose your address|selectedAddress/,
    );
    assert.match(html, /value="continue-to-delivery">Continue to delivery/);
    assert.match(html, /2 × Desk Lamp/);
    assert.doesNotMatch(withoutAccessibilityMenu(html), /<script/);
  });

  it('keeps manually entered addresses and rejects invalid postcodes', async () => {
    const badPostcode = await postCheckout({
      ...DETAILS,
      postcode: 'nope',
      action: 'continue-to-delivery',
    });
    assert.equal(badPostcode.status, 400);
    assert.match(
      await badPostcode.text(),
      /<a href="#postcode">Enter a real UK postcode, like BT1 1AA<\/a>/,
    );

    const manualAddress = await postCheckout({
      ...DETAILS,
      action: 'continue-to-delivery',
    });
    assert.equal(manualAddress.status, 200);
    assert.match(
      await manualAddress.text(),
      /1 High Street<br \/>Belfast<br \/>BT1 1AA/,
    );
  });

  it('only accepts postcodes that really exist', async () => {
    const res = await postCheckout({
      ...DETAILS,
      postcode: 'ZZ99 9ZZ',
      action: 'continue-to-delivery',
    });
    assert.equal(res.status, 400);
    assert.match(
      await res.text(),
      /<a href="#postcode">We could not find that postcode\. Check it and try again\.<\/a>/,
    );
  });

  it('asks you to try again if postcodes cannot be checked', async () => {
    backend.isPostcodesDown = true;
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await postCheckout({
      ...DETAILS,
      postcode: 'BT9 5AB',
      action: 'continue-to-delivery',
    });
    assert.equal(res.status, 503);
    assert.match(
      await res.text(),
      /We could not check your postcode right now\. Please try again in a moment\./,
    );
    assert.equal(errorLog.mock.calls.length, 1);
  });

  it('rejects email addresses and phone numbers that are not valid', async () => {
    const res = await postCheckout({
      ...DETAILS,
      email: 'sam@example',
      phone: '07700 9OO123',
      action: 'continue-to-delivery',
    });
    assert.equal(res.status, 400);
    const html = await res.text();
    assert.match(
      html,
      /<a href="#email">Enter an email address in the correct format/,
    );
    assert.match(
      html,
      /<a href="#phone">Enter a UK phone number using only numbers/,
    );
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

  it('clears the basket on placement and cached redirect, then shows confirmation', async () => {
    const res = await postCheckout({
      ...DETAILS,
      deliveryOption: 'express',
      confirmedTotalPence: '5497',
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
          phone: '07700900123',
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

    const retry = await postCheckout({
      ...DETAILS,
      deliveryOption: 'express',
      confirmedTotalPence: '5497',
      action: 'place-order',
    });
    assert.equal(retry.status, 303);
    assert.equal(
      retry.headers.get('location'),
      `/checkout/confirmation/${ORDER_ID}`,
    );
    assert.match(retry.headers.getSetCookie().join('\n'), /^basket_id=;/m);
    assert.equal(backend.orders.length, 1);

    const page = await fetchFrontend(
      `${base}/checkout/confirmation/${ORDER_ID}`,
      {
        headers: { cookie: LOGIN_COOKIES },
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
      confirmedTotalPence: '4998',
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

  it('never charges a total the customer has not seen', async () => {
    // The payment step showed £49.98, but express delivery makes it £54.97.
    const res = await postCheckout({
      ...DETAILS,
      deliveryOption: 'express',
      confirmedTotalPence: '4998',
      action: 'place-order',
    });
    assert.equal(res.status, 409);
    const html = await res.text();
    assert.match(html, /Your basket or its prices have changed/);
    assert.match(html, /<dt>Order total<\/dt><dd>£54\.97<\/dd>/);
    assert.match(
      html,
      /<input type="hidden" name="confirmedTotalPence" value="5497" \/>/,
    );
    assert.equal(backend.orders.length, 0);
  });

  it('shows the backend’s reason when it refuses the order', async () => {
    backend.orderStatus = 409;
    backend.orderMessage =
      'Your credit balance of £10.00 is not enough to pay £54.97.';
    const res = await postCheckout({
      ...DETAILS,
      deliveryOption: 'express',
      confirmedTotalPence: '5497',
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

  it('does not offer a retry when the order outcome is unknown', async () => {
    backend.orderStatus = 503;
    const form = {
      ...DETAILS,
      deliveryOption: 'express',
      confirmedTotalPence: '5497',
      action: 'place-order',
    };
    const uncertain = await postCheckout(form);
    assert.equal(uncertain.status, 503);
    const html = await uncertain.text();
    assert.match(
      html,
      /We could not confirm whether your order was placed\. Please contact support before trying again\./,
    );
    assert.doesNotMatch(html, /value="place-order"/);

    const retry = await postCheckout(form);
    assert.equal(retry.status, 503);
    assert.equal(backend.orders.length, 1);
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
      { headers: { cookie: LOGIN_COOKIES } },
    );
    assert.equal(missing.status, 404);

    // A backend token without the site login session is not enough.
    const tokenOnly = await fetchFrontend(
      `${base}/checkout/confirmation/${ORDER_ID}`,
      { redirect: 'manual', headers: { cookie: `auth_token=${TOKEN}` } },
    );
    assert.equal(tokenOnly.status, 303);
    assert.equal(tokenOnly.headers.get('location'), '/login');

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
    assert.match(
      html,
      /<h3 class="profile-credit-label" id="profile-credit-heading">Credit balance<\/h3>/,
    );
    assert.match(html, /<p class="profile-credit-amount">£445\.03<\/p>/);

    backend.creditBalancePence = 0;
    const zeroBalance = await fetchFrontend(`${base}/profile`, {
      headers: { cookie: LOGIN_COOKIES },
      redirect: 'manual',
    });
    assert.equal(zeroBalance.status, 200);
    assert.match(
      await zeroBalance.text(),
      /<p class="profile-credit-amount">£0\.00<\/p>/,
    );

    backend.isAccountExpired = true;
    const unavailable = await fetchFrontend(`${base}/profile`, {
      headers: { cookie: LOGIN_COOKIES },
      redirect: 'manual',
    });
    assert.equal(unavailable.status, 200);
    const unavailableHtml = await unavailable.text();
    assert.match(
      unavailableHtml,
      /Your credit balance is not available right now/,
    );
    assert.doesNotMatch(unavailableHtml, /class="profile-credit-amount"/);
    assert.match(unavailableHtml, /name="firstName" value="Sam"/);
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
    assert.doesNotMatch(withoutAccessibilityMenu(evilPage), /name="returnTo"/);

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
    });
    assert.equal(form.values.firstName, 'Sam');
    assert.equal(form.action, 'edit-details');
    assert.equal(readCheckoutForm(null).values.email, '');
  });

  it('normalises UK postcodes', () => {
    assert.equal(normalisePostcode(' bt71nn '), 'BT7 1NN');
    assert.equal(normalisePostcode('SW1A 1AA'), 'SW1A 1AA');
    assert.equal(normalisePostcode('12345'), null);
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

  it('only accepts valid email addresses', () => {
    for (const email of ['sam@example.com', 'sam.jones+shop@mail.co.uk']) {
      assert.equal(isValidEmail(email), true, email);
    }
    for (const email of [
      'sam@example',
      'sam@@example.com',
      '.sam@example.com',
      'sam..jones@example.com',
      'sam jones@example.com',
      'sam@-example.com',
      `${'a'.repeat(65)}@example.com`,
    ]) {
      assert.equal(isValidEmail(email), false, email);
    }
  });

  it('only accepts UK phone numbers made of numbers', () => {
    assert.equal(normaliseUkPhone('07700 900123'), '07700900123');
    assert.equal(normaliseUkPhone('+44 (0)7700 900-123'), '07700900123');
    assert.equal(normaliseUkPhone('+447700900123'), '07700900123');
    assert.equal(normaliseUkPhone('028 9012 3456'), '02890123456');
    assert.equal(normaliseUkPhone('0800 123 456'), '0800123456');
    for (const phone of [
      '07700 9OO123',
      '0770090012',
      '077009001234',
      '+1 202 555 0123',
      '12345',
      '07700#900123',
      // Valid digits, but longer than the 20 characters the backend accepts.
      '0 7 7 0 0 9 0 0 1 2 3',
    ]) {
      assert.equal(normaliseUkPhone(phone), null, phone);
    }
  });

  it('only accepts the delivery options the backend offers', () => {
    const values = readCheckoutForm({ deliveryOption: 'express' }).values;
    assert.deepEqual(validateDelivery(values, ['standard', 'express']), []);
    assert.equal(validateDelivery(values, ['standard']).length, 1);
  });
});

describe('PostcodeService', () => {
  it('checks each postcode once and reports when postcodes.io is down', async () => {
    resetBackend();
    const calls: string[] = [];
    const service = new PostcodeService(POSTCODES_ORIGIN, async (input) => {
      calls.push(String(input));
      return fakePostcodesIo(new Request(input));
    });
    assert.deepEqual(await service.findPostcode('bt7 1nn'), {
      postcode: 'BT7 1NN',
      district: 'Belfast',
    });
    assert.deepEqual(await service.findPostcode('BT7 1NN'), {
      postcode: 'BT7 1NN',
      district: 'Belfast',
    });
    assert.equal(await service.findPostcode('ZZ99 9ZZ'), null);
    assert.deepEqual(calls, [
      'https://api.postcodes.io/postcodes/BT71NN',
      'https://api.postcodes.io/postcodes/ZZ999ZZ',
    ]);

    // No council area: a wider area is used instead.
    assert.deepEqual(await service.findPostcode('BT1 1AB'), {
      postcode: 'BT1 1AB',
      district: 'Northern Ireland',
    });

    backend.isPostcodesDown = true;
    await assert.rejects(service.findPostcode('BT1 1AA'), PostcodeServiceError);
  });
});
