import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { SignJWT } from 'jose';
import { afterAll, beforeAll, beforeEach, describe, it, vi } from 'vitest';
import { createApp } from '../src/app';
import {
  type ProfileDetails,
  ProfileService,
} from '../src/server/services/profile-service';

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
  const requests: { url: string; authorization: string | undefined }[] = [];

  beforeAll(async () => {
    const token = await new SignJWT({ name: 'Session Name', role: 'CUSTOMER' })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject('customer-1')
      .setIssuer('ctrl-alt-elite-frontend')
      .setAudience('ctrl-alt-elite-homepage')
      .setIssuedAt()
      .setExpirationTime('1h')
      .sign(new TextEncoder().encode(SECRET));
    loginCookie = `ctrl_alt_elite_login=${token}`;
    backend = createServer((req, res) => {
      requests.push({
        url: req.url ?? '',
        authorization: req.headers.authorization,
      });
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
      assert.doesNotMatch(html, /someone-else|value="Wrong"|Sign in again/);
      assert.ok(!html.includes(BACKEND_TOKEN));
      for (const [id, value] of [
        ['profile-email', profile.email],
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
        if (id === 'profile-email') {
          assert.match(input, /\breadonly\b/);
          assert.doesNotMatch(input, /\bname=/);
        }
      }
      assert.match(html, /<form action="\/profile" method="post">/);
      const saveButton = html.match(/<button[^>]*>Save changes<\/button>/)?.[0];
      assert.ok(saveButton);
      assert.match(saveButton, /type="submit"/);
      assert.doesNotMatch(saveButton, /\bdisabled\b/);
      assert.match(html, /<fieldset class="profile-details-fields">/);
      assert.match(
        html,
        /<script src="\/controllers\/script\.js" defer><\/script>/,
      );
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

  it('renders a null username as empty and retains names up to the backend limit', async () => {
    body = makeProfile({
      username: null,
      firstName: 'A'.repeat(100),
      lastName: 'B'.repeat(100),
    });
    const response = await getProfile();
    assert.equal(response.status, 200);
    const html = await response.text();
    assert.match(html, /name="username" value=""/);
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
