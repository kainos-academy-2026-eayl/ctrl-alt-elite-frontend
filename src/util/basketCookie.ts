import type { Response } from 'express';
import { isBasketId } from '../dtos/basketDto';

/*
 * The basket id lives in an httpOnly cookie so the server can load the basket.
 * No expiry is set, so the browser forgets it when it is closed.
 * A short-lived "notice" cookie carries the message to show after a form post
 * redirects back to the basket page (Post/Redirect/Get).
 */

export const BASKET_COOKIE_NAME = 'basket_id';
export const BASKET_NOTICE_COOKIE_NAME = 'basket_notice';
const NOTICE_PATH = '/basket';
const NOTICE_MAX_AGE_MS = 60 * 1000;
const MAX_NOTICE_LENGTH = 300;

export interface BasketNotice {
  isError: boolean;
  message: string;
}

function cookieOptions(path: string) {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: process.env.NODE_ENV === 'production',
    path,
  };
}

function readCookie(
  cookieHeader: string | undefined,
  name: string,
): string | null {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(';')) {
    const separator = part.indexOf('=');
    if (separator === -1) continue;
    if (part.slice(0, separator).trim() !== name) continue;
    try {
      return decodeURIComponent(part.slice(separator + 1).trim()) || null;
    } catch {
      return null;
    }
  }
  return null;
}

export function readBasketCookie(
  cookieHeader: string | undefined,
): string | null {
  const basketId = readCookie(cookieHeader, BASKET_COOKIE_NAME);
  return isBasketId(basketId) ? basketId : null;
}

export function setBasketCookie(res: Response, basketId: string): void {
  res.cookie(BASKET_COOKIE_NAME, basketId, cookieOptions('/'));
}

export function clearBasketCookie(res: Response): void {
  res.clearCookie(BASKET_COOKIE_NAME, cookieOptions('/'));
}

export function readBasketNotice(
  cookieHeader: string | undefined,
): BasketNotice | null {
  const value = readCookie(cookieHeader, BASKET_NOTICE_COOKIE_NAME);
  if (value === null) return null;
  try {
    const notice: unknown = JSON.parse(value);
    if (
      typeof notice === 'object' &&
      notice !== null &&
      'isError' in notice &&
      typeof notice.isError === 'boolean' &&
      'message' in notice &&
      typeof notice.message === 'string' &&
      notice.message.length <= MAX_NOTICE_LENGTH
    ) {
      return { isError: notice.isError, message: notice.message };
    }
  } catch {
    // A malformed notice is ignored rather than shown.
  }
  return null;
}

export function setBasketNotice(res: Response, notice: BasketNotice): void {
  res.cookie(
    BASKET_NOTICE_COOKIE_NAME,
    JSON.stringify({
      isError: notice.isError,
      message: notice.message.slice(0, MAX_NOTICE_LENGTH),
    }),
    { ...cookieOptions(NOTICE_PATH), maxAge: NOTICE_MAX_AGE_MS },
  );
}

export function clearBasketNotice(res: Response): void {
  res.clearCookie(BASKET_NOTICE_COOKIE_NAME, cookieOptions(NOTICE_PATH));
}
