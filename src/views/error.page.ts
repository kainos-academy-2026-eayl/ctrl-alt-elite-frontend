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

const ERROR_COPY: Record<number, { title: string; message: string }> = {
  404: {
    title: 'Page not found',
    message:
      'Sorry, we could not find that page. It may have been moved or removed.',
  },
  503: {
    title: 'Service temporarily unavailable',
    message:
      'Sorry, this part of the website is unavailable right now. Please try again in a little while.',
  },
};

const DEFAULT_COPY = {
  title: 'Something went wrong',
  message:
    'Sorry, we could not load this page. Please try again in a little while.',
};

export function buildErrorPage(status: number, now = new Date()): ErrorPage {
  const copy = ERROR_COPY[status] ?? DEFAULT_COPY;
  return { status, ...copy, currentYear: now.getFullYear() };
}
