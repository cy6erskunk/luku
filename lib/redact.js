/**
 * Scrubs secrets out of anything on its way to an error reporter.
 *
 * This deployment runs Sentry with tracesSampleRate 1 and sendDefaultPii, and
 * the Next.js integration attaches request context to events — so headers and
 * the full URL travel with any handler error. Four credentials ride along:
 *
 *   - the Bot API token, which Telegram requires in the URL path
 *   - TELEGRAM_WEBHOOK_SECRET, which Telegram echoes in a header on every
 *     legitimate delivery
 *   - the Vercel protection-bypass token, which the documented preview setup
 *     puts in the webhook's query string
 *   - the reader's own Anthropic API key, which /api/claude takes in the
 *     request body and forwards in an x-api-key header. That route's session
 *     check runs *outside* its try/catch, so a throw there is reported with
 *     request context attached rather than turned into a 500 by the route.
 *
 * The key is matched two ways, because either can be the one that fires: by
 * field name, which covers the body field and the outbound header, and by the
 * sk-ant- shape, which covers it anywhere else — quoted in a message, logged
 * as part of a serialized request, or under a field name nobody thought of.
 */
const BOT_TOKEN_IN_URL = /\/bot\d+:[A-Za-z0-9_-]+/g;
const BYPASS_IN_QUERY = /([?&]x-vercel-protection-bypass=)[^&\s]+/gi;
// Every Anthropic key carries this prefix, admin keys (sk-ant-admin…) included.
const ANTHROPIC_KEY = /sk-ant-[A-Za-z0-9_-]+/g;

/** Header and field names whose value is a credential whatever its shape. */
const SECRET_KEYS = /^(x-telegram-bot-api-secret-token|x-vercel-protection-bypass|authorization|cookie|apikey|x-api-key)$/i;

export const REDACTED = "[REDACTED]";

export function redactString(value) {
  if (typeof value !== "string") return value;
  return value
    .replace(BOT_TOKEN_IN_URL, "/bot[REDACTED]")
    .replace(BYPASS_IN_QUERY, `$1${REDACTED}`)
    .replace(ANTHROPIC_KEY, `sk-ant-${REDACTED}`);
}

/**
 * Walks an event in place — Sentry events are plain JSON, and mutating rather
 * than rebuilding keeps object identity intact for the SDK. Keys are checked
 * before values so array-valued headers are covered too.
 */
export function redactDeep(value, depth = 0) {
  if (depth > 8 || !value || typeof value !== "object") return value;
  for (const [key, child] of Object.entries(value)) {
    if (SECRET_KEYS.test(key)) value[key] = REDACTED;
    else if (typeof child === "string") value[key] = redactString(child);
    else redactDeep(child, depth + 1);
  }
  return value;
}
