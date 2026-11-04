/**
 * The discovery document an MCP client reads after its first 401.
 *
 * Runs the real @neon/oauth verifier — building the document needs no
 * network — because the resource it names and the authorization server it
 * points at are exactly what must agree with the challenge and with what Neon
 * has registered. The /.well-known rewrite onto this route is next.config.mjs's;
 * it is checked here by matching its rules with Next's own path matcher, since
 * CI never runs a build that would serve it.
 */
import { describe, it, expect, vi, afterAll } from "vitest";
import { getPathMatch } from "next/dist/shared/lib/router/utils/path-match.js";
import nextConfig from "../../../../../next.config.mjs";

/** Where next.config.mjs's rewrites send a request for `pathname`, or null. */
async function rewriteOf(pathname) {
  const rules = await nextConfig.rewrites();
  const list = Array.isArray(rules) ? rules : [...(rules.beforeFiles ?? []), ...(rules.afterFiles ?? []), ...(rules.fallback ?? [])];
  const rule = list.find((r) => !r.has && getPathMatch(r.source)(pathname));
  return rule?.destination ?? null;
}

vi.mock("@/lib/auth/server", () => ({ authBaseUrl: () => "https://auth.test/neondb/auth" }));

const previous = process.env.MCP_OAUTH_RESOURCE;
afterAll(() => {
  if (previous === undefined) delete process.env.MCP_OAUTH_RESOURCE;
  else process.env.MCP_OAUTH_RESOURCE = previous;
});

/** The verifier is cached per module, so each case loads afresh under its own
 *  environment. */
async function load(resource) {
  if (resource) process.env.MCP_OAUTH_RESOURCE = resource;
  else delete process.env.MCP_OAUTH_RESOURCE;
  vi.resetModules();
  return {
    route: await import("../route.js"),
    oauth: await import("@/lib/mcp/oauth"),
  };
}

describe("protected-resource metadata", () => {
  it("is not found while OAuth is not configured", async () => {
    const { route } = await load(null);

    expect(route.GET().status).toBe(404);
  });

  it("names Neon Auth as the authorization server for the MCP endpoint", async () => {
    const { route } = await load("https://luku.test/api/mcp");
    const res = route.GET();
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.resource).toBe("https://luku.test/api/mcp");
    expect(body.authorization_servers).toEqual(["https://auth.test/neondb/auth"]);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
  });

  it("is published where the rewrite serves it", async () => {
    // The challenge sends clients to resourceMetadataUrl; next.config.mjs
    // rewrites /.well-known/oauth-protected-resource/* here. If @neon/oauth
    // ever computes the URL differently, a client follows the challenge into
    // a 404.
    const { oauth } = await load("https://luku.test/api/mcp");

    expect(new URL(oauth.getMcpAuth().resourceMetadataUrl).pathname)
      .toBe("/.well-known/oauth-protected-resource/api/mcp");
  });

  it("is reached through the rewrite from the URL the challenge names", async () => {
    // Without the rewrite, every OAuth client on a deployment that opted in
    // would hit a 404 at discovery and could not connect.
    const { oauth } = await load("https://luku.test/api/mcp");
    const named = new URL(oauth.getMcpAuth().resourceMetadataUrl).pathname;

    expect(await rewriteOf(named)).toBe("/api/mcp/metadata");
  });

  it("is reached through the rewrite from the bare URL older clients try", async () => {
    expect(await rewriteOf("/.well-known/oauth-protected-resource")).toBe("/api/mcp/metadata");
  });

  it("takes over no other /.well-known path", async () => {
    expect(await rewriteOf("/.well-known/oauth-authorization-server")).toBeNull();
  });
});
