import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, it, vi } from 'vitest';
import { createApp } from '../src/app';
import {
  CHANGE_PASSWORD_PATH,
  changePassword,
  validatePasswordForm,
} from '../src/util/adminPassword';
import {
  UPDATE_PROFILE_PATH,
  updateProfile,
  validateProfileForm,
} from '../src/util/adminProfile';
import {
  applyPreferences,
  DASHBOARD_WIDGETS,
  loadSystemStatuses,
  type PreferenceStorage,
  readHiddenWidgets,
  readTheme,
  renderStatusBadge,
  saveHiddenWidgets,
  saveTheme,
} from '../src/util/adminSettings';
import { loadAdminProfile } from '../src/util/adminUser';

function memoryStorage(
  initial: Record<string, string> = {},
): PreferenceStorage {
  const store = new Map(Object.entries(initial));
  return {
    getItem: (key) => store.get(key) ?? null,
    setItem: (key, value) => {
      store.set(key, value);
    },
  };
}

const throwingStorage: PreferenceStorage = {
  getItem: () => {
    throw new Error('blocked');
  },
  setItem: () => {
    throw new Error('blocked');
  },
};

describe('admin preferences', () => {
  it('defaults to light mode with every widget visible', () => {
    const storage = memoryStorage();
    assert.equal(readTheme(storage), 'light');
    assert.deepEqual(readHiddenWidgets(storage), []);
  });

  it('round-trips the theme and hidden widgets', () => {
    const storage = memoryStorage();
    saveTheme(storage, 'dark');
    saveHiddenWidgets(storage, ['notifications', 'systemStatus']);
    assert.equal(readTheme(storage), 'dark');
    assert.deepEqual(readHiddenWidgets(storage), [
      'notifications',
      'systemStatus',
    ]);
    saveTheme(storage, 'light');
    assert.equal(readTheme(storage), 'light');
  });

  it('ignores invalid stored values', () => {
    for (const stored of ['not json', '{"a":1}', '["bogus",42]']) {
      assert.deepEqual(
        readHiddenWidgets(memoryStorage({ 'admin.hiddenWidgets': stored })),
        [],
      );
    }
    assert.equal(readTheme(memoryStorage({ 'admin.theme': 'neon' })), 'light');
  });

  it('keeps working when storage is blocked', () => {
    assert.equal(readTheme(throwingStorage), 'light');
    assert.deepEqual(readHiddenWidgets(throwingStorage), []);
    saveTheme(throwingStorage, 'dark');
    saveHiddenWidgets(throwingStorage, ['customerCount']);
  });

  it('applies the saved preferences to the root element', () => {
    const root = { dataset: {} as Record<string, string | undefined> };
    applyPreferences(
      root,
      memoryStorage({
        'admin.theme': 'dark',
        'admin.hiddenWidgets': '["customerCount","recentActivity"]',
      }),
    );
    assert.equal(root.dataset.theme, 'dark');
    assert.equal(root.dataset.hiddenWidgets, 'customerCount recentActivity');
  });

  it('offers the four dashboard widgets', () => {
    assert.deepEqual(
      DASHBOARD_WIDGETS.map((widget) => widget.label),
      [
        'Show Customer Count',
        'Show Recent Activity',
        'Show Notifications',
        'Show System Status',
      ],
    );
  });
});

describe('system statuses', () => {
  it('reports the backend and database as up when the request succeeds', async () => {
    const fetchImpl = vi.fn(async () => new Response('{}', { status: 200 }));
    const { available, statuses } = await loadSystemStatuses(fetchImpl);
    assert.equal(available, true);
    assert.equal(statuses.backend.ok, true);
    assert.equal(statuses.database.ok, true);
  });

  it('reports unavailable on error responses and network failures', async () => {
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      for (const fetchImpl of [
        async () => new Response('{}', { status: 502 }),
        async () => {
          throw new Error('down');
        },
      ]) {
        const { available, statuses } = await loadSystemStatuses(fetchImpl);
        assert.equal(available, false);
        assert.equal(statuses.backend.text, 'Unavailable');
        assert.equal(statuses.database.ok, false);
      }
    } finally {
      errorLog.mockRestore();
    }
  });

  it('escapes badge text', () => {
    assert.match(
      renderStatusBadge({ text: '<b>', ok: false }),
      /&lt;b&gt;.*<\/span>$/,
    );
  });
});

describe('admin settings page', () => {
  let backend: Server;
  let frontend: Server;
  let backendOrigin: string;
  let base: string;

  function listen(server: Server): Promise<string> {
    return new Promise((resolve) => {
      server.listen(0, '127.0.0.1', () => {
        resolve(`http://127.0.0.1:${(server.address() as AddressInfo).port}`);
      });
    });
  }

  const adminToken = 'admin-token';
  const brokenToken = 'broken-token';

  beforeAll(async () => {
    backend = createServer((req, res) => {
      const auth = req.headers.authorization;
      if (req.url === '/api/admin/customers?pageSize=1') {
        res.end('{}');
      } else if (
        req.url === '/api/admin/profile' &&
        auth === 'Bearer admin-token'
      ) {
        res.end(
          JSON.stringify({
            id: 1,
            name: 'Ada Lovelace <b>',
            email: 'ada@example.com',
            role: 'ADMIN',
          }),
        );
      } else {
        res.statusCode = 500;
        res.end('{}');
      }
    });
    backendOrigin = await listen(backend);
    frontend = createServer(createApp(backendOrigin));
    base = await listen(frontend);
  });

  afterAll(() => {
    backend.close();
    frontend.close();
  });

  async function getSettings(token: string) {
    const res = await fetch(`${base}/admin/settings`, {
      headers: { cookie: `auth_token=${token}` },
    });
    return { status: res.status, html: await res.text() };
  }

  it('shows the name, email and role of the signed-in admin', async () => {
    const { status, html } = await getSettings(adminToken);
    assert.equal(status, 200);
    assert.match(html, /<h1>Settings<\/h1>/);
    assert.match(html, /<dd data-profile-name>Ada Lovelace &lt;b&gt;<\/dd>/);
    assert.match(html, /<dd data-profile-email>ada@example\.com<\/dd>/);
    assert.match(html, /<dd>Administrator<\/dd>/);
    assert.doesNotMatch(html, /data-settings-profile-error/);
  });

  it('shows an error message when the profile cannot be loaded', async () => {
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const { status, html } = await getSettings(brokenToken);
      assert.equal(status, 200);
      assert.match(
        html,
        /role="alert" data-settings-profile-error>Unable to load/,
      );
      assert.doesNotMatch(html, /data-settings-profile>/);
    } finally {
      errorLog.mockRestore();
    }
  });

  it('renders the appearance, preferences and system sections', async () => {
    const { html } = await getSettings(adminToken);
    assert.match(html, /<h2 id="appearance-heading">Appearance<\/h2>/);
    assert.match(html, /role="switch" data-dark-mode-toggle/);
    for (const widget of [
      'customerCount',
      'recentActivity',
      'notifications',
      'systemStatus',
    ]) {
      assert.ok(html.includes(`data-widget-toggle="${widget}"`), widget);
    }
    for (const label of [
      'Show Customer Count',
      'Show Recent Activity',
      'Show Notifications',
      'Show System Status',
      'Application Version',
      'Frontend Status',
      'Backend Status',
      'Database Status',
    ]) {
      assert.ok(html.includes(label), `missing "${label}"`);
    }
    assert.match(html, /<button[^>]*data-widgets-show-all>Show all<\/button>/);
    assert.match(html, /<button[^>]*data-widgets-hide-all>Hide all<\/button>/);
    assert.match(html, /data-system-version>\d+\.\d+\.\d+/);
    assert.match(html, /data-system-error hidden/);
    assert.match(html, /<script src="\/controllers\/adminSettings\.js" defer>/);
    assert.match(html, /is-active"\s+href="\/admin\/settings"/);
  });

  it('loads the saved preferences on every admin page', async () => {
    for (const path of ['/admin', '/admin/settings', '/admin/customers']) {
      const res = await fetch(`${base}${path}`, {
        headers: { cookie: `auth_token=${adminToken}` },
      });
      assert.match(
        await res.text(),
        /<script src="\/controllers\/adminPreferences\.js"><\/script>/,
        path,
      );
    }
  });

  it('marks the dashboard widgets so they can be hidden', async () => {
    const res = await fetch(`${base}/admin`, {
      headers: { cookie: `auth_token=${adminToken}` },
    });
    const html = await res.text();
    for (const widget of [
      'customerCount',
      'recentActivity',
      'notifications',
      'systemStatus',
    ]) {
      assert.ok(html.includes(`data-widget="${widget}"`), widget);
    }
  });

  it('loads the profile directly', async () => {
    assert.deepEqual(await loadAdminProfile(backendOrigin, adminToken), {
      name: 'Ada Lovelace <b>',
      email: 'ada@example.com',
      role: 'Administrator',
    });
    assert.equal(await loadAdminProfile(backendOrigin, null), null);
  });

  it('renders a hidden edit form prefilled and escaped', async () => {
    const { html } = await getSettings(adminToken);
    assert.match(html, /<button[^>]*hidden data-profile-edit>Edit<\/button>/);
    assert.match(html, /<form[^>]*method="post"[^>]*hidden data-profile-form>/);
    assert.match(
      html,
      /name="name" type="text"[^>]*value="Ada Lovelace &lt;b&gt;"/,
    );
    assert.match(
      html,
      /name="email" type="email"[^>]*value="ada@example\.com"/,
    );
    assert.match(html, /data-profile-cancel>Cancel<\/button>/);
  });

  it('has no edit controls when the profile cannot be loaded', async () => {
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const { html } = await getSettings(brokenToken);
      assert.doesNotMatch(html, /data-profile-edit|data-profile-form/);
    } finally {
      errorLog.mockRestore();
    }
  });

  it('renders the change password form', async () => {
    const { html } = await getSettings(adminToken);
    assert.match(html, /<h2 id="password-heading">Change Password<\/h2>/);
    for (const field of ['currentPassword', 'newPassword', 'confirmPassword']) {
      assert.match(html, new RegExp(`name="${field}" type="password"`), field);
    }
    assert.match(html, /<form[^>]*method="post"[^>]*data-password-form/);
    assert.match(html, /data-password-error hidden/);
    assert.match(html, /data-password-success hidden/);
    assert.match(html, />Save Changes<\/button>/);
  });
});

describe('change password', () => {
  const form = {
    currentPassword: 'OldPassword123',
    newPassword: 'NewPassword123',
    confirmPassword: 'NewPassword123',
  };

  it('accepts a complete form with matching passwords', () => {
    assert.equal(validatePasswordForm(form), null);
  });

  it('rejects missing fields and mismatching passwords', () => {
    assert.match(
      validatePasswordForm({ ...form, currentPassword: '' }) ?? '',
      /current password/,
    );
    assert.match(
      validatePasswordForm({ ...form, newPassword: '' }) ?? '',
      /new password/,
    );
    assert.match(
      validatePasswordForm({ ...form, confirmPassword: '' }) ?? '',
      /Confirm/,
    );
    assert.match(
      validatePasswordForm({ ...form, confirmPassword: 'Different123' }) ?? '',
      /do not match/,
    );
  });

  it('sends a PUT with the three fields and returns the success message', async () => {
    const fetchImpl = vi.fn(
      async (_input: string | URL | Request, _init?: RequestInit) =>
        Response.json({ message: 'Password updated successfully.' }),
    );
    const result = await changePassword(form, fetchImpl);
    assert.deepEqual(result, {
      ok: true,
      message: 'Password updated successfully.',
    });
    const [url, init] = fetchImpl.mock.calls[0] ?? [];
    assert.equal(url, CHANGE_PASSWORD_PATH);
    assert.equal(init?.method, 'PUT');
    assert.deepEqual(JSON.parse(String(init?.body)), form);
  });

  it('falls back to a default success message', async () => {
    const result = await changePassword(
      form,
      async () => new Response(null, { status: 204 }),
    );
    assert.deepEqual(result, {
      ok: true,
      message: 'Password updated successfully.',
    });
  });

  it('shows the backend message for client errors', async () => {
    const result = await changePassword(form, async () =>
      Response.json(
        { message: 'Current password is incorrect.' },
        { status: 400 },
      ),
    );
    assert.deepEqual(result, {
      ok: false,
      message: 'Current password is incorrect.',
    });
  });

  it('shows a generic message for server errors and network failures', async () => {
    const generic = /Unable to update your password/;
    const serverError = await changePassword(form, async () =>
      Response.json({ message: 'stack trace at db.ts' }, { status: 500 }),
    );
    assert.equal(serverError.ok, false);
    assert.match(serverError.message, generic);
    assert.doesNotMatch(serverError.message, /stack trace/);

    const unreachable = await changePassword(form, async () => {
      throw new Error('down');
    });
    assert.equal(unreachable.ok, false);
    assert.match(unreachable.message, generic);

    const notJson = await changePassword(
      form,
      async () => new Response('<html>', { status: 502 }),
    );
    assert.match(notJson.message, generic);
  });
});

describe('edit profile', () => {
  const form = { name: 'Ada Lovelace', email: 'ada@example.com' };

  it('accepts a valid name and email', () => {
    assert.equal(validateProfileForm(form), null);
    assert.equal(
      validateProfileForm({ name: '  Ada  ', email: ' ada@example.com ' }),
      null,
    );
  });

  it('rejects an empty or overlong name and an invalid email', () => {
    assert.match(validateProfileForm({ ...form, name: '  ' }) ?? '', /name/);
    assert.match(
      validateProfileForm({ ...form, name: 'a'.repeat(101) }) ?? '',
      /100 characters/,
    );
    assert.match(validateProfileForm({ ...form, email: '' }) ?? '', /email/);
    for (const email of ['plain', 'a@b', 'a b@c.com', '@c.com']) {
      assert.match(
        validateProfileForm({ ...form, email }) ?? '',
        /valid email/,
        email,
      );
    }
  });

  it('sends a trimmed PUT and uses the profile the backend returns', async () => {
    const fetchImpl = vi.fn(
      async (_input: string | URL | Request, _init?: RequestInit) =>
        Response.json({
          name: 'Ada L.',
          email: 'ada@elite.com',
          role: 'ADMIN',
        }),
    );
    const result = await updateProfile(
      { name: ' Ada Lovelace ', email: ' ada@example.com ' },
      fetchImpl,
    );
    assert.deepEqual(result, {
      ok: true,
      message: 'Profile updated successfully.',
      profile: { name: 'Ada L.', email: 'ada@elite.com' },
    });
    const [url, init] = fetchImpl.mock.calls[0] ?? [];
    assert.equal(url, UPDATE_PROFILE_PATH);
    assert.equal(init?.method, 'PUT');
    assert.deepEqual(JSON.parse(String(init?.body)), form);
  });

  it('falls back to the submitted values and a default message', async () => {
    const result = await updateProfile(
      form,
      async () => new Response(null, { status: 204 }),
    );
    assert.deepEqual(result, {
      ok: true,
      message: 'Profile updated successfully.',
      profile: form,
    });
  });

  it('uses the backend message when one accompanies the profile', async () => {
    const result = await updateProfile(form, async () =>
      Response.json({ ...form, message: 'Saved.' }),
    );
    assert.equal(result.message, 'Saved.');
  });

  it('shows the backend message for client errors', async () => {
    const result = await updateProfile(form, async () =>
      Response.json({ message: 'Email is already in use.' }, { status: 409 }),
    );
    assert.deepEqual(result, {
      ok: false,
      message: 'Email is already in use.',
    });
  });

  it('shows a generic message for server errors and network failures', async () => {
    const generic = /Unable to update your profile/;
    const serverError = await updateProfile(form, async () =>
      Response.json({ message: 'stack trace at db.ts' }, { status: 500 }),
    );
    assert.equal(serverError.ok, false);
    assert.match(serverError.message, generic);
    assert.doesNotMatch(serverError.message, /stack trace/);

    const unreachable = await updateProfile(form, async () => {
      throw new Error('down');
    });
    assert.equal(unreachable.ok, false);
    assert.match(unreachable.message, generic);
  });
});
