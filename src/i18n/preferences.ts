import express, {
  type NextFunction,
  type Request,
  type Response,
  Router,
} from 'express';
import { requireSameOrigin } from '../middleware/requireSameOrigin';
import type { ProductTranslationService } from '../services/productTranslationService';
import { safeReturnPath } from '../util/returnPath';
import { runWithPreferences } from './context';
import {
  type Currency,
  DEFAULT_CURRENCY,
  DEFAULT_WIDGET_POSITION,
  isCurrency,
  isLocale,
  isWidgetPosition,
  type Locale,
  localeFromHeader,
} from './locales';

export const LANGUAGE_COOKIE = 'lang';
export const CURRENCY_COOKIE = 'currency';
export const POSITION_COOKIE = 'a11y_position';
const ONE_YEAR_MS = 365 * 24 * 60 * 60 * 1000;

function readCookie(header: string | undefined, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(';')) {
    const separator = part.indexOf('=');
    if (separator === -1 || part.slice(0, separator).trim() !== name) continue;
    try {
      return decodeURIComponent(part.slice(separator + 1).trim());
    } catch {
      return null;
    }
  }
  return null;
}

export function readPreferences(req: Request): {
  locale: Locale;
  currency: Currency;
} {
  const lang = readCookie(req.headers.cookie, LANGUAGE_COOKIE);
  const currency = readCookie(req.headers.cookie, CURRENCY_COOKIE);
  return {
    locale: isLocale(lang)
      ? lang
      : localeFromHeader(req.get('accept-language')),
    currency: isCurrency(currency) ? currency : DEFAULT_CURRENCY,
  };
}

/**
 * Runs the rest of the request with the visitor's language and currency, and
 * gives every template what the language and currency picker needs.
 */
export function createPreferencesMiddleware(
  productTranslations: ProductTranslationService,
) {
  return async (
    req: Request,
    _res: Response,
    next: NextFunction,
  ): Promise<void> => {
    // Staff pages stay in English and pounds.
    const isStaffPage = /^\/(admin|dashboard)(\/|$)/.test(req.path);
    const { locale, currency } = isStaffPage
      ? { locale: 'en' as const, currency: DEFAULT_CURRENCY }
      : readPreferences(req);
    const productText = await productTranslations.getProductText(locale);
    const currentPath = safeReturnPath(req.originalUrl) ?? '/';
    const position = readCookie(req.headers.cookie, POSITION_COOKIE);
    const widgetPosition = isWidgetPosition(position)
      ? position
      : DEFAULT_WIDGET_POSITION;
    runWithPreferences(
      { locale, currency, productText, currentPath, widgetPosition },
      () => next(),
    );
  };
}

/** POST /preferences: saves the chosen language and currency, then goes back. */
export function createPreferencesRouter(): Router {
  const router = Router();
  router.post(
    '/',
    requireSameOrigin,
    express.urlencoded({ extended: false, limit: '4kb' }),
    (req: Request, res: Response) => {
      res.setHeader('Cache-Control', 'no-store');
      const body = (req.body ?? {}) as Record<string, unknown>;
      const cookieOptions = {
        httpOnly: true,
        sameSite: 'lax' as const,
        secure: process.env.NODE_ENV === 'production',
        path: '/',
        maxAge: ONE_YEAR_MS,
      };
      if (isLocale(body.lang)) {
        res.cookie(LANGUAGE_COOKIE, body.lang, cookieOptions);
      }
      if (isCurrency(body.currency)) {
        res.cookie(CURRENCY_COOKIE, body.currency, cookieOptions);
      }
      if (isWidgetPosition(body.position)) {
        res.cookie(POSITION_COOKIE, body.position, cookieOptions);
      }
      res.redirect(303, safeReturnPath(body.returnTo) ?? '/');
    },
  );
  return router;
}
