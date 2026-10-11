/**
 * The MCP endpoint — the one route not authenticated by a session.
 *
 * The bearer token is the only authentication step here, so every case below
 * is about that: a caller with no token, a wrong token or a revoked one must
 * reach no tool, and the user_id a tool is scoped by must come from the token
 * row rather than from anything in the request.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { fakeSql } from "@/lib/__tests__/helpers/fakeSql.js";
import { generateToken, hashToken } from "@/lib/mcp/tokens";

const mocks = vi.hoisted(() => ({ sql: null }));

vi.mock("@/lib/db", () => ({ getDb: () => mocks.sql }));
vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn() }));

const Sentry = await import("@sentry/nextjs");

const { GET, POST } = await import("../route.js");

const TOKEN = generateToken();

/** First query is always resolveToken; each further argument is one query's
 *  rows, in order — so a tool reading one row takes `authed([row])`. */
const authed = (...toolRows) => fakeSql([[{ user_id: "u1", token_hash: hashToken(TOKEN) }], ...toolRows]);

const rpc = (body, headers = { authorization: `Bearer ${TOKEN}` }) => ({
  headers: { get: (name) => headers[name.toLowerCase()] ?? null },
  json: () => Promise.resolve(body),
});

const req = (method, params, id = 1) => ({ jsonrpc: "2.0", id, method, ...(params ? { params } : {}) });

beforeEach(() => { mocks.sql = authed(); });

describe("authentication", () => {
  it("returns 401 with a challenge when no token is sent", async () => {
    mocks.sql = fakeSql();
    const res = await POST(rpc(req("tools/list"), {}));

    expect(res.status).toBe(401);
    expect(res.headers.get("WWW-Authenticate")).toContain("Bearer");
  });

  it("issues no query at all for a malformed token", async () => {
    mocks.sql = fakeSql();
    const res = await POST(rpc(req("tools/list"), { authorization: "Bearer nonsense" }));

    expect(res.status).toBe(401);
    expect(mocks.sql.calls).toHaveLength(0);
  });

  it("returns 401 for a well-formed token that matches no live row", async () => {
    // Which is also what a revoked token looks like: resolveToken excludes it
    // in the same statement, so the two are indistinguishable from here.
    mocks.sql = fakeSql([[]]);
    const res = await POST(rpc(req("tools/list")));

    expect(res.status).toBe(401);
  });

  it("reaches no tool when the token is rejected", async () => {
    mocks.sql = fakeSql([[]]);
    await POST(rpc(req("tools/call", { name: "list_words", arguments: {} })));

    // Only the token lookup — nothing went near the words table.
    expect(mocks.sql.calls).toHaveLength(1);
  });

  it("answers a missing token and an unknown one the same way, revealing neither", async () => {
    mocks.sql = fakeSql();
    const missing = await POST(rpc(req("tools/list"), {}));
    mocks.sql = fakeSql([[]]);
    const unknown = await POST(rpc(req("tools/list")));

    expect(await missing.json()).toEqual(await unknown.json());
    expect(missing.status).toBe(unknown.status);
  });

  it("accepts the token and answers the request", async () => {
    const res = await POST(rpc(req("tools/list")));

    expect(res.status).toBe(200);
    expect((await res.json()).result.tools).toHaveLength(3);
  });
});

describe("scoping", () => {
  it("scopes a tool by the token's user, not by anything in the body", async () => {
    mocks.sql = authed([]);
    await POST(rpc(req("tools/call", {
      name: "list_words",
      // A caller naming somebody else must get nowhere: user_id is not an
      // argument any tool accepts, so this is simply ignored.
      arguments: { user_id: "someone-else", userId: "someone-else" },
    })));

    const toolCall = mocks.sql.calls[1];
    expect(toolCall.values).toContain("u1");
    expect(JSON.stringify(toolCall.values)).not.toContain("someone-else");
  });
});

describe("transport", () => {
  it("refuses GET, since there is no server-to-client stream to open", async () => {
    const res = GET();

    expect(res.status).toBe(405);
    expect(res.headers.get("Allow")).toBe("POST");
  });

  it("returns 202 and no body for a notification", async () => {
    const res = await POST(rpc({ jsonrpc: "2.0", method: "notifications/initialized" }));

    expect(res.status).toBe(202);
    expect(await res.text()).toBe("");
  });

  it("reports unreadable JSON as a parse error rather than throwing", async () => {
    const res = await POST({
      headers: { get: () => `Bearer ${TOKEN}` },
      json: () => Promise.reject(new SyntaxError("bad")),
    });

    expect(res.status).toBe(200);
    expect((await res.json()).error.code).toBe(-32700);
  });

  it("refuses a batch rather than answering part of one", async () => {
    const res = await POST(rpc([req("tools/list"), req("ping", null, 2)]));

    expect((await res.json()).error.code).toBe(-32600);
  });

  it("completes the initialize handshake", async () => {
    const res = await POST(rpc(req("initialize", {
      protocolVersion: "2025-06-18",
      capabilities: {},
      clientInfo: { name: "curl", version: "0" },
    })));

    const { result } = await res.json();
    expect(result.serverInfo.name).toBe("luku");
    expect(result.capabilities.tools).toEqual({});
  });
});

describe("tools over the wire", () => {
  it("returns a card's fields as structured content", async () => {
    mocks.sql = authed([{ id: 7, base: "toipua", translations: ["to recover"], pos: "verb" }]);
    const res = await POST(rpc(req("tools/call", { name: "get_word", arguments: { id: 7 } })));

    const { result } = await res.json();
    expect(result.isError).toBe(false);
    expect(result.structuredContent.base).toBe("toipua");
  });

  it("answers a thrown query with a JSON-RPC error a client can parse, not a 500 page", async () => {
    // The half-applied-schema case the README documents: mcp_tokens exists so
    // the caller authenticates, then the words query rejects. Next's 500 HTML
    // would be unreadable to an MCP client.
    mocks.sql = authed(new Error("column does not exist"));
    const res = await POST(rpc(req("tools/call", { name: "list_words", arguments: {} })));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.error.code).toBe(-32603);
    expect(body.id).toBe(1);
  });

  it("reports the cause of a thrown query to Sentry rather than swallowing it", async () => {
    const boom = new Error("column does not exist");
    mocks.sql = authed(boom);
    await POST(rpc(req("tools/call", { name: "list_words", arguments: {} })));

    expect(Sentry.captureException).toHaveBeenCalledWith(boom);
  });

  it("reports a refused update as a tool error, not a transport failure", async () => {
    const res = await POST(rpc(req("tools/call", {
      name: "update_word",
      arguments: { id: 7, pos: "pronoun" },
    })));

    expect(res.status).toBe(200);
    const { result, error } = await res.json();
    expect(error).toBeUndefined();
    expect(result.isError).toBe(true);
  });
});
