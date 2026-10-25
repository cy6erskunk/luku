/**
 * The MCP endpoint.
 *
 * This is the one route that does not start with getAuth().getSession(). An
 * MCP client is not a browser and carries no Neon Auth cookie, so a session
 * lookup here would fail for every legitimate caller. The bearer token in the
 * Authorization header is the only authentication step — which is what makes
 * the user_id it resolves to trustworthy downstream, exactly as the Telegram
 * webhook's secret is what makes `from.id` trustworthy there.
 *
 * The identity is still the web app's either way: a panel token was minted by
 * a session-authenticated request and the user_id was frozen into its row
 * then, and an OAuth access token's `sub` is the user Neon Auth signed in.
 * Nothing below reads a user id from the request body, and no tool accepts one.
 *
 * Keeping that in one call is deliberate. An OAuth access token from Neon
 * Auth resolves through the same seam (lib/mcp/authenticate.js), so neither
 * lib/mcp/protocol.js nor lib/mcp/tools.js knows which credential it was.
 */
import * as Sentry from "@sentry/nextjs";
import { getDb } from "@/lib/db";
import { authenticate } from "@/lib/mcp/authenticate";
import { challenge } from "@/lib/mcp/oauth";
import { INTERNAL_ERROR, INVALID_REQUEST, PARSE_ERROR, handleMessage, rpcError } from "@/lib/mcp/protocol";
import { toolsFor } from "@/lib/mcp/tools";


/**
 * There is no server-to-client stream to open: no sessions, no server-initiated
 * requests, nothing to push. Saying so with 405 and Allow is what stops a
 * client waiting on an SSE channel that will never carry anything.
 */
export function GET() {
  return new Response("Method Not Allowed", { status: 405, headers: { Allow: "POST" } });
}

/**
 * 401s carry the challenge, so a client can tell "wrong credential" from
 * "wrong URL" without guessing — and, with OAuth on, where to sign in.
 *
 * Built only on the 401 path, and a malformed MCP_OAUTH_RESOURCE falls back to
 * the plain challenge here: OAuth is optional, and a broken setting for it
 * must not take panel tokens down with it. Sentry hears about it every time,
 * which is the point — it is a deployment to fix, not a request to retry.
 */
function wwwAuthenticate() {
  try {
    return challenge();
  } catch (e) {
    Sentry.captureException(e);
    return 'Bearer realm="luku"';
  }
}

export async function POST(request) {
  let sql;
  let authenticated;
  try {
    sql = getDb();
    // One auth call. A missing header and an unknown token answer identically:
    // the difference is not something an unauthenticated caller should learn.
    authenticated = await authenticate(sql, request.headers.get("authorization"));
  } catch (e) {
    // The auth step needs the same guard as the tool call below, and for a
    // likelier reason: a deployment whose database has not had db/schema.sql
    // re-run has no mcp_tokens table, so this throws on *every* request —
    // `initialize` included — and the client would get Next's HTML 500 page
    // before it ever reached a tool. That is the one failure a new deployment
    // is most likely to hit, so it has to arrive as readable JSON.
    Sentry.captureException(e);
    return Response.json(rpcError(null, INTERNAL_ERROR, "Internal error"));
  }

  if (!authenticated) {
    return Response.json({ error: "Unauthorized" }, { status: 401, headers: { "WWW-Authenticate": wwwAuthenticate() } });
  }

  let message;
  try {
    message = await request.json();
  } catch {
    return Response.json(rpcError(null, PARSE_ERROR, "Invalid JSON"));
  }

  // Batches are a client capability this server does not claim, and answering
  // half of one is worse than refusing it.
  if (Array.isArray(message)) {
    return Response.json(rpcError(null, INVALID_REQUEST, "Batched requests are not supported"));
  }

  let response;
  try {
    response = await handleMessage(message, toolsFor(sql, authenticated.user_id));
  } catch (e) {
    // A query that threw — a half-applied schema is the usual cause — would
    // otherwise surface as Next's 500 HTML page, which an MCP client cannot
    // read at all. The cause goes to Sentry, as it does in the webhook; the
    // client gets something it can parse and report.
    Sentry.captureException(e);
    return Response.json(rpcError(message?.id, INTERNAL_ERROR, "Internal error"));
  }

  // A notification gets no body. 202 rather than 204 because the request was
  // accepted and acted on, and a strict client treats a body here as an error.
  if (response === null) return new Response(null, { status: 202 });

  return Response.json(response);
}
