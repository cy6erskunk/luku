/**
 * RFC 9728 protected-resource metadata for the MCP endpoint, served at
 * /.well-known/oauth-protected-resource[/api/mcp] by a rewrite in
 * next.config.mjs.
 *
 * What an MCP client fetches after the 401 from /api/mcp names that URL: it
 * says which authorization server issues tokens for the resource (Neon Auth),
 * and from there the client discovers everything else.
 *
 * The document comes from the same verifier the route checks tokens with, so
 * the resource it names is the audience tokens are checked against. It is
 * built here rather than by @neon/oauth's own handler, which matches on the
 * request path and would see the rewritten one.
 *
 * Unauthenticated by design — it is public metadata, and browser-based
 * clients fetch it cross-origin, hence the CORS headers. 404 while OAuth is
 * not configured, so a client falls back to asking for a header instead of
 * being sent to an authorization server with no resource registered for us.
 */
import { getMcpAuth } from "@/lib/mcp/oauth";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "*",
};

export function GET() {
  const auth = getMcpAuth();
  if (!auth) return new Response("Not Found", { status: 404 });
  return Response.json(auth.protectedResourceMetadata(), {
    headers: { ...CORS, "Cache-Control": "public, max-age=3600" },
  });
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}
