/**
 * OAuth access tokens for the MCP server, issued by Neon Auth.
 *
 * Neon Auth can act as an OAuth 2.1 authorization server. A client that
 * supports it (claude.ai's connector dialog, Claude Code) then needs only the
 * URL: it reads the challenge on a 401, finds the authorization server through
 * the protected-resource metadata, sends the reader through our own login and
 * consent pages (app/oauth/), and comes back with a short-lived JWT in place of
 * a luku_mcp_ token pasted by hand.
 *
 * The identity is still the web app's, as it is for the hashed tokens: the
 * token's `sub` is the user id Neon Auth signed in, the same one getSession()
 * reports, and nothing downstream accepts a user id from the caller.
 *
 * Off unless MCP_OAUTH_RESOURCE is set. The plugin is enabled per Neon branch,
 * and the resource has to match the one registered there exactly — it becomes
 * the token's `aud`, and a mismatch rejects every call — so a deployment opts
 * in once both sides agree rather than discovering a half-configured flow.
 */
import { createMcpAuth } from "@neon/oauth/mcp";
import { authBaseUrl } from "@/lib/auth/server";

let _auth;

/** The verifier, or null when OAuth is not configured. Lazy, as getAuth() is:
 *  a missing variable must not fail the build. */
export function getMcpAuth() {
  if (_auth === undefined) {
    const resource = process.env.MCP_OAUTH_RESOURCE;
    _auth = resource ? createMcpAuth({ baseUrl: authBaseUrl(), resource }) : null;
  }
  return _auth;
}

/**
 * Cheap shape check, so a header full of rubbish never reaches discovery or
 * the JWKS fetch. Not a security boundary — the signature check is.
 */
const JWT_SHAPE = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;

/**
 * The user an access token belongs to, or null.
 *
 * Signature, issuer, audience and expiry are all checked by the verifier. An
 * unreachable Neon throws rather than answering null: "the auth server is
 * down" must not look like "your token is wrong", or a client would discard a
 * good token and send the reader through sign-in again.
 */
export async function resolveAccessToken(token) {
  const auth = getMcpAuth();
  if (!auth || typeof token !== "string" || token.length > 4096 || !JWT_SHAPE.test(token)) return null;
  const result = await auth.verifyAccessToken(token);
  return result.ok ? { user_id: result.auth.sub } : null;
}

/** The challenge a 401 carries. With OAuth on, `resource_metadata` is how a
 *  client finds the authorization server (RFC 9728 §5.1). */
export function challenge() {
  const auth = getMcpAuth();
  return auth
    ? `Bearer realm="luku", resource_metadata="${auth.resourceMetadataUrl}"`
    : 'Bearer realm="luku"';
}
