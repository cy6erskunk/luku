/**
 * The MCP endpoint with OAuth configured (MCP_OAUTH_RESOURCE set).
 *
 * A second credential means a second way in, so every case is about it
 * reaching exactly what a panel token reaches and no more: a verified access
 * token is scoped by its `sub`, anything the verifier rejects reaches no tool,
 * an outage at Neon is not reported as a bad token, and the panel token keeps
 * working without asking Neon anything.
 *
 * The verifier is replaced at the module boundary — what is under test is the
 * route's use of it, not jose's signature check.
 */
import { describe, it, expect, vi, beforeEach, afterAll } from "vitest";
import { fakeSql } from "@/lib/__tests__/helpers/fakeSql.js";
import { generateToken, hashToken } from "@/lib/mcp/tokens";

const RESOURCE = "https://luku.test/api/mcp";
const METADATA_URL = "https://luku.test/.well-known/oauth-protected-resource/api/mcp";
const ACCESS_TOKEN = "eyJhbGciOiJFZERTQSJ9.eyJzdWIiOiJ1LW9hdXRoIn0.c2lnbmF0dXJl";

// The route builds its verifier once and caches it, so the fake delegates to
// whatever `mocks.verify` is now rather than capturing the first one.
const mocks = vi.hoisted(() => ({
  sql: null,
  verify: null,
  // A plain array, not a vi.fn: the one construction happens in whichever
  // test runs first, and call history does not survive to the next.
  created: [],
  createMcpAuth: (options) => {
    mocks.created.push(options);
    return {
      resourceMetadataUrl: "https://luku.test/.well-known/oauth-protected-resource/api/mcp",
      verifyAccessToken: (token) => mocks.verify(token),
    };
  },
}));

vi.mock("@/lib/db", () => ({ getDb: () => mocks.sql }));
vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn() }));
vi.mock("@/lib/auth/server", () => ({ authBaseUrl: () => "https://auth.test/neondb/auth" }));
vi.mock("@neon/oauth/mcp", () => ({
  createMcpAuth: (...args) => mocks.createMcpAuth(...args),
}));

const previous = process.env.MCP_OAUTH_RESOURCE;
process.env.MCP_OAUTH_RESOURCE = RESOURCE;
afterAll(() => {
  if (previous === undefined) delete process.env.MCP_OAUTH_RESOURCE;
  else process.env.MCP_OAUTH_RESOURCE = previous;
});

const { POST } = await import("../route.js");

const rpc = (body, authorization) => ({
  headers: { get: (name) => (name.toLowerCase() === "authorization" ? authorization ?? null : null) },
  json: () => Promise.resolve(body),
});
const listWords = { jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "list_words", arguments: {} } };

beforeEach(() => {
  mocks.sql = fakeSql();
  mocks.verify = vi.fn(async () => ({ ok: true, auth: { sub: "u-oauth", scopes: [] } }));
});

describe("with OAuth configured", () => {
  it("points an unauthenticated client at the protected-resource metadata", async () => {
    const res = await POST(rpc(listWords));

    expect(res.status).toBe(401);
    expect(res.headers.get("WWW-Authenticate")).toBe(`Bearer realm="luku", resource_metadata="${METADATA_URL}"`);
  });

  it("verifies against the configured resource and Neon Auth issuer, building the verifier once", async () => {
    await POST(rpc(listWords, `Bearer ${ACCESS_TOKEN}`));

    expect(mocks.created).toEqual([{ baseUrl: "https://auth.test/neondb/auth", resource: RESOURCE }]);
    expect(mocks.verify).toHaveBeenCalledWith(ACCESS_TOKEN);
  });

  it("scopes tools by the access token's sub, without touching mcp_tokens", async () => {
    const res = await POST(rpc(listWords, `Bearer ${ACCESS_TOKEN}`));

    expect(res.status).toBe(200);
    expect(mocks.sql.calls).toHaveLength(1);
    expect(mocks.sql.calls[0].text).not.toContain("mcp_tokens");
    expect(mocks.sql.calls[0].values).toContain("u-oauth");
  });

  it("returns 401 and reaches no tool when the verifier rejects the token", async () => {
    mocks.verify.mockResolvedValueOnce({ ok: false, reason: "invalid_token", code: "invalid_audience", message: "x" });
    const res = await POST(rpc(listWords, `Bearer ${ACCESS_TOKEN}`));

    expect(res.status).toBe(401);
    expect(mocks.sql.calls).toHaveLength(0);
  });

  it("does not ask Neon about a header that is not even shaped like a JWT", async () => {
    const res = await POST(rpc(listWords, "Bearer nonsense"));

    expect(res.status).toBe(401);
    expect(mocks.verify).not.toHaveBeenCalled();
  });

  it("reports an unreachable Neon as an error, not as a bad token", async () => {
    // A 401 would tell the client to throw away a good token and send the
    // reader through sign-in again.
    mocks.verify.mockRejectedValueOnce(new Error("auth server unavailable"));
    const res = await POST(rpc(listWords, `Bearer ${ACCESS_TOKEN}`));

    expect(res.status).toBe(200);
    expect((await res.json()).error.message).toBe("Internal error");
    expect(mocks.sql.calls).toHaveLength(0);
  });

  it("still accepts a panel token, without asking Neon", async () => {
    const token = generateToken();
    mocks.sql = fakeSql([[{ user_id: "u1", token_hash: hashToken(token) }], []]);
    const res = await POST(rpc(listWords, `Bearer ${token}`));

    expect(res.status).toBe(200);
    expect(mocks.verify).not.toHaveBeenCalled();
    expect(mocks.sql.calls[1].values).toContain("u1");
  });
});
