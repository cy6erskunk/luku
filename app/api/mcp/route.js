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
 * The identity is still the web app's: the token was minted by a
 * session-authenticated request and the user_id was frozen into its row then.
 * Nothing below reads a user id from the request body, and no tool accepts one.
 *
 * Keeping that in one call is deliberate. Should this ever grow an OAuth
 * issuer, an access token resolves through the same seam and neither
 * lib/mcp/protocol.js nor lib/mcp/tools.js changes.
 */
import * as Sentry from "@sentry/nextjs";
import { getDb } from "@/lib/db";
import { bearerFrom, resolveToken } from "@/lib/mcp/tokens";
import { INTERNAL_ERROR, INVALID_REQUEST, PARSE_ERROR, handleMessage, rpcError } from "@/lib/mcp/protocol";
import { toolsFor } from "@/lib/mcp/tools";

/** 401s carry the challenge, so a client can tell "wrong credential" from
 *  "wrong URL" without guessing. */
const UNAUTHORIZED = {
  status: 401,
  headers: { "WWW-Authenticate": 'Bearer realm="luku"' },
};

/**
 * There is no server-to-client stream to open: no sessions, no server-initiated
 * requests, nothing to push. Saying so with 405 and Allow is what stops a
 * client waiting on an SSE channel that will never carry anything.
 */
export function GET() {
  return new Response("Method Not Allowed", { status: 405, headers: { Allow: "POST" } });
}

export async function POST(request) {
  const sql = getDb();

  const token = bearerFrom(request.headers.get("authorization"));
  // One auth call. A missing header and an unknown token answer identically:
  // the difference is not something an unauthenticated caller should learn.
  const authenticated = token ? await resolveToken(sql, token) : null;
  if (!authenticated) {
    return Response.json({ error: "Unauthorized" }, UNAUTHORIZED);
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
