/**
 * The MCP bearer tokens. Two properties matter here and neither is visible
 * from the outside: the plaintext never reaches the database, and a revoked
 * token resolves to nobody rather than being read and then rejected.
 */
import { describe, it, expect } from "vitest";
import { fakeSql } from "@/lib/__tests__/helpers/fakeSql.js";
import {
  bearerFrom,
  createToken,
  generateToken,
  hashToken,
  isWellFormedToken,
  listTokens,
  MAX_LIVE_TOKENS,
  resolveToken,
  revokeToken,
} from "../tokens.js";

describe("generateToken", () => {
  it("carries a prefix so a leaked token is recognisable and greppable", () => {
    expect(generateToken().startsWith("luku_mcp_")).toBe(true);
  });

  it("does not repeat", () => {
    const seen = new Set(Array.from({ length: 50 }, generateToken));

    expect(seen.size).toBe(50);
  });

  it("uses only characters that survive a header and a JSON config file", () => {
    expect(generateToken()).toMatch(/^luku_mcp_[A-Za-z0-9_-]+$/);
  });
});

describe("isWellFormedToken", () => {
  it("accepts a freshly generated token", () => {
    expect(isWellFormedToken(generateToken())).toBe(true);
  });

  it.each([
    ["the prefix alone", "luku_mcp_"],
    ["a token with no prefix", "abcdefghijklmnop"],
    ["a different prefix", "luku_api_abcdef"],
    ["a token with a space", "luku_mcp_abc def"],
    ["a non-string", 12345],
    ["nothing", ""],
  ])("rejects %s", (_name, value) => {
    expect(isWellFormedToken(value)).toBe(false);
  });

  it("rejects something far too long to be one of ours", () => {
    expect(isWellFormedToken("luku_mcp_" + "a".repeat(200))).toBe(false);
  });
});

describe("bearerFrom", () => {
  it("reads the token out of the header", () => {
    expect(bearerFrom("Bearer luku_mcp_abc")).toBe("luku_mcp_abc");
  });

  it("accepts the scheme in any case, which RFC 7235 makes case-insensitive", () => {
    expect(bearerFrom("bearer luku_mcp_abc")).toBe("luku_mcp_abc");
    expect(bearerFrom("BEARER luku_mcp_abc")).toBe("luku_mcp_abc");
  });

  it.each([
    ["a missing header", null],
    ["another scheme", "Basic dXNlcjpwYXNz"],
    ["the scheme alone", "Bearer"],
    ["an empty string", ""],
  ])("returns null for %s", (_name, value) => {
    expect(bearerFrom(value)).toBeNull();
  });
});

describe("createToken", () => {
  it("stores the hash and never the token itself", async () => {
    const sql = fakeSql([[{ id: "abcdef12", label: "Laptop" }]]);
    const { token } = await createToken(sql, "u1", "Laptop");

    const values = sql.calls[0].values;
    expect(values).toContain(hashToken(token));
    expect(values).not.toContain(token);
    // Belt and braces: the token must not appear anywhere in the statement.
    expect(JSON.stringify(sql.calls[0])).not.toContain(token);
  });

  it("returns a token that hashes to what was stored", async () => {
    const sql = fakeSql([[{ id: "abcdef12" }]]);
    const { token } = await createToken(sql, "u1", null);

    expect(sql.calls[0].values[0]).toBe(hashToken(token));
  });

  it("scopes the row to the signed-in user", async () => {
    const sql = fakeSql([[{ id: "abcdef12" }]]);
    await createToken(sql, "u1", "Laptop");

    expect(sql.calls[0].values).toContain("u1");
  });

  it("stores no label rather than an empty one", async () => {
    const sql = fakeSql([[{ id: "abcdef12" }]]);
    await createToken(sql, "u1", "");

    expect(sql.calls[0].values[2]).toBeNull();
  });
});

describe("the live-token cap", () => {
  it("checks the cap in the statement that inserts, so no transaction is needed", async () => {
    const sql = fakeSql([[{ id: "abcdef12" }]]);
    await createToken(sql, "u1", "Laptop");

    expect(sql.calls).toHaveLength(1);
    expect(sql.calls[0].text).toContain("revoked_at IS NULL");
    expect(sql.calls[0].values).toContain(MAX_LIVE_TOKENS);
  });

  it("returns no row when the account is already at the cap", async () => {
    // The INSERT ... SELECT ... WHERE matches nothing, so there is no row to
    // report and the route answers 409.
    const sql = fakeSql([[]]);
    const { token, row } = await createToken(sql, "u1", "Laptop");

    expect(row).toBeNull();
    expect(token).toMatch(/^luku_mcp_/);
  });

  it("hands back the short id, so the panel can match the token to its row", async () => {
    const sql = fakeSql([[{ id: "abcdef12", label: "Laptop" }]]);
    const { row } = await createToken(sql, "u1", "Laptop");

    expect(row.id).toBe("abcdef12");
  });

  it("never returns the full hash from a mint", async () => {
    const sql = fakeSql([[{ id: "abcdef12" }]]);
    await createToken(sql, "u1", "Laptop");

    expect(sql.calls[0].text).toContain("left(token_hash, 8)");
  });
});

describe("resolveToken", () => {
  it("returns the owner of a live token", async () => {
    const sql = fakeSql([[{ user_id: "u1", token_hash: "h" }]]);

    expect(await resolveToken(sql, generateToken())).toEqual({ user_id: "u1", token_hash: "h" });
  });

  it("looks the token up by hash, not by value", async () => {
    const sql = fakeSql([[{ user_id: "u1" }]]);
    const token = generateToken();
    await resolveToken(sql, token);

    expect(sql.calls[0].values).toEqual([hashToken(token)]);
  });

  it("excludes revoked tokens in the same statement that touches last_used_at", async () => {
    const sql = fakeSql([[{ user_id: "u1" }]]);
    await resolveToken(sql, generateToken());

    // One statement is what makes this safe without transactions: a revoked
    // token matches nothing rather than being read and then rejected.
    expect(sql.calls).toHaveLength(1);
    expect(sql.calls[0].text).toContain("revoked_at IS NULL");
    expect(sql.calls[0].text).toContain("last_used_at = NOW()");
  });

  it("returns null when the hash matches nothing, which is also the revoked case", async () => {
    const sql = fakeSql([[]]);

    expect(await resolveToken(sql, generateToken())).toBeNull();
  });

  it("issues no query at all for a malformed token", async () => {
    const sql = fakeSql();

    expect(await resolveToken(sql, "not-a-luku-token")).toBeNull();
    expect(sql.calls).toHaveLength(0);
  });
});

describe("listTokens", () => {
  it("scopes the list to the user and leaves out revoked rows", async () => {
    const sql = fakeSql([[]]);
    await listTokens(sql, "u1");

    expect(sql.calls[0].values).toEqual(["u1"]);
    expect(sql.calls[0].text).toContain("revoked_at IS NULL");
  });

  it("never selects the full hash, so the browser cannot be handed one", async () => {
    const sql = fakeSql([[]]);
    await listTokens(sql, "u1");

    expect(sql.calls[0].text).toContain("left(token_hash, 8)");
    expect(sql.calls[0].text).not.toMatch(/SELECT[^;]*\btoken_hash\b(?!\s*,\s*8)/);
  });
});

describe("revokeToken", () => {
  it("revokes the user's own token by its short id", async () => {
    const sql = fakeSql([[{ token_hash: "abcdef12..." }]]);

    expect(await revokeToken(sql, "u1", "abcdef12")).toBe(true);
    expect(sql.calls[0].values).toEqual(["u1", "abcdef12"]);
  });

  it("reports nothing revoked when the id is not this user's", async () => {
    const sql = fakeSql([[]]);

    expect(await revokeToken(sql, "u1", "abcdef12")).toBe(false);
  });

  it("issues no query for an id that is not eight hex characters", async () => {
    const sql = fakeSql();

    expect(await revokeToken(sql, "u1", "../../etc")).toBe(false);
    expect(await revokeToken(sql, "u1", "ABCDEF12")).toBe(false);
    expect(await revokeToken(sql, "u1", "abc")).toBe(false);
    expect(sql.calls).toHaveLength(0);
  });

  it("does not re-revoke, so a second call reports nothing done", async () => {
    const sql = fakeSql([[]]);
    await revokeToken(sql, "u1", "abcdef12");

    expect(sql.calls[0].text).toContain("revoked_at IS NULL");
  });
});
