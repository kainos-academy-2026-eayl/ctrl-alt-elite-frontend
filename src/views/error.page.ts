import { type MessageKey, t } from '../i18n/runtime';

/*
 * Page model for error.njk: the status code, heading and message to show when
 * a page cannot be displayed. Error details are logged, never shown.
 */

export interface ErrorPage {
  status: number;
  title: string;
  message: string;
  currentYear: number;
}

const KNOWN_STATUSES = new Set([404, 503]);

export function buildErrorPage(status: number, now = new Date()): ErrorPage {
  const kind = KNOWN_STATUSES.has(status) ? String(status) : 'default';
  return {
    status,
    title: t(`error.${kind}.title` as MessageKey),
    message: t(`error.${kind}.message` as MessageKey),
    currentYear: now.getFullYear(),
  };
}
