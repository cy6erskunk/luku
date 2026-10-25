/**
 * The MCP route's whole authentication step: an Authorization header in, the
 * caller's user_id out, or null.
 *
 * Two credentials reach it — a luku_mcp_ token minted in the panel
 * (lib/mcp/tokens.js) and an OAuth access token issued by Neon Auth
 * (lib/mcp/oauth.js) — and the prefix tells them apart, so each costs only its
 * own check: a panel token never waits on Neon, and an access token never
 * touches the database. Neither lib/mcp/protocol.js nor lib/mcp/tools.js
 * learns which one it was; they get a userId.
 */
import { bearerFrom, isWellFormedToken, resolveToken } from "./tokens.js";
import { resolveAccessToken } from "./oauth.js";

export async function authenticate(sql, header) {
  const token = bearerFrom(header);
  if (!token) return null;
  return isWellFormedToken(token) ? resolveToken(sql, token) : resolveAccessToken(token);
}
