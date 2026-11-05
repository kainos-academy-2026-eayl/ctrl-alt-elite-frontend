import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { Request, Response } from 'express';
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
import { currentPreferences, runWithPreferences } from '../src/i18n/context';
import { localeFromHeader } from '../src/i18n/locales';
import cy from '../src/i18n/messages/cy';
import en from '../src/i18n/messages/en';
import fr from '../src/i18n/messages/fr';
import ga from '../src/i18n/messages/ga';
import { formatPounds, formatPrice } from '../src/i18n/money';
import { createPreferencesMiddleware } from '../src/i18n/preferences';
import { t, tCount } from '../src/i18n/runtime';
import { ProductTranslationService } from '../src/services/productTranslationService';
import '../src/i18n/server';

function inLocale<T>(
  locale: 'en' | 'cy' | 'ga' | 'fr',
  currency: 'GBP' | 'EUR',
  run: () => T,
): T {
  return runWithPreferences(
    {
      locale,
      currency,
      productText: new Map(),
      currentPath: '/',
      widgetPosition: 'bottom-right',
    },
    run,
  );
}

const placeholders = (text: string) =>
  [...text.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort();

describe('translations', () => {
  const english = en as Record<string, string>;
  const pluralBase = (key: string) => key.replace(/\.(one|other)$/, '');

  for (const [name, messages] of Object.entries({ cy, ga, fr })) {
    it(`${name} translates every English key with the same placeholders`, () => {
      const keys = Object.keys(messages);
      for (const key of Object.keys(english)) {
        if (/\.(one|other)$/.test(key)) {
          // Plural keys may use the language's own forms, but need "other".
          assert.ok(
            messages[`${pluralBase(key)}.other`],
            `${name} is missing ${pluralBase(key)}.other`,
          );
          continue;
        }
        assert.ok(messages[key], `${name} is missing ${key}`);
        assert.deepEqual(
          placeholders(messages[key] as string),
          placeholders(english[key] as string),
          `${name} ${key} placeholders`,
        );
      }
      for (const key of keys) {
        const base = key.replace(/\.(zero|one|two|few|many|other)$/, '');
        assert.ok(
          key in english || `${base}.other` in english,
          `${name} has an unknown key ${key}`,
        );
      }
    });
  }

  it('falls back to English for missing keys and shows unknown keys as-is', () => {
    inLocale('fr', 'GBP', () => {
      assert.notEqual(t('home.heading'), en['home.heading']);
      assert.equal(t('not.a.key' as never), 'not.a.key');
    });
  });

  it('chooses plural forms with each language’s rules', () => {
    inLocale('en', 'GBP', () => {
      assert.equal(tCount('count.items', 1), '1 item');
      assert.equal(tCount('count.items', 2), '2 items');
    });
    // Welsh has a separate form for exactly two.
    inLocale('cy', 'GBP', () => {
      assert.ok(cy['count.items.two']);
      assert.equal(tCount('count.items', 2), fill(cy['count.items.two'], 2));
    });
  });
});

function fill(template: string | undefined, count: number): string {
  return (template ?? '').replace('{count}', String(count));
}

describe('prices', () => {
  it('shows converted, approximate prices but charges exact pounds', () => {
    inLocale('en', 'EUR', () => {
      assert.equal(formatPrice(1000), '€11.70');
      assert.equal(formatPounds(1000), '£10.00');
    });
    inLocale('fr', 'GBP', () => {
      assert.match(formatPrice(1234), /^12,34\s£$/);
    });
  });
});

describe('localeFromHeader', () => {
  it('picks the best supported language from Accept-Language', () => {
    assert.equal(localeFromHeader('cy-GB,en;q=0.8'), 'cy');
    assert.equal(localeFromHeader('de-DE,fr;q=0.9,en;q=0.5'), 'fr');
    assert.equal(localeFromHeader('de-DE'), 'en');
    assert.equal(localeFromHeader(undefined), 'en');
  });
});

const BACKEND_ORIGIN = 'https://backend.example.test';

describe('language, currency and the accessibility menu (no JavaScript)', () => {
  const fetchFrontend = globalThis.fetch;
  let frontend: Server;
  let base: string;
  let translationRequests: string[];

  beforeAll(async () => {
    frontend = createServer(createApp(BACKEND_ORIGIN));
    await new Promise<void>((resolve) =>
      frontend.listen(0, '127.0.0.1', resolve),
    );
    base = `http://127.0.0.1:${(frontend.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    await new Promise((resolve) => frontend.close(resolve));
  });

  beforeEach(() => {
    translationRequests = [];
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = new URL(new Request(input, init).url);
      assert.equal(url.origin, BACKEND_ORIGIN);
      if (url.pathname === '/api/product-translations') {
        translationRequests.push(url.searchParams.get('lang') ?? '');
        return Response.json({
          lang: url.searchParams.get('lang'),
          translations: {
            cap: { name: 'Casquette', description: 'Une casquette.' },
          },
        });
      }
      if (url.pathname === '/api/products/search') {
        return Response.json({
          searchTerm: url.searchParams.get('q'),
          products: [
            {
              id: 'cap',
              name: 'Baseball Cap',
              description: 'A cap.',
              imageUrl: 'data:image/png;base64,AA==',
              price: '10.00',
              keywords: ['Accessories'],
              isInStock: true,
            },
          ],
          isClosestMatch: false,
        });
      }
      throw new Error(`Unexpected backend request: ${url}`);
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function search(cookie = '', headers: Record<string, string> = {}) {
    return fetchFrontend(`${base}/search?q=cap`, {
      headers: { cookie, ...headers },
    });
  }

  it('shows English and pounds by default, with a skip link and the menu', async () => {
    const html = await (await search()).text();
    assert.match(html, /<html lang="en">/);
    assert.match(
      html,
      /<a class="skip-link" href="#main-content">Skip to main content<\/a>/,
    );
    assert.match(html, /<main id="main-content" tabindex="-1">/);
    assert.match(
      html,
      /<details class="a11y-widget a11y-widget--bottom-right" data-a11y-widget>/,
    );
    assert.match(
      html,
      /<option value="en" lang="en" selected>English<\/option>/,
    );
    assert.match(html, /<option value="GBP" selected>£ GBP<\/option>/);
    assert.match(html, /<h3>Baseball Cap<\/h3>/);
    assert.match(html, /£10\.00/);
    assert.deepEqual(translationRequests, []);
  });

  it('shows the chosen language, translated products and euros', async () => {
    const html = await (await search('lang=fr; currency=EUR')).text();
    assert.match(html, /<html lang="fr">/);
    assert.match(html, new RegExp(`>${fr['search.heading']}</h1>`));
    assert.match(html, /<h3>Casquette<\/h3>/);
    assert.match(html, /<p class="product-description">Une casquette\.<\/p>/);
    assert.match(html, /11,70\s€/);
    assert.match(html, /a11y-note/);
    assert.deepEqual(translationRequests, ['fr']);
  });

  it('uses the browser language when none has been chosen', async () => {
    const html = await (
      await search('', { 'accept-language': 'cy-GB,en;q=0.5' })
    ).text();
    assert.match(html, /<html lang="cy">/);
  });

  it('saves the choices in cookies and returns to the same page', async () => {
    const res = await fetchFrontend(`${base}/preferences`, {
      method: 'POST',
      redirect: 'manual',
      headers: {
        origin: base,
        'content-type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        lang: 'ga',
        currency: 'EUR',
        position: 'top-left',
        returnTo: '/search?q=cap',
      }),
    });
    assert.equal(res.status, 303);
    assert.equal(res.headers.get('location'), '/search?q=cap');
    const cookies = res.headers.getSetCookie().join('\n');
    assert.match(cookies, /^lang=ga;.*HttpOnly/m);
    assert.match(cookies, /^currency=EUR;.*HttpOnly/m);
    assert.match(cookies, /^a11y_position=top-left;.*HttpOnly/m);
  });

  it('ignores unknown values and never redirects to another site', async () => {
    const res = await fetchFrontend(`${base}/preferences`, {
      method: 'POST',
      redirect: 'manual',
      headers: {
        origin: base,
        'content-type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        lang: 'xx',
        currency: 'USD',
        position: 'middle',
        returnTo: 'https://evil.example',
      }),
    });
    assert.equal(res.headers.get('location'), '/');
    assert.deepEqual(res.headers.getSetCookie(), []);
  });

  it('rejects preference changes from other sites', async () => {
    const res = await fetchFrontend(`${base}/preferences`, {
      method: 'POST',
      headers: {
        origin: 'https://evil.example',
        'content-type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ lang: 'fr' }),
    });
    assert.equal(res.status, 403);
  });

  it('puts the menu in the saved corner', async () => {
    const html = await (await search('a11y_position=top-left')).text();
    assert.match(html, /a11y-widget--top-left/);
    assert.match(html, /<option value="top-left" selected>Top left<\/option>/);
  });

  it('keeps staff pages in English', async () => {
    const middleware = createPreferencesMiddleware(
      new ProductTranslationService(BACKEND_ORIGIN),
    );
    for (const [path, expected] of [
      ['/admin/customers', 'en'],
      ['/dashboard', 'en'],
      ['/search', 'fr'],
    ] as const) {
      const req = {
        path,
        originalUrl: path,
        headers: { cookie: 'lang=fr' },
        get: () => undefined,
      } as unknown as Request;
      const locale = await new Promise<string>((resolve) => {
        void middleware(req, {} as Response, () =>
          resolve(currentPreferences().locale),
        );
      });
      assert.equal(locale, expected, path);
    }
  });
});
