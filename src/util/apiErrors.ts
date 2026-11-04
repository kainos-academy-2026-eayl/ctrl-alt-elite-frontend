import { loginUrl } from './returnPath';

// The token is missing or expired (HTTP 401).
export class SessionExpiredError extends Error {
  constructor() {
    super('The session has expired.');
    this.name = 'SessionExpiredError';
  }
}

// The signed-in role may not use the endpoint (HTTP 403).
export class AccessDeniedError extends Error {
  constructor() {
    super('The role is not allowed to do this.');
    this.name = 'AccessDeniedError';
  }
}

// A network failure, timeout, 5xx or unreadable response: worth retrying.
export class ServiceUnavailableError extends Error {
  constructor(message = 'The service could not be reached.') {
    super(message);
    this.name = 'ServiceUnavailableError';
  }
}

// Throws the matching error for the statuses every admin API call handles the
// same way, and returns normally for anything else.
export function throwForSharedStatus(status: number): void {
  if (status === 401) throw new SessionExpiredError();
  if (status === 403) throw new AccessDeniedError();
  if (status >= 500) {
    throw new ServiceUnavailableError(`The server responded with ${status}.`);
  }
}

// Where the browser should go when the session has expired, so that the user
// lands back on the page they were using after logging in.
export function loginRedirectFor(location: {
  pathname: string;
  search: string;
}): string {
  return loginUrl(`${location.pathname}${location.search}`);
}
