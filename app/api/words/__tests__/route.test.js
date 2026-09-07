/**
 * Covers the bundle-aware parts of the words route: the membership that rides
 * along with a save, and the PATCH that edits one afterwards.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fakeSql } from "@/lib/__tests__/helpers/fakeSql.js";

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

const { GET, POST, PATCH } = await import("../route.js");

const request = (body) => ({ json: () => Promise.resolve(body) });

/** What the driver throws on a database the schema file has not been re-run
 *  against: Postgres' undefined_table SQLSTATE on `code`. */
function undefinedTable() {
  const e = new Error('relation "word_bundles" does not exist');
  e.code = "42P01";
  return e;
}
const SAVED = { id: 7, base: "juosta", translations: ["to run"], bundle_ids: [] };

beforeEach(() => {
  mocks.session = { user: { id: "u1" } };
  mocks.sql = fakeSql();
});

describe("GET /api/words", () => {
  it("carries each word's bundle membership", async () => {
    mocks.sql = fakeSql([[{ ...SAVED, bundle_ids: [2, 5] }]]);
    const res = await GET();
    expect((await res.json()).words[0].bundle_ids).toEqual([2, 5]);
    expect(mocks.sql.calls[0].text).toContain("FROM word_bundles WHERE word_id = words.id");
  });
});

describe("POST /api/words with a bundle", () => {
  it("saves without touching word_bundles when no bundle is active", async () => {
    mocks.sql = fakeSql([[SAVED]]);
    const res = await POST(request({ word: "juosta", base: "juosta", translations: ["to run"], pos: "verb" }));
    expect((await res.json()).word).toEqual(SAVED);
    expect(mocks.sql.calls).toHaveLength(1);
  });

  it("attaches the saved word to the active bundle", async () => {
    mocks.sql = fakeSql([[SAVED], [{ bundle_id: 3 }]]);
    const res = await POST(request({ word: "juosta", base: "juosta", translations: ["to run"], pos: "verb", bundleId: 3 }));
    expect((await res.json()).word.bundle_ids).toEqual([3]);
    expect(mocks.sql.calls[1].values).toEqual([7, 3, "u1", "u1"]);
  });

  it("does not claim membership the insert refused", async () => {
    // A bundle that is not this user's: the word is still saved, and the
    // answer says truthfully that it joined nothing.
    mocks.sql = fakeSql([[{ ...SAVED, bundle_ids: [1] }], []]);
    const res = await POST(request({ word: "juosta", base: "juosta", translations: ["to run"], bundleId: 3 }));
    expect((await res.json()).word.bundle_ids).toEqual([1]);
  });

  it("rejects a malformed bundleId before writing anything", async () => {
    for (const bundleId of ["3", 0, -1, 1.5, 2147483648]) {
      mocks.sql = fakeSql();
      const res = await POST(request({ word: "juosta", base: "juosta", translations: [], bundleId }));
      expect(res.status).toBe(400);
      expect((await res.json()).error).toBe("Invalid bundleId");
      expect(mocks.sql.calls).toHaveLength(0);
    }
  });
});

describe("PATCH /api/words", () => {
  it("returns 401 when signed out", async () => {
    mocks.session = null;
    const res = await PATCH(request({ id: 7, bundleId: 3, action: "add" }));
    expect(res.status).toBe(401);
    expect(mocks.sql.calls).toHaveLength(0);
  });

  it("validates the word id, the bundle id and the action", async () => {
    const bad = [
      [{ id: "7", bundleId: 3, action: "add" }, "Invalid id"],
      [{ id: 7, bundleId: 0, action: "add" }, "Invalid bundleId"],
      [{ id: 7, bundleId: 3, action: "move" }, "Invalid action"],
      [{ id: 7, bundleId: 3 }, "Invalid action"],
    ];
    for (const [body, error] of bad) {
      mocks.sql = fakeSql();
      const res = await PATCH(request(body));
      expect(res.status).toBe(400);
      expect((await res.json()).error).toBe(error);
      expect(mocks.sql.calls).toHaveLength(0);
    }
  });

  it("404s on a word that is not this user's, before any membership write", async () => {
    mocks.sql = fakeSql([[]]);
    const res = await PATCH(request({ id: 7, bundleId: 3, action: "add" }));
    expect(res.status).toBe(404);
    expect(mocks.sql.calls).toHaveLength(1);
  });

  it("adds a membership and answers with the word's whole list", async () => {
    mocks.sql = fakeSql([[SAVED], [{ bundle_id: 3 }], [{ bundle_id: 2 }, { bundle_id: 3 }]]);
    const res = await PATCH(request({ id: 7, bundleId: 3, action: "add" }));
    expect(res.status).toBe(200);
    expect((await res.json()).bundleIds).toEqual([2, 3]);
  });

  it("404s when the bundle is not this user's", async () => {
    mocks.sql = fakeSql([[SAVED], []]);
    const res = await PATCH(request({ id: 7, bundleId: 3, action: "add" }));
    expect(res.status).toBe(404);
  });

  it("removes a membership", async () => {
    mocks.sql = fakeSql([[SAVED], [{ bundle_id: 3 }], []]);
    const res = await PATCH(request({ id: 7, bundleId: 3, action: "remove" }));
    expect(res.status).toBe(200);
    expect((await res.json()).bundleIds).toEqual([]);
  });

  it("treats removing a membership that isn't there as done", async () => {
    // The caller asked for the word not to be in that bundle, and it isn't.
    mocks.sql = fakeSql([[SAVED], [], [{ bundle_id: 2 }]]);
    const res = await PATCH(request({ id: 7, bundleId: 3, action: "remove" }));
    expect(res.status).toBe(200);
    expect((await res.json()).bundleIds).toEqual([2]);
  });
});

describe("a database the migration has not been run against", () => {
  beforeEach(() => vi.spyOn(console, "error").mockImplementation(() => {}));
  afterEach(() => vi.restoreAllMocks());

  it("answers the word list with a 503 that names the fix", async () => {
    // The reported symptom: this used to throw, Next answered 500 with no body
    // of ours, and the client showed an empty vocabulary and no error at all.
    mocks.sql = fakeSql([undefinedTable()]);
    const res = await GET();
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.schemaOutOfDate).toBe(true);
    expect(body.error).toMatch(/db\/schema\.sql/);
  });

  it("answers a save into a bundle the same way", async () => {
    mocks.sql = fakeSql([undefinedTable()]);
    const res = await POST(request({ word: "juosta", base: "juosta", translations: ["to run"], bundleId: 3 }));
    expect(res.status).toBe(503);
  });

  it("answers a membership edit the same way", async () => {
    mocks.sql = fakeSql([undefinedTable()]);
    const res = await PATCH(request({ id: 7, bundleId: 3, action: "add" }));
    expect(res.status).toBe(503);
  });

  it("lets an unrelated database failure stay a 500", async () => {
    mocks.sql = fakeSql([new Error("connection reset")]);
    await expect(GET()).rejects.toThrow("connection reset");
  });
});
