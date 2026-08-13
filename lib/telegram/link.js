/**
 * Account linking between Luku and Telegram.
 *
 * The binding is created by a one-time code: the web app mints it for a
 * signed-in user, the user carries it to the bot in a t.me deep link, and the
 * bot claims it. Only the code's hash is ever stored.
 */
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

/** How long a freshly minted link code stays claimable. */
export const CODE_TTL_MINUTES = 10;

export function sha256(value) {
  return createHash("sha256").update(String(value)).digest("hex");
}

const HEX = /^[0-9a-f]+$/i;

/**
 * Compares two hex digests without leaking their contents through timing.
 * Both sides must be well-formed hex: Buffer.from() silently drops invalid
 * characters, which would otherwise make two pieces of garbage compare equal.
 */
export function timingSafeEqualHex(a, b) {
  if (typeof a !== "string" || typeof b !== "string") return false;
  if (a.length !== b.length || a.length === 0) return false;
  if (!HEX.test(a) || !HEX.test(b)) return false;
  return timingSafeEqual(Buffer.from(a, "hex"), Buffer.from(b, "hex"));
}

/**
 * Telegram allows only [A-Za-z0-9_-] in a `start` payload, max 64 chars.
 * base64url uses exactly that alphabet and Node emits it unpadded, so 32
 * random bytes land at 43 valid characters.
 */
export function generateCode() {
  return randomBytes(32).toString("base64url");
}

export function isWellFormedCode(code) {
  return typeof code === "string" && code.length > 0 && code.length <= 64 && /^[A-Za-z0-9_-]+$/.test(code);
}

/**
 * Mints a code for a user, invalidating any earlier unused one so a stale
 * deep link can't be redeemed later.
 * Returns the plaintext code — the only place it exists outside the URL.
 */
export async function createLinkCode(sql, userId) {
  const code = generateCode();
  await sql`DELETE FROM telegram_link_codes WHERE user_id = ${userId} AND used_at IS NULL`;
  await sql`
    INSERT INTO telegram_link_codes (code_hash, user_id, expires_at)
    VALUES (${sha256(code)}, ${userId}, NOW() + (${CODE_TTL_MINUTES} || ' minutes')::interval)
  `;
  return code;
}

/**
 * Claims a code, returning its user_id, or null when it is unknown, expired
 * or already spent. A single statement, because Neon's HTTP driver has no
 * transactions and a read-then-write would race.
 */
export async function consumeLinkCode(sql, code) {
  if (!isWellFormedCode(code)) return null;
  const rows = await sql`
    UPDATE telegram_link_codes SET used_at = NOW()
    WHERE code_hash = ${sha256(code)} AND used_at IS NULL AND expires_at > NOW()
    RETURNING user_id
  `;
  return rows[0]?.user_id ?? null;
}

export async function getLinkByTelegramId(sql, telegramUserId) {
  const rows = await sql`
    SELECT * FROM telegram_links WHERE telegram_user_id = ${telegramUserId}
  `;
  return rows[0] ?? null;
}

export async function getLinkByUserId(sql, userId) {
  const rows = await sql`SELECT * FROM telegram_links WHERE user_id = ${userId}`;
  return rows[0] ?? null;
}

/**
 * Creates or refreshes the binding. Re-linking the same Telegram account
 * updates it in place; the unique index on user_id makes binding a Luku
 * account that is already linked elsewhere throw, which the caller reports.
 */
export async function createLink(sql, { telegramUserId, userId, chatId, username }) {
  const rows = await sql`
    INSERT INTO telegram_links (telegram_user_id, user_id, chat_id, username, secret_hash, last_seen_at)
    VALUES (${telegramUserId}, ${userId}, ${chatId}, ${username ?? null}, ${sha256(generateCode())}, NOW())
    ON CONFLICT (telegram_user_id) DO UPDATE
      SET user_id = EXCLUDED.user_id,
          chat_id = EXCLUDED.chat_id,
          username = EXCLUDED.username,
          last_seen_at = NOW()
    RETURNING *
  `;
  return rows[0] ?? null;
}

export async function deleteLinkByTelegramId(sql, telegramUserId) {
  const rows = await sql`
    DELETE FROM telegram_links WHERE telegram_user_id = ${telegramUserId} RETURNING telegram_user_id
  `;
  return rows.length > 0;
}

export async function deleteLinkByUserId(sql, userId) {
  const rows = await sql`
    DELETE FROM telegram_links WHERE user_id = ${userId} RETURNING telegram_user_id
  `;
  return rows.length > 0;
}

export async function updateLinkSettings(sql, telegramUserId, { remindersEnabled, reminderHour, timezone }) {
  const rows = await sql`
    UPDATE telegram_links SET
      reminders_enabled = COALESCE(${remindersEnabled ?? null}, reminders_enabled),
      reminder_hour     = COALESCE(${reminderHour ?? null}, reminder_hour),
      timezone          = COALESCE(${timezone ?? null}, timezone)
    WHERE telegram_user_id = ${telegramUserId}
    RETURNING *
  `;
  return rows[0] ?? null;
}

export async function touchLink(sql, telegramUserId) {
  await sql`UPDATE telegram_links SET last_seen_at = NOW() WHERE telegram_user_id = ${telegramUserId}`;
}

export function isValidReminderHour(hour) {
  return Number.isInteger(hour) && hour >= 0 && hour <= 23;
}

export function isValidTimezone(tz) {
  if (typeof tz !== "string" || !tz) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}
