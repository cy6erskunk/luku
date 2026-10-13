/**
 * The browser half of the MCP credential: the route where a token inherits the
 * identity Neon Auth established. Every case is about that inheritance holding
 * — a signed-out caller mints nothing, and a token's row carries the session's
 * user rather than anything the request said.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { fakeSql } from "@/lib/__tests__/helpers/fakeSql.js";

const mocks = vi.hoisted(() => ({ session: null, sql: null }));

vi.mock("@/lib/auth/server", () => ({
  getAuth: () => ({ getSession: () => Promise.resolve({ data: mocks.session }) }),
}));
vi.mock("@/lib/db", () => ({ getDb: () => mocks.sql }));

const { GET, POST, DELETE } = await import("../route.js");

const postRequest = (body) => ({ json: () => (body === undefined ? Promise.reject(new Error("no body")) : Promise.resolve(body)) });
const deleteRequest = (id) =>
  ({ url: `https://luku.test/api/mcp/tokens${id === undefined ? "" : `?id=${encodeURIComponent(id)}`}` });

beforeEach(() => {
  mocks.session = { user: { id: "u1" } };
  mocks.sql = fakeSql();
});

describe("GET /api/mcp/tokens", () => {
  it("returns 401 when signed out, without querying", async () => {
    mocks.session = null;
    const res = await GET();

    expect(res.status).toBe(401);
    expect(mocks.sql.calls).toHaveLength(0);
  });

  it("lists the signed-in user's live connections", async () => {
    mocks.sql = fakeSql([[{ id: "abcdef12", label: "Laptop", created_at: "x", last_used_at: null }]]);
    const res = await GET();

    expect((await res.json()).tokens).toHaveLength(1);
    expect(mocks.sql.calls[0].values).toEqual(["u1"]);
  });

  it("never hands the browser a full token hash", async () => {
    mocks.sql = fakeSql([[{ id: "abcdef12", label: "Laptop" }]]);
    const res = await GET();

    const body = JSON.stringify(await res.json());
    expect(body).not.toContain("token_hash");
  });
});

describe("POST /api/mcp/tokens", () => {
  it("returns 401 when signed out, without minting anything", async () => {
    mocks.session = null;
    const res = await POST(postRequest({}));

    expect(res.status).toBe(401);
    expect(mocks.sql.calls).toHaveLength(0);
  });

  it("returns a plaintext token and stores only its hash", async () => {
    mocks.sql = fakeSql([[{ id: "abcdef12" }]]);
    const res = await POST(postRequest({ label: "Laptop" }));

    const { token } = await res.json();
    expect(token).toMatch(/^luku_mcp_/);
    // The response is the only place the plaintext exists; the statement that
    // stored it must not carry it.
    expect(JSON.stringify(mocks.sql.calls[0])).not.toContain(token);
  });

  it("writes the session's user, so a body naming someone else changes nothing", async () => {
    mocks.sql = fakeSql([[{ id: "abcdef12" }]]);
    await POST(postRequest({ label: "Laptop", user_id: "someone-else" }));

    expect(mocks.sql.calls[0].values).toContain("u1");
    expect(JSON.stringify(mocks.sql.calls[0].values)).not.toContain("someone-else");
  });

  it("mints without a body, since a mint needs no arguments", async () => {
    mocks.sql = fakeSql([[{ id: "abcdef12" }]]);
    const res = await POST(postRequest(undefined));

    expect(res.status).toBe(200);
    expect((await res.json()).token).toMatch(/^luku_mcp_/);
  });

  it("returns the token's short id so the panel can match it to a row", async () => {
    mocks.sql = fakeSql([[{ id: "abcdef12" }]]);
    const res = await POST(postRequest({}));

    expect((await res.json()).id).toBe("abcdef12");
  });

  it("answers 409 when the account is already at the cap", async () => {
    // The capped INSERT matched nothing, so there is no token to report.
    mocks.sql = fakeSql([[]]);
    const res = await POST(postRequest({}));

    expect(res.status).toBe(409);
    expect((await res.json()).token).toBeUndefined();
  });

  it("refuses an over-long label before writing", async () => {
    const res = await POST(postRequest({ label: "x".repeat(61) }));

    expect(res.status).toBe(400);
    expect(mocks.sql.calls).toHaveLength(0);
  });

  it("refuses a label that is not a string", async () => {
    const res = await POST(postRequest({ label: { name: "Laptop" } }));

    expect(res.status).toBe(400);
    expect(mocks.sql.calls).toHaveLength(0);
  });
});

describe("DELETE /api/mcp/tokens", () => {
  it("returns 401 when signed out, without revoking", async () => {
    mocks.session = null;
    const res = await DELETE(deleteRequest("abcdef12"));

    expect(res.status).toBe(401);
    expect(mocks.sql.calls).toHaveLength(0);
  });

  it("revokes the user's own token", async () => {
    mocks.sql = fakeSql([[{ token_hash: "abcdef12..." }]]);
    const res = await DELETE(deleteRequest("abcdef12"));

    expect(res.status).toBe(200);
    expect(mocks.sql.calls[0].values).toEqual(["u1", "abcdef12"]);
  });

  it("returns 404 for an id that is not this user's, rather than revoking it", async () => {
    mocks.sql = fakeSql([[]]);
    const res = await DELETE(deleteRequest("abcdef12"));

    expect(res.status).toBe(404);
  });

  it("returns 400 when no id is given", async () => {
    const res = await DELETE(deleteRequest());

    expect(res.status).toBe(400);
    expect(mocks.sql.calls).toHaveLength(0);
  });

  it("returns 404 for a malformed id without issuing a query", async () => {
    const res = await DELETE(deleteRequest("../../etc/passwd"));

    expect(res.status).toBe(404);
    expect(mocks.sql.calls).toHaveLength(0);
  });
});
