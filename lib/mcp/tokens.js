/**
 * Bearer tokens for the MCP server.
 *
 * An MCP client is not a browser: it reaches /api/mcp as a plain HTTP client
 * with no access to the Neon Auth cookie, so getSession() sees nothing there
 * and a credential has to travel in the Authorization header instead.
 *
 * The identity still comes from the web app's own sign-in. A token is minted
 * by a session-authenticated request (app/api/mcp/tokens/route.js), and the
 * user_id frozen into the row is the one getSession() reported at that moment.
 * Nothing downstream accepts a user id from a caller.
 *
 * Only the hash is stored. The daily pg_dump to Backblaze keeps seven days of
 * backups, so a plaintext token in this table would be a live credential for
 * the whole retention window — the same reasoning that hashes Telegram link
 * codes. Unlike those, these do not expire: they are revoked, which is what
 * the UI offers.
 *
 * node:crypto is used directly rather than importing sha256 from
 * lib/telegram/link.js. Reaching into the bot's module for a one-line helper
 * couples two unrelated features; a third consumer would earn a lib/crypto.js.
 */
import { createHash, randomBytes } from "node:crypto";

/**
 * The prefix is not decoration: it makes a leaked token greppable, and lets
 * GitHub's secret scanning and a human reading a config file recognise what
 * they are looking at. 32 bytes of base64url land at 43 characters.
 */
const PREFIX = "luku_mcp_";

export function generateToken() {
  return PREFIX + randomBytes(32).toString("base64url");
}

export function hashToken(token) {
  return createHash("sha256").update(String(token)).digest("hex");
}

/**
 * Cheap shape check before the database is touched, so a header full of
 * rubbish costs no query. Deliberately not a security boundary — the lookup
 * below is.
 */
export function isWellFormedToken(token) {
  return typeof token === "string"
    && token.startsWith(PREFIX)
    && token.length > PREFIX.length
    && token.length <= 128
    && /^[A-Za-z0-9_-]+$/.test(token.slice(PREFIX.length));
}

/**
 * Pulls the token out of an Authorization header.
 *
 * The scheme is matched case-insensitively because RFC 7235 says it is
 * case-insensitive, and clients differ on how they spell it.
 */
export function bearerFrom(header) {
  if (typeof header !== "string") return null;
  const match = /^Bearer[ \t]+(\S+)$/i.exec(header.trim());
  return match ? match[1] : null;
}

/** Labels only ever go back to the person who typed them, but a column is not
 *  a place to put an essay either. */
export const MAX_LABEL = 60;

export async function createToken(sql, userId, label) {
  const token = generateToken();
  const rows = await sql`
    INSERT INTO mcp_tokens (token_hash, user_id, label)
    VALUES (${hashToken(token)}, ${userId}, ${label || null})
    RETURNING token_hash, label, created_at, last_used_at
  `;
  // The only moment the plaintext exists outside the client's config.
  return { token, row: rows[0] ?? null };
}

/**
 * The user a token belongs to, or null.
 *
 * One statement, which is what makes it safe without transactions: the
 * last_used_at touch and the revoked check cannot come apart, and a revoked
 * token matches nothing rather than being read and then rejected. The lookup
 * is a primary-key hit on the hash, so there is no secret comparison here to
 * make constant-time — the value matched is already a digest.
 */
export async function resolveToken(sql, token) {
  if (!isWellFormedToken(token)) return null;
  const rows = await sql`
    UPDATE mcp_tokens SET last_used_at = NOW()
    WHERE token_hash = ${hashToken(token)} AND revoked_at IS NULL
    RETURNING user_id, token_hash
  `;
  return rows[0] ?? null;
}

/** Never returns token_hash — the panel lists tokens, it does not re-show them. */
export async function listTokens(sql, userId) {
  return sql`
    SELECT label, created_at, last_used_at, left(token_hash, 8) AS id
    FROM mcp_tokens
    WHERE user_id = ${userId} AND revoked_at IS NULL
    ORDER BY created_at DESC
  `;
}

/**
 * Revokes by the short id listTokens hands out, scoped to the owner.
 *
 * The full hash is never given to the browser, so the panel cannot ask by it.
 * Eight hex characters of a sha256 could in principle collide, so the write is
 * bounded: a collision would revoke one of the user's own tokens, not somebody
 * else's, and the panel shows what is left.
 */
export async function revokeToken(sql, userId, id) {
  if (typeof id !== "string" || !/^[0-9a-f]{8}$/.test(id)) return false;
  const rows = await sql`
    UPDATE mcp_tokens SET revoked_at = NOW()
    WHERE user_id = ${userId} AND revoked_at IS NULL AND left(token_hash, 8) = ${id}
    RETURNING token_hash
  `;
  return rows.length > 0;
}
