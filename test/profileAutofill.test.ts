import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { jwtVerify, SignJWT } from 'jose';
import { afterAll, beforeAll, beforeEach, describe, it, vi } from 'vitest';
import { createApp } from '../src/app';
import {
  type ProfileDetails,
  ProfileService,
} from '../src/services/profile-service';
import { withoutAccessibilityMenu } from './accessibilityMenu';

const SECRET = 'profile-autofill-test-secret-at-least-32-bytes';
const BACKEND_TOKEN = 'test-backend-profile-token';

function makeProfile(overrides: Partial<ProfileDetails> = {}): ProfileDetails {
  return {
    id: 'customer-1',
    username: 'saved-user',
    firstName: 'Saved',
    lastName: 'Customer',
    email: 'saved@example.invalid',
    addressLine1: null,
    addressLine2: null,
    postcode: null,
    phoneNumber: null,
    hasPhoto: false,
    ...overrides,
  };
}

async function listen(server: Server): Promise<string> {
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

async function close(server: Server): Promise<void> {
  await new Promise<void>((resolve) => server.close(() => resolve()));
}

describe('saved profile autofill', () => {
  let backend: Server;
  let frontend: Server;
  let base: string;
  let backendOrigin: string;
  let loginCookie: string;
  let body: unknown;
  let status: number;
  let rawBody: string | undefined;
  let patchStatus: number;
  let patchBody: unknown;
  const requests: {
    url: string;
    authorization: string | undefined;
    method?: string | undefined;
    contentType?: string | undefined;
    body?: unknown;
  }[] = [];

  beforeAll(async () => {
    const issuedAt = Math.floor(Date.now() / 1000) - 1200;
    const token = await new SignJWT({ name: 'Session Name', role: 'CUSTOMER' })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject('customer-1')
      .setIssuer('ctrl-alt-elite-frontend')
      .setAudience('ctrl-alt-elite-homepage')
      .setIssuedAt(issuedAt)
      .setExpirationTime(issuedAt + 3600)
      .sign(new TextEncoder().encode(SECRET));
    loginCookie = `ctrl_alt_elite_login=${token}`;
    backend = createServer(async (req, res) => {
      if (req.url === '/api/account') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            account: {
              firstName: 'Saved',
              lastName: 'Customer',
              email: 'saved@example.invalid',
              creditBalancePence: 0,
            },
          }),
        );
        return;
      }
      const isPatch = req.method === 'PATCH';
      let fields: unknown;
      if (isPatch) {
        const chunks: Buffer[] = [];
        for await (const chunk of req) chunks.push(Buffer.from(chunk));
        fields = JSON.parse(Buffer.concat(chunks).toString());
      }
      // The site navigation asks for the category list; it is not part of what
      // these tests check.
      if (req.url !== '/api/products') {
        requests.push({
          url: req.url ?? '',
          authorization: req.headers.authorization,
          ...(isPatch
            ? {
                method: req.method,
                contentType: req.headers['content-type'],
                body: fields,
              }
            : {}),
        });
      }
      if (isPatch) {
        if (patchStatus === 200) body = patchBody;
        res.writeHead(patchStatus, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(patchBody));
        return;
      }
      res.writeHead(status, { 'Content-Type': 'application/json' });
      res.end(rawBody ?? JSON.stringify(body));
    });
    backendOrigin = await listen(backend);
    frontend = createServer(createApp(backendOrigin, { jwtSecret: SECRET }));
    base = await listen(frontend);
  });

  beforeEach(() => {
    status = 200;
    rawBody = undefined;
    body = makeProfile();
    patchStatus = 200;
    patchBody = makeProfile();
    requests.length = 0;
  });

  afterAll(async () => {
    await close(frontend);
    await close(backend);
  });

  function getProfile(path = '/profile') {
    return fetch(`${base}${path}`, {
      headers: { cookie: `${loginCookie}; auth_token=${BACKEND_TOKEN}` },
      redirect: 'manual',
    });
  }

  it('prefills saved fields on every load and uses only the backend token for identity', async () => {
    for (let visit = 0; visit < 2; visit++) {
      const profile = makeProfile({
        username: `saved-user-${visit}`,
        firstName: `Saved-${visit}`,
        addressLine1: `${visit + 1} Example Street`,
        addressLine2: `Flat ${visit + 1}`,
        postcode: `AB${visit + 1} 2CD`,
        phoneNumber: `+44 20 1234 567${visit}`,
      });
      body = profile;
      const response = await getProfile(
        '/profile?userId=someone-else&firstName=Wrong',
      );
      assert.equal(response.status, 200);
      assert.equal(response.headers.get('cache-control'), 'no-store');
      const html = await response.text();
      assert.match(
        html,
        new RegExp(`name="username" value="saved-user-${visit}"`),
      );
      assert.match(html, new RegExp(`name="firstName" value="Saved-${visit}"`));
      assert.match(html, /name="lastName" value="Customer"/);
      assert.doesNotMatch(
        withoutAccessibilityMenu(html),
        /someone-else|value="Wrong"|Sign in again/,
      );
      assert.ok(!html.includes(BACKEND_TOKEN));
      const emailInput = html.match(/<input[^>]*id="profile-email"[^>]*>/)?.[0];
      assert.ok(emailInput);
      assert.ok(emailInput.includes(`value="${profile.email}"`));
      assert.match(emailInput, /\breadonly\b/);
      assert.doesNotMatch(emailInput, /\bname=/);
      for (const [id, value] of [
        ['profile-phone', profile.phoneNumber],
        ['profile-address-line-1', profile.addressLine1],
        ['profile-address-line-2', profile.addressLine2],
        ['profile-postcode', profile.postcode],
      ]) {
        const input = html.match(
          new RegExp(`<input[^>]*id="${id}"[^>]*>`),
        )?.[0];
        assert.ok(input);
        assert.ok(input.includes(`value="${value}"`));
      }
      assert.match(html, /<form action="\/profile" method="post">/);
      const saveButton = html.match(/<button[^>]*>Save changes<\/button>/)?.[0];
      assert.ok(saveButton);
      assert.match(saveButton, /type="submit"/);
      assert.doesNotMatch(saveButton, /\bdisabled\b/);
      assert.match(html, /<fieldset class="profile-details-fields">/);
      assert.match(html, /<script src="\/client\/script\.js" defer><\/script>/);
      assert.doesNotMatch(
        html,
        /Design preview only|changes are not saved|{{|{%/,
      );
    }
    assert.deepEqual(
      requests,
      [0, 1].map(() => ({
        url: '/api/profile',
        authorization: `Bearer ${BACKEND_TOKEN}`,
      })),
    );
  });

  it.each([
    { username: 'updated-user', displayName: 'updated-user' },
    { username: null, displayName: 'Updated Customer' },
  ])(
    'saves profile details and refreshes the name to $displayName without extending the session',
    async ({ username, displayName }) => {
      const fields = {
        username: username ?? '',
        firstName: 'Updated',
        lastName: 'Customer',
        addressLine1: '12 Updated Street',
        addressLine2: 'Flat 2',
        postcode: 'AB1 2CD',
        phoneNumber: '+44 20 1234 5678',
      };
      patchBody = makeProfile({ ...fields, username });
      const response = await fetch(`${base}/profile`, {
        method: 'POST',
        headers: {
          origin: base,
          cookie: `${loginCookie}; auth_token=${BACKEND_TOKEN}`,
        },
        body: new URLSearchParams(fields),
        redirect: 'manual',
      });
      assert.equal(response.status, 303);
      assert.equal(response.headers.get('location'), '/profile?saved=1');
      assert.equal(response.headers.get('cache-control'), 'no-store');
      assert.deepEqual(requests, [
        { url: '/api/profile', authorization: `Bearer ${BACKEND_TOKEN}` },
        {
          url: '/api/profile',
          authorization: `Bearer ${BACKEND_TOKEN}`,
          method: 'PATCH',
          contentType: 'application/json',
          body: fields,
        },
      ]);
      const cookies = response.headers.getSetCookie();
      assert.equal(cookies.length, 1);
      const cookie = cookies[0];
      assert.ok(cookie);
      assert.match(cookie, /^ctrl_alt_elite_login=/);
      assert.match(cookie, /HttpOnly/);
      assert.match(cookie, /SameSite=Lax/);
      assert.match(cookie, /Path=\//);
      const refreshedCookie = cookie.split(';')[0];
      assert.ok(refreshedCookie);
      const verification = {
        issuer: 'ctrl-alt-elite-frontend',
        audience: 'ctrl-alt-elite-homepage',
        algorithms: ['HS256'],
      };
      const key = new TextEncoder().encode(SECRET);
      const original = await jwtVerify(
        loginCookie.split('=')[1] ?? '',
        key,
        verification,
      );
      const refreshed = await jwtVerify(
        refreshedCookie.split('=')[1] ?? '',
        key,
        verification,
      );
      assert.deepEqual(refreshed.payload, {
        ...original.payload,
        name: displayName,
      });
      const expires = cookie.match(/Expires=([^;]+)/)?.[1];
      assert.ok(expires);
      assert.equal(Date.parse(expires), Number(original.payload.exp) * 1000);

      const reload = await fetch(`${base}/profile?saved=1`, {
        headers: {
          cookie: `${refreshedCookie}; auth_token=${BACKEND_TOKEN}`,
        },
        redirect: 'manual',
      });
      assert.equal(reload.status, 200);
      const html = await reload.text();
      assert.match(html, /role="status">Your profile has been saved\./);
      assert.ok(html.includes(`<h2>${displayName}</h2>`));
      for (const [field, value] of Object.entries(fields)) {
        assert.ok(html.includes(`name="${field}" value="${value}"`));
      }
      assert.equal(requests.length, 3);
      assert.deepEqual(requests[2], {
        url: '/api/profile',
        authorization: `Bearer ${BACKEND_TOKEN}`,
      });
      assert.equal(reload.headers.getSetCookie().length, 0);
    },
  );

  it.each([
    { code: 400, message: 'Enter a valid phone number.' },
    { code: 409, message: 'That username is already in use.' },
  ])(
    'retains submitted profile fields after a $code PATCH response',
    async ({ code, message }) => {
      const fields = {
        username: 'unsaved-user',
        firstName: 'Unsaved',
        lastName: 'Edits',
        addressLine1: '34 Unsaved Street',
        addressLine2: '',
        postcode: 'XY9 8ZZ',
        phoneNumber: 'invalid-phone',
      };
      patchStatus = code;
      patchBody = { message };
      const response = await fetch(`${base}/profile`, {
        method: 'POST',
        headers: {
          origin: base,
          cookie: `${loginCookie}; auth_token=${BACKEND_TOKEN}`,
        },
        body: new URLSearchParams(fields),
        redirect: 'manual',
      });
      assert.equal(response.status, code);
      assert.equal(response.headers.get('cache-control'), 'no-store');
      assert.equal(response.headers.get('location'), null);
      assert.equal(response.headers.getSetCookie().length, 0);
      const html = await response.text();
      assert.ok(html.includes(`role="alert">${message}</p>`));
      assert.match(html, /<form action="\/profile" method="post">/);
      for (const [field, value] of Object.entries(fields)) {
        assert.ok(html.includes(`name="${field}" value="${value}"`));
      }
      assert.match(html, /id="profile-email" value="saved@example.invalid"/);
      assert.deepEqual(body, makeProfile());
      assert.deepEqual(requests, [
        { url: '/api/profile', authorization: `Bearer ${BACKEND_TOKEN}` },
        {
          url: '/api/profile',
          authorization: `Bearer ${BACKEND_TOKEN}`,
          method: 'PATCH',
          contentType: 'application/json',
          body: fields,
        },
      ]);
    },
  );

  it('renders null optional fields empty and retains saved email and names', async () => {
    body = makeProfile({
      username: null,
      firstName: 'A'.repeat(100),
      lastName: 'B'.repeat(100),
    });
    const response = await getProfile();
    assert.equal(response.status, 200);
    const html = await response.text();
    assert.match(html, /name="username" value=""/);
    const emailInput = html.match(/<input[^>]*id="profile-email"[^>]*>/)?.[0];
    assert.ok(emailInput);
    assert.match(emailInput, /value="saved@example\.invalid"/);
    assert.match(emailInput, /\breadonly\b/);
    assert.doesNotMatch(emailInput, /\bname=/);
    for (const id of [
      'profile-phone',
      'profile-address-line-1',
      'profile-address-line-2',
      'profile-postcode',
    ]) {
      const input = html.match(new RegExp(`<input[^>]*id="${id}"[^>]*>`))?.[0];
      assert.ok(input, `Missing profile input: ${id}`);
      assert.match(input, /\bvalue=""/);
    }
    assert.ok(html.includes(`name="firstName" value="${'A'.repeat(100)}"`));
    assert.ok(html.includes(`name="lastName" value="${'B'.repeat(100)}"`));
    assert.match(html, /name="firstName"[^>]*maxlength="100"/);
    assert.match(html, /name="lastName"[^>]*maxlength="100"/);
    assert.doesNotMatch(html, /value="null"|value="undefined"/);
  });

  it('escapes saved values in input attributes', async () => {
    body = makeProfile({
      username: '"><script>alert(1)</script>',
      firstName: '<img src=x onerror=alert(1)>',
      lastName: '" autofocus onfocus="alert(1)',
      addressLine1: '" onfocus="alert(2)',
      addressLine2: '<script>alert(3)</script>',
    });
    const response = await getProfile();
    assert.equal(response.status, 200);
    const html = await response.text();
    assert.match(html, /value="&quot;&gt;&lt;script&gt;/);
    assert.match(html, /value="&lt;img/);
    assert.match(html, /value="&quot; autofocus onfocus=&quot;/);
    assert.match(html, /value="&quot; onfocus=&quot;alert\(2\)/);
    assert.match(html, /value="&lt;script&gt;alert\(3\)&lt;\/script&gt;"/);
    assert.doesNotMatch(
      html,
      /<script>|<img src=x|value="" autofocus|value="" onfocus/,
    );
  });

  it('keeps older sessions usable but explicitly asks for a backend login', async (context) => {
    context.onTestFinished(() => {
      vi.restoreAllMocks();
    });
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const response = await fetch(`${base}/profile`, {
      headers: { cookie: loginCookie },
    });
    assert.equal(response.status, 200);
    const html = await response.text();
    assert.match(
      html,
      /role="alert">Sign in again to load and save your profile\./,
    );
    assert.match(html, /name="firstName" value=""/);
    assert.match(html, /<fieldset class="profile-details-fields" disabled>/);
    assert.match(
      html,
      /<button[^>]*type="submit"[^>]*disabled[^>]*>Save changes<\/button>/,
    );
    assert.equal(requests.length, 0);
    assert.equal(warning.mock.calls.length, 1);
  });

  it('does not request saved details for guests or forged frontend sessions', async (context) => {
    context.onTestFinished(() => {
      vi.restoreAllMocks();
    });
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    for (const cookie of [
      `auth_token=${BACKEND_TOKEN}`,
      `ctrl_alt_elite_login=forged; auth_token=${BACKEND_TOKEN}`,
    ]) {
      const response = await fetch(`${base}/profile`, {
        headers: { cookie },
        redirect: 'manual',
      });
      assert.equal(response.status, 302);
      assert.equal(response.headers.get('location'), '/login');
    }
    assert.equal(requests.length, 0);
  });

  it('clears both login cookies when the backend rejects authentication', async (context) => {
    context.onTestFinished(() => {
      vi.restoreAllMocks();
    });
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    for (const code of [401, 403]) {
      status = code;
      const response = await getProfile();
      assert.equal(response.status, 302);
      assert.equal(response.headers.get('location'), '/login');
      assert.equal(response.headers.get('cache-control'), 'no-store');
      const cookies = response.headers.getSetCookie().join(';');
      assert.match(cookies, /auth_token=;/);
      assert.match(cookies, /ctrl_alt_elite_login=;/);
    }
  });

  it('reports API outages and malformed responses rather than rendering empty saved fields', async (context) => {
    context.onTestFinished(() => {
      vi.restoreAllMocks();
    });
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    for (const code of [404, 500, 503]) {
      status = code;
      const response = await getProfile();
      assert.equal(response.headers.get('location'), '/unavailable');
    }
    status = 200;
    const invalidProfiles = [
      null,
      {},
      { ...makeProfile(), username: 42 },
      { ...makeProfile(), lastName: undefined },
      { ...makeProfile(), id: undefined },
      { ...makeProfile(), email: undefined },
      { ...makeProfile(), hasPhoto: 'false' },
      { ...makeProfile(), addressLine1: 42 },
      { ...makeProfile(), addressLine2: undefined },
      { ...makeProfile(), postcode: 42 },
      { ...makeProfile(), phoneNumber: undefined },
    ];
    for (const invalid of invalidProfiles) {
      body = invalid;
      const response = await getProfile();
      assert.equal(response.status, 302);
      assert.equal(response.headers.get('location'), '/unavailable');
    }
    rawBody = '{invalid';
    assert.equal((await getProfile()).headers.get('location'), '/unavailable');
    assert.equal(error.mock.calls.length, 3 + invalidProfiles.length + 1);
  });

  it('propagates network failures instead of returning an empty profile', async (context) => {
    context.onTestFinished(() => {
      vi.restoreAllMocks();
    });
    const failure = new TypeError('Network unavailable');
    vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(failure);
    await assert.rejects(
      new ProfileService(backendOrigin).getOwnProfile(BACKEND_TOKEN),
      (error) => error === failure,
    );
  });
});
