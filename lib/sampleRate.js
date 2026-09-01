/**
 * Resolves a Sentry sample rate from configuration.
 *
 * Deliberately dependency-free so the client Sentry config can import it too:
 * the lib/ boundary exists to keep the database driver and node:crypto out of
 * the browser bundle, not to ban a pure function.
 *
 * A missing, empty or nonsensical value falls back rather than throwing —
 * a typo in a dashboard variable should not take error reporting down with it,
 * and Sentry treats a NaN rate as "never sample", which would lose the data
 * silently.
 */
export function sampleRate(value, fallback) {
  if (value == null || value === "") return fallback;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0 || n > 1) return fallback;
  return n;
}

/** Full tracing while developing; a modest slice of production traffic. */
export function defaultTracesSampleRate(nodeEnv) {
  return nodeEnv === "production" ? 0.1 : 1;
}
