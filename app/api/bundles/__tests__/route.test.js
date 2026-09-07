import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fakeSql } from "@/lib/__tests__/helpers/fakeSql.js";
import { MAX_BUNDLE_NAME } from "@/lib/shared/bundleName.js";

const mocks = vi.hoisted(() => ({ session: null, sql: null }));

vi.mock("@/lib/auth/server", () => ({
  getAuth: () => ({ getSession: () => Promise.resolve({ data: mocks.session }) }),
}));
// Only getDb is faked: withSchemaGuard is the behaviour under test in the
// "schema out of date" cases below, so it has to be the real one.
vi.mock("@/lib/db", async (importOriginal) => ({
  ...(await importOriginal()),
  getDb: () => mocks.sql,
}));

const { GET, POST, DELETE } = await import("../route.js");

const postRequest = (body) => ({ json: () => Promise.resolve(body) });
const deleteRequest = (query) => ({ url: `https://luku.test/api/bundles${query}` });

function undefinedTable() {
  const e = new Error('relation "bundles" does not exist');
  e.code = "42P01";
  return e;
}

beforeEach(() => {
  mocks.session = { user: { id: "u1" } };
  mocks.sql = fakeSql();
});

describe("GET /api/bundles", () => {
  it("returns 401 when signed out", async () => {
    mocks.session = null;
    const res = await GET();
    expect(res.status).toBe(401);
    expect(mocks.sql.calls).toHaveLength(0);
  });

  it("lists this user's bundles", async () => {
    mocks.sql = fakeSql([[{ id: 1, name: "Kotimaa" }]]);
    const res = await GET();
    expect((await res.json()).bundles).toEqual([{ id: 1, name: "Kotimaa" }]);
    expect(mocks.sql.calls[0].values).toEqual(["u1"]);
  });
});

describe("POST /api/bundles", () => {
  it("returns 401 when signed out", async () => {
    mocks.session = null;
    const res = await POST(postRequest({ name: "Kotimaa" }));
    expect(res.status).toBe(401);
    expect(mocks.sql.calls).toHaveLength(0);
  });

  it("creates a bundle under the normalized name", async () => {
    mocks.sql = fakeSql([[{ id: 4, name: "Luku 3" }]]);
    const res = await POST(postRequest({ name: "  Luku   3 " }));
    expect(res.status).toBe(200);
    expect((await res.json()).bundle).toEqual({ id: 4, name: "Luku 3" });
    expect(mocks.sql.calls[0].values).toEqual(["u1", "Luku 3"]);
  });

  it("rejects a name that normalizes to nothing", async () => {
    for (const name of ["", "   ", null, 7]) {
      mocks.sql = fakeSql();
      const res = await POST(postRequest({ name }));
      expect(res.status).toBe(400);
      expect((await res.json()).error).toBe("Invalid name");
      expect(mocks.sql.calls).toHaveLength(0);
    }
  });

  it("rejects a name past the length cap", async () => {
    const res = await POST(postRequest({ name: "x".repeat(MAX_BUNDLE_NAME + 1) }));
    expect(res.status).toBe(400);
    expect(mocks.sql.calls).toHaveLength(0);
  });

  it("answers with the existing bundle rather than a conflict", async () => {
    // The picker asks for "a bundle called X"; getting it is the answer
    // whether or not this call is the one that created it.
    mocks.sql = fakeSql([[{ id: 4, name: "Kotimaa" }]]);
    const res = await POST(postRequest({ name: "kotimaa" }));
    expect(res.status).toBe(200);
    expect((await res.json()).bundle.id).toBe(4);
  });
});

describe("DELETE /api/bundles", () => {
  it("returns 401 when signed out", async () => {
    mocks.session = null;
    const res = await DELETE(deleteRequest("?id=4"));
    expect(res.status).toBe(401);
  });

  it("requires an id", async () => {
    const res = await DELETE(deleteRequest(""));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("Missing id");
  });

  it("rejects an id Postgres would error on", async () => {
    for (const id of ["abc", "0", "-1", "1.5", "2147483648", "4x"]) {
      mocks.sql = fakeSql();
      const res = await DELETE(deleteRequest(`?id=${id}`));
      expect(res.status).toBe(400);
      expect(mocks.sql.calls).toHaveLength(0);
    }
  });

  it("deletes a bundle of this user's", async () => {
    mocks.sql = fakeSql([[{ id: 4 }]]);
    const res = await DELETE(deleteRequest("?id=4"));
    expect(res.status).toBe(200);
    expect(mocks.sql.calls[0].values).toEqual([4, "u1"]);
  });

  it("404s on someone else's bundle", async () => {
    mocks.sql = fakeSql([[]]);
    const res = await DELETE(deleteRequest("?id=4"));
    expect(res.status).toBe(404);
  });
});

describe("a database the migration has not been run against", () => {
  beforeEach(() => vi.spyOn(console, "error").mockImplementation(() => {}));
  afterEach(() => vi.restoreAllMocks());

  it("answers the bundle list with a 503 that names the fix", async () => {
    mocks.sql = fakeSql([undefinedTable()]);
    const res = await GET();
    expect(res.status).toBe(503);
    expect((await res.json()).error).toMatch(/db\/schema\.sql/);
  });

  it("answers a create the same way", async () => {
    mocks.sql = fakeSql([undefinedTable()]);
    const res = await POST(postRequest({ name: "Kotimaa" }));
    expect(res.status).toBe(503);
  });

  it("answers a delete the same way", async () => {
    mocks.sql = fakeSql([undefinedTable()]);
    const res = await DELETE(deleteRequest("?id=4"));
    expect(res.status).toBe(503);
  });

  it("lets an unrelated database failure stay a 500", async () => {
    mocks.sql = fakeSql([new Error("connection reset")]);
    await expect(GET()).rejects.toThrow("connection reset");
  });
});
