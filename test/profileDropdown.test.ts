import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { jwtVerify } from 'jose';
import { afterAll, beforeAll, describe, it, vi } from 'vitest';
import { createApp } from '../src/app';
import { LoginSession } from '../src/util/loginSession';
import { issueLoginToken, TEST_JWT_SECRET } from './sessionFixtures';

async function listen(server: Server): Promise<string> {
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

async function close(server: Server): Promise<void> {
  await new Promise<void>((resolve) => server.close(() => resolve()));
}

describe('homepage profile dropdown', () => {
  let backend: Server;
  let frontend: Server;
  let backendOrigin: string;
  let base: string;
  let validToken: string;

  beforeAll(async () => {
    validToken = await issueLoginToken();
    backend = createServer((_req, res) => {
      res.setHeader('content-type', 'application/json');
      res.end(
        JSON.stringify({
          user: {
            id: 'user-1',
            email: 'user@example.com',
            firstName: ' Test ',
            lastName: ' Customer ',
            role: 'CUSTOMER',
          },
        }),
      );
    });
    backendOrigin = await listen(backend);
    frontend = createServer(
      createApp(backendOrigin, { jwtSecret: TEST_JWT_SECRET }),
    );
    base = await listen(frontend);
  });

  afterAll(async () => {
    await close(frontend);
    await close(backend);
  });

  function login(origin = base) {
    return fetch(`${origin}/login`, {
      method: 'POST',
      headers: { origin },
      body: new URLSearchParams({
        email: 'user@example.com',
        password: 'Password@1',
      }),
      redirect: 'manual',
    });
  }

  it('shows only Login and Register for guests', async () => {
    const response = await fetch(base);
    const html = await response.text();
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.match(html, /href="\/login">Login/);
    assert.match(html, /href="\/register">Register/);
    assert.doesNotMatch(html, /My Profile|Logout|{%|{{/);
    assert.match(html, /aria-label="Account options"/);
  });

  it('persists the existing backend user-only login and shows profile/logout on subsequent visits', async () => {
    const response = await login();
    assert.equal(response.status, 303);
    assert.equal(response.headers.get('location'), '/');
    const cookie = response.headers.get('set-cookie');
    assert.ok(cookie);
    assert.match(cookie, /HttpOnly/);
    assert.match(cookie, /SameSite=Lax/);
    assert.match(cookie, /Path=\//);
    assert.match(cookie, /Expires=/);
    const sessionCookie = cookie.split(';')[0];
    assert.ok(sessionCookie);
    const token = sessionCookie.slice(sessionCookie.indexOf('=') + 1);
    const { payload } = await jwtVerify(
      token,
      new TextEncoder().encode(TEST_JWT_SECRET),
      {
        issuer: 'ctrl-alt-elite-frontend',
        audience: 'ctrl-alt-elite-homepage',
        algorithms: ['HS256'],
      },
    );
    assert.equal(payload.sub, 'user-1');
    assert.equal(payload.name, 'Test Customer');
    assert.equal(Number(payload.exp) - Number(payload.iat), 3600);
    for (let visit = 0; visit < 2; visit++) {
      const homepage = await fetch(base, {
        headers: { cookie: sessionCookie },
      });
      const html = await homepage.text();
      assert.match(html, /href="\/profile">My Profile/);
      assert.match(html, /action="\/logout" method="post"/);
      assert.match(html, />Logout<\/button>/);
      assert.match(html, /class="account-avatar"/);
      assert.match(
        html,
        /class="account-label account-name">Test Customer<\/span>/,
      );
      assert.match(html, /aria-label="Test Customer options"/);
      assert.doesNotMatch(html, /class="account-label[^"]*">Account<\/span>/);
      assert.doesNotMatch(html, /href="\/login"|href="\/register"/);
      assert.ok(!html.includes(token));
      assert.ok(!html.includes(TEST_JWT_SECRET));
    }
    const profile = await fetch(`${base}/profile`, {
      headers: { cookie: sessionCookie },
    });
    assert.equal(profile.status, 200);
    assert.equal(profile.headers.get('cache-control'), 'no-store');
    const profileHtml = await profile.text();
    assert.match(profileHtml, /<title>My Profile \| Ctrl-Alt-Elite<\/title>/);
    assert.match(profileHtml, /<h2>Test Customer<\/h2>/);
    assert.match(profileHtml, /class="profile-preview-avatar"/);
    assert.match(profileHtml, /coming soon/);
    assert.match(profileHtml, /href="\/">Back to home/);
    assert.match(profileHtml, /href="\/assets\/profile\.css"/);
    assert.doesNotMatch(profileHtml, /{{|{%|<input|<form/);
    const stylesheet = await fetch(`${base}/assets/profile.css`);
    assert.equal(stylesheet.status, 200);
    assert.match(stylesheet.headers.get('content-type') ?? '', /text\/css/);
  });

  it('redirects guests and expired sessions from the profile preview to login', async () => {
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const expired = await issueLoginToken({ exp: 1 });
      for (const headers of [
        new Headers(),
        new Headers({ cookie: `ctrl_alt_elite_login=${expired}` }),
      ]) {
        const response = await fetch(`${base}/profile`, {
          headers,
          redirect: 'manual',
        });
        assert.equal(response.status, 302);
        assert.equal(response.headers.get('location'), '/login');
        assert.equal(response.headers.get('cache-control'), 'no-store');
      }
      assert.equal(warning.mock.calls.length, 1);
    } finally {
      warning.mockRestore();
    }
  });

  it('uses only the signed-in account name on the profile preview', async () => {
    const token = await issueLoginToken({ name: 'Signed In Customer' });
    const response = await fetch(
      `${base}/profile?name=AnotherUser&userId=someone-else`,
      {
        headers: { cookie: `ctrl_alt_elite_login=${token}` },
      },
    );
    const html = await response.text();
    assert.equal(response.status, 200);
    assert.match(html, /<h2>Signed In Customer<\/h2>/);
    assert.doesNotMatch(html, /AnotherUser|someone-else/);
  });

  it('escapes the signed-in name when rendering the dropdown and profile', async () => {
    const token = await issueLoginToken({
      name: '<script>alert("name")</script>',
    });
    for (const path of ['/', '/profile']) {
      const response = await fetch(`${base}${path}`, {
        headers: { cookie: `ctrl_alt_elite_login=${token}` },
      });
      const html = await response.text();
      assert.match(html, /&lt;script&gt;/);
      assert.doesNotMatch(html, /<script>alert/);
      assert.match(html, /My Profile/);
    }
  });

  it('keeps existing nameless login cookies working until the next login', async () => {
    const response = await fetch(base, {
      headers: { cookie: `ctrl_alt_elite_login=${validToken}` },
    });
    const html = await response.text();
    assert.match(html, /class="account-label account-name">Account<\/span>/);
    assert.match(html, /My Profile/);
    assert.equal(response.headers.get('set-cookie'), null);
  });

  it('clears the login cookie on logout and returns to guest options', async () => {
    const response = await fetch(`${base}/logout`, {
      method: 'POST',
      headers: { cookie: `ctrl_alt_elite_login=${validToken}`, origin: base },
      redirect: 'manual',
    });
    assert.equal(response.status, 303);
    assert.equal(response.headers.get('location'), '/login');
    assert.match(
      response.headers.get('set-cookie') ?? '',
      /ctrl_alt_elite_login=;/,
    );
    assert.match(
      response.headers.get('set-cookie') ?? '',
      /Expires=Thu, 01 Jan 1970/,
    );
    const html = await (await fetch(base)).text();
    assert.match(html, /href="\/login">Login/);
    assert.doesNotMatch(html, /My Profile|Logout/);
  });

  it('does not create a login without an authenticated backend user identity', async () => {
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => {});
    const originalFetch = globalThis.fetch;
    try {
      for (const body of [{}, { user: {} }, { user: { id: '' } }]) {
        const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
          new Response(JSON.stringify(body), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }),
        );
        try {
          const response = await originalFetch(`${base}/login`, {
            method: 'POST',
            headers: { origin: base },
            body: new URLSearchParams({
              email: 'user@example.com',
              password: 'Password@1',
            }),
            redirect: 'manual',
          });
          assert.equal(response.status, 502);
          assert.equal(response.headers.get('set-cookie'), null);
          assert.match(await response.text(), /Unable to confirm your login/);
        } finally {
          fetchMock.mockRestore();
        }
      }
      assert.equal(errorLog.mock.calls.length, 3);
    } finally {
      errorLog.mockRestore();
    }
  });

  it('also accepts the newer backend userId login response', async () => {
    const originalFetch = globalThis.fetch;
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          userId: 'user-2',
          email: 'user2@example.com',
          role: 'CUSTOMER',
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        },
      ),
    );
    try {
      const response = await originalFetch(`${base}/login`, {
        method: 'POST',
        headers: { origin: base },
        body: new URLSearchParams({
          email: 'user2@example.com',
          password: 'Password@1',
        }),
        redirect: 'manual',
      });
      assert.equal(response.status, 303);
      assert.match(
        response.headers.get('set-cookie') ?? '',
        /ctrl_alt_elite_login=/,
      );
      const cookie = response.headers.get('set-cookie')?.split(';')[0];
      assert.ok(cookie);
      const homepage = await fetch(base, { headers: { cookie } });
      assert.match(
        await homepage.text(),
        /class="account-label account-name">user2@example\.com<\/span>/,
      );
    } finally {
      fetchMock.mockRestore();
    }
  });

  it('accepts numeric backend user IDs for the signed-in profile', async () => {
    const originalFetch = globalThis.fetch;
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          userId: 42,
          email: 'user2@example.com',
          role: 'CUSTOMER',
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        },
      ),
    );
    try {
      const response = await originalFetch(`${base}/login`, {
        method: 'POST',
        headers: { origin: base },
        body: new URLSearchParams({
          email: 'user2@example.com',
          password: 'Password@1',
        }),
        redirect: 'manual',
      });
      assert.equal(response.status, 303);
      assert.match(
        response.headers.get('set-cookie') ?? '',
        /ctrl_alt_elite_login=/,
      );
    } finally {
      fetchMock.mockRestore();
    }
  });

  it('rejects cross-site logout and does not log out through GET', async () => {
    for (const headers of [
      { origin: 'https://another-site.example' },
      { 'sec-fetch-site': 'cross-site' },
    ]) {
      const response = await fetch(`${base}/logout`, {
        method: 'POST',
        headers,
        redirect: 'manual',
      });
      assert.equal(response.status, 403);
      assert.equal(response.headers.get('set-cookie'), null);
    }
    assert.equal((await fetch(`${base}/logout`)).status, 404);
  });

  it('shows only guest options and clears invalid, expired or forged cookies', async () => {
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const cookies = [
      'ctrl_alt_elite_login=not-a-token',
      `ctrl_alt_elite_login=${await issueLoginToken({ exp: 1 })}`,
      `ctrl_alt_elite_login=${await issueLoginToken({}, 'different-test-secret-at-least-32-bytes')}`,
      `ctrl_alt_elite_login=${await issueLoginToken({ iss: 'wrong-issuer' })}`,
      `ctrl_alt_elite_login=${await issueLoginToken({ aud: 'wrong-audience' })}`,
      `ctrl_alt_elite_login=${await issueLoginToken({ sub: '' })}`,
      `ctrl_alt_elite_login=${await issueLoginToken({ exp: undefined })}`,
      `ctrl_alt_elite_login=${await issueLoginToken({ iat: undefined })}`,
      `ctrl_alt_elite_login=${await issueLoginToken({}, TEST_JWT_SECRET, 'HS384')}`,
      `ctrl_alt_elite_login=${validToken}; ctrl_alt_elite_login=${validToken}`,
    ];
    try {
      for (const cookie of cookies) {
        const response = await fetch(base, { headers: { cookie } });
        const html = await response.text();
        assert.equal(response.status, 200);
        assert.match(html, /href="\/login">Login/);
        assert.match(html, /href="\/register">Register/);
        assert.doesNotMatch(html, /My Profile|Logout/);
        assert.match(
          response.headers.get('set-cookie') ?? '',
          /ctrl_alt_elite_login=;/,
        );
      }
      assert.equal(warning.mock.calls.length, cookies.length);
    } finally {
      warning.mockRestore();
    }
  });

  it('uses Secure cookies in production', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    const server = createServer(
      createApp(backendOrigin, { jwtSecret: TEST_JWT_SECRET }),
    );
    const origin = await listen(server);
    try {
      const response = await login(origin);
      assert.equal(response.status, 303);
      assert.match(response.headers.get('set-cookie') ?? '', /; Secure/);
    } finally {
      vi.unstubAllEnvs();
      await close(server);
    }
  });

  it('fails safely when the signing secret is unavailable', async () => {
    vi.stubEnv('JWT_SECRET', undefined);
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const server = createServer(createApp(backendOrigin));
    const origin = await listen(server);
    try {
      const response = await fetch(origin, {
        headers: { cookie: `ctrl_alt_elite_login=${validToken}` },
      });
      assert.match(await response.text(), /href="\/login">Login/);
      assert.match(
        response.headers.get('set-cookie') ?? '',
        /ctrl_alt_elite_login=;/,
      );
      assert.equal(warning.mock.calls.length, 1);
    } finally {
      warning.mockRestore();
      vi.unstubAllEnvs();
      await close(server);
    }
  });

  it('rejects short signing secrets', () => {
    assert.throws(() => new LoginSession('too-short'), /at least 32 bytes/);
  });
});
