import * as Sentry from "@sentry/nextjs";

/**
 * Reports a browser-side failure.
 *
 * The server's `onRequestError` hook only sees requests that reached a route
 * handler, and the browser Sentry config has no console integration — so a
 * fetch that failed in the browser reaches nobody but whoever has devtools
 * open. A genuinely offline browser is the exception: there is nothing at the
 * other end to fix, and a reader on a train would report every retry.
 */
export function reportClientError(where, error) {
  console.error(where, error);
  if (typeof navigator !== "undefined" && navigator.onLine === false) return;
  Sentry.captureException(error, { tags: { where } });
}
