/**
 * Scrubs secrets out of anything on its way to an error reporter.
 *
 * The Telegram Bot API takes its token in the URL path, and this deployment
 * runs Sentry with tracesSampleRate 1 and sendDefaultPii, so every outgoing
 * call would otherwise ship `/bot<TOKEN>/sendMessage` to a third party as a
 * span description. That token is the bot's master credential.
 */
const BOT_TOKEN_IN_URL = /\/bot\d+:[A-Za-z0-9_-]+/g;

export function redactString(value) {
  return typeof value === "string" ? value.replace(BOT_TOKEN_IN_URL, "/bot[REDACTED]") : value;
}

/**
 * Walks an event in place — Sentry events are plain JSON, and mutating rather
 * than rebuilding keeps object identity intact for the SDK.
 */
export function redactDeep(value, depth = 0) {
  if (depth > 8 || !value || typeof value !== "object") return value;
  for (const [key, child] of Object.entries(value)) {
    if (typeof child === "string") value[key] = redactString(child);
    else redactDeep(child, depth + 1);
  }
  return value;
}
