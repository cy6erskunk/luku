/**
 * The discovery document an MCP client reads after its first 401.
 *
 * Runs the real @neon/oauth verifier — building the document needs no
 * network — because the resource it names and the authorization server it
 * points at are exactly what must agree with the challenge and with what Neon
 * has registered. The /.well-known rewrite onto this route is next.config.mjs's
 * and is checked against a running build, not here.
 */
import { describe, it, expect, vi, afterAll } from "vitest";

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
});
