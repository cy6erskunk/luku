/**
 * The vocabulary route — the one place user data is written. Every case here
 * is about the two things a caller must not be able to influence: whose rows
 * are read, written and deleted, and what a malformed body or query is allowed
 * to store.
 *
 * The bundle-aware parts sit alongside them: the membership that rides along
 * with a save, the PATCH that edits one afterwards, and what every handler
 * answers on a database the schema file has not been re-run against.
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

const { GET, POST, DELETE, PATCH } = await import("../route.js");

const WORD = {
  id: 7,
  user_id: "u1",
  base: "juosta",
  translations: ["to run"],
  pos: "verb",
  forms: [{ word: "juoksin", translation: "I ran" }],
  example: "Minä juoksin.",
  example_translation: "I ran.",
  next_review_at: "2026-08-13T06:00:00.000Z",
};

/** The same word as the route hands it back once bundles exist. */
const SAVED = { id: 7, base: "juosta", translations: ["to run"], bundle_ids: [] };

const jsonRequest = (body) => ({ json: () => Promise.resolve(body) });
const deleteRequest = (id) =>
  ({ url: `https://luku.test/api/words${id === undefined ? "" : `?id=${encodeURIComponent(id)}`}` });

/** What the driver throws on a database the schema file has not been re-run
 *  against: Postgres' undefined_table SQLSTATE on `code`. */
function undefinedTable() {
  const e = new Error('relation "word_bundles" does not exist');
  e.code = "42P01";
  return e;
}

beforeEach(() => {
  mocks.session = { user: { id: "u1" } };
  mocks.sql = fakeSql();
});

describe("GET /api/words", () => {
  it("returns 401 when signed out", async () => {
    mocks.session = null;
    const res = await GET();

    expect(res.status).toBe(401);
    expect((await res.json()).error).toBe("Unauthorized");
    expect(mocks.sql.calls).toHaveLength(0);
  });

  it("returns the saved words", async () => {
    mocks.sql = fakeSql([[WORD]]);
    const res = await GET();

    expect(res.status).toBe(200);
    expect((await res.json()).words).toEqual([WORD]);
  });

  it("scopes the list to the signed-in user and orders it by when it is next due", async () => {
    mocks.sql = fakeSql([[]]);
    await GET();

    expect(mocks.sql.calls[0].values).toEqual(["u1"]);
    expect(mocks.sql.calls[0].text).toContain("ORDER BY next_review_at ASC");
  });

  it("carries each word's bundle membership", async () => {
    // In the same statement: the client groups, filters and reviews by bundle,
    // and a request per word to find out would be an N+1 over HTTP.
    mocks.sql = fakeSql([[{ ...SAVED, bundle_ids: [2, 5] }]]);
    const res = await GET();

    expect((await res.json()).words[0].bundle_ids).toEqual([2, 5]);
    expect(mocks.sql.calls[0].text).toContain("FROM word_bundles WHERE word_id = words.id");
  });
});

describe("DELETE /api/words", () => {
  it("returns 401 when signed out", async () => {
    mocks.session = null;
    const res = await DELETE(deleteRequest(7));

    expect(res.status).toBe(401);
    expect((await res.json()).error).toBe("Unauthorized");
    expect(mocks.sql.calls).toHaveLength(0);
  });

  it("returns 400 when no id was given", async () => {
    for (const missing of [undefined, ""]) {
      mocks.sql = fakeSql();
      const res = await DELETE(deleteRequest(missing));

      expect(res.status).toBe(400);
      expect((await res.json()).error).toBe("Missing id");
      expect(mocks.sql.calls).toHaveLength(0);
    }
  });

  it("rejects an id that is not a plain positive integer, without touching the database", async () => {
    // Number.parseInt alone would read "7abc" as 7 and "1.5" as 1, so the
    // round-trip check is what keeps a partial parse out of the query.
    for (const bad of ["abc", "1.5", "-2", "0", "007", "7abc", " 7"]) {
      mocks.sql = fakeSql();
      const res = await DELETE(deleteRequest(bad));

      expect(res.status).toBe(400);
      expect((await res.json()).error).toBe("Invalid id");
      expect(mocks.sql.calls).toHaveLength(0);
    }
  });

  it("returns 404 when the row is not the caller's to delete", async () => {
    mocks.sql = fakeSql([[]]);
    const res = await DELETE(deleteRequest(42));

    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe("Not found");
  });

  it("deletes the row for the signed-in user only", async () => {
    // Two digits on purpose: a wrong parse radix reads "42" as something else
    // and the round-trip check then rejects an id that is perfectly valid.
    mocks.sql = fakeSql([[{ id: 42 }]]);
    const res = await DELETE(deleteRequest(42));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(mocks.sql.calls[0].text).toContain("DELETE FROM words");
    expect(mocks.sql.calls[0].values).toEqual([42, "u1"]);
  });
});

describe("POST /api/words", () => {
  const BODY = {
    word: "juoksin",
    base: "juosta",
    translations: ["to run"],
    pos: "verb",
    formTranslation: "I ran",
    example: "Minä juoksin.",
    example_translation: "I ran.",
  };

  /** The insert's bound values, in the order route.js supplies them. */
  const inserted = () => {
    const [userId, base, translations, pos, forms, example, exampleTranslation] = mocks.sql.calls[0].values;
    return { userId, base, translations, pos, forms: JSON.parse(forms), example, exampleTranslation };
  };

  it("returns 401 when signed out", async () => {
    mocks.session = null;
    const res = await POST(jsonRequest(BODY));

    expect(res.status).toBe(401);
    expect((await res.json()).error).toBe("Unauthorized");
    expect(mocks.sql.calls).toHaveLength(0);
  });

  it("returns the stored row", async () => {
    mocks.sql = fakeSql([[WORD]]);
    const res = await POST(jsonRequest(BODY));

    expect(res.status).toBe(200);
    expect((await res.json()).word).toEqual(WORD);
  });

  it("returns null rather than undefined when the write returned no row", async () => {
    mocks.sql = fakeSql([[]]);
    expect((await (await POST(jsonRequest(BODY))).json()).word).toBeNull();
  });

  it("stores the row against the session's user, not anything the body claims", async () => {
    mocks.sql = fakeSql([[WORD]]);
    await POST(jsonRequest({ ...BODY, user_id: "someone-else" }));

    expect(inserted().userId).toBe("u1");
    expect(mocks.sql.calls[0].values).not.toContain("someone-else");
  });

  it("records the tapped inflection and its translation", async () => {
    mocks.sql = fakeSql([[WORD]]);
    await POST(jsonRequest(BODY));

    const { base, forms } = inserted();
    expect(base).toBe("juosta");
    expect(forms).toEqual([{ word: "juoksin", translation: "I ran" }]);
  });

  it("records the inflection with a null translation when none came back", async () => {
    mocks.sql = fakeSql([[WORD]]);
    await POST(jsonRequest({ ...BODY, formTranslation: undefined }));

    expect(inserted().forms).toEqual([{ word: "juoksin", translation: null }]);
  });

  it("records no inflection when the tapped word is the base form", async () => {
    mocks.sql = fakeSql([[WORD]]);
    // Capitalised at the start of a sentence — still the base form, not an
    // inflection worth listing under "seen in text".
    await POST(jsonRequest({ ...BODY, word: "Juosta" }));

    expect(inserted().forms).toEqual([]);
  });

  it("falls back to the tapped word when no base form was resolved", async () => {
    mocks.sql = fakeSql([[WORD]]);
    await POST(jsonRequest({ ...BODY, base: undefined }));

    const { base, forms } = inserted();
    expect(base).toBe("juoksin");
    expect(forms).toEqual([]);
  });

  it("defaults an unknown part of speech instead of writing null", async () => {
    mocks.sql = fakeSql([[WORD]]);
    await POST(jsonRequest({ ...BODY, pos: undefined }));

    expect(inserted().pos).toBe("other");
  });

  it("writes a missing example as null", async () => {
    mocks.sql = fakeSql([[WORD]]);
    await POST(jsonRequest({ ...BODY, example: undefined, example_translation: undefined }));

    const { example, exampleTranslation } = inserted();
    expect(example).toBeNull();
    expect(exampleTranslation).toBeNull();
  });

  it("upserts on the word rather than duplicating it", async () => {
    mocks.sql = fakeSql([[WORD]]);
    await POST(jsonRequest(BODY));

    expect(mocks.sql.calls[0].text).toContain("ON CONFLICT (user_id, base) DO UPDATE");
  });

  it("keeps the inflections already recorded, and does not list one twice", async () => {
    // Tapping the same word again must not wipe the forms collected on earlier
    // scans, and tapping the same inflection twice must not list it twice.
    mocks.sql = fakeSql([[WORD]]);
    await POST(jsonRequest(BODY));

    const { text } = mocks.sql.calls[0];
    expect(text).toContain("WHEN jsonb_array_length(EXCLUDED.forms) = 0 THEN words.forms");
    expect(text).toContain("lower(f->>'word') = lower(EXCLUDED.forms->0->>'word')");
    expect(text).toContain("ELSE words.forms || EXCLUDED.forms");
  });

  it("keeps the stored example when the new one is empty", async () => {
    mocks.sql = fakeSql([[WORD]]);
    await POST(jsonRequest(BODY));

    const { text } = mocks.sql.calls[0];
    expect(text).toContain("example = COALESCE(EXCLUDED.example, words.example)");
  });

  it("writes the word itself in one statement, so a half-saved word is not possible", async () => {
    // The HTTP driver has no interactive transactions: anything split across
    // two tagged templates can land half-done. The word is therefore one
    // statement. A bundle membership is the deliberate exception below — it
    // needs the word's id, so it cannot ride along, and the half-completed
    // state it allows is a saved word that joined nothing.
    mocks.sql = fakeSql([[WORD]]);
    await POST(jsonRequest(BODY));

    expect(mocks.sql.calls).toHaveLength(1);
  });
});

describe("POST /api/words with a bundle", () => {
  it("saves without touching word_bundles when no bundle is active", async () => {
    mocks.sql = fakeSql([[SAVED]]);
    const res = await POST(jsonRequest({ word: "juosta", base: "juosta", translations: ["to run"], pos: "verb" }));
    expect((await res.json()).word).toEqual(SAVED);
    expect(mocks.sql.calls).toHaveLength(1);
  });

  it("attaches the saved word to the active bundle", async () => {
    mocks.sql = fakeSql([[SAVED], [{ bundle_id: 3 }]]);
    const res = await POST(jsonRequest({ word: "juosta", base: "juosta", translations: ["to run"], pos: "verb", bundleId: 3 }));
    expect((await res.json()).word.bundle_ids).toEqual([3]);
    expect(mocks.sql.calls[1].values).toEqual([7, 3, "u1", "u1"]);
  });

  it("does not claim membership the insert refused", async () => {
    // A bundle that is not this user's: the word is still saved, and the
    // answer says truthfully that it joined nothing.
    mocks.sql = fakeSql([[{ ...SAVED, bundle_ids: [1] }], []]);
    const res = await POST(jsonRequest({ word: "juosta", base: "juosta", translations: ["to run"], bundleId: 3 }));
    expect((await res.json()).word.bundle_ids).toEqual([1]);
  });

  it("rejects a malformed bundleId before writing anything", async () => {
    for (const bundleId of ["3", 0, -1, 1.5, 2147483648]) {
      mocks.sql = fakeSql();
      const res = await POST(jsonRequest({ word: "juosta", base: "juosta", translations: [], bundleId }));
      expect(res.status).toBe(400);
      expect((await res.json()).error).toBe("Invalid bundleId");
      expect(mocks.sql.calls).toHaveLength(0);
    }
  });
});

describe("PATCH /api/words", () => {
  it("returns 401 when signed out", async () => {
    mocks.session = null;
    const res = await PATCH(jsonRequest({ id: 7, bundleId: 3, action: "add" }));
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
      const res = await PATCH(jsonRequest(body));
      expect(res.status).toBe(400);
      expect((await res.json()).error).toBe(error);
      expect(mocks.sql.calls).toHaveLength(0);
    }
  });

  it("404s on a word that is not this user's, before any membership write", async () => {
    mocks.sql = fakeSql([[]]);
    const res = await PATCH(jsonRequest({ id: 7, bundleId: 3, action: "add" }));
    expect(res.status).toBe(404);
    expect(mocks.sql.calls).toHaveLength(1);
  });

  it("adds a membership and answers with the word's whole list", async () => {
    mocks.sql = fakeSql([[SAVED], [{ bundle_id: 3 }], [{ bundle_id: 2 }, { bundle_id: 3 }]]);
    const res = await PATCH(jsonRequest({ id: 7, bundleId: 3, action: "add" }));
    expect(res.status).toBe(200);
    expect((await res.json()).bundleIds).toEqual([2, 3]);
  });

  it("404s when the bundle is not this user's", async () => {
    mocks.sql = fakeSql([[SAVED], []]);
    const res = await PATCH(jsonRequest({ id: 7, bundleId: 3, action: "add" }));
    expect(res.status).toBe(404);
  });

  it("removes a membership", async () => {
    mocks.sql = fakeSql([[SAVED], [{ bundle_id: 3 }], []]);
    const res = await PATCH(jsonRequest({ id: 7, bundleId: 3, action: "remove" }));
    expect(res.status).toBe(200);
    expect((await res.json()).bundleIds).toEqual([]);
  });

  it("treats removing a membership that isn't there as done", async () => {
    // The caller asked for the word not to be in that bundle, and it isn't.
    mocks.sql = fakeSql([[SAVED], [], [{ bundle_id: 2 }]]);
    const res = await PATCH(jsonRequest({ id: 7, bundleId: 3, action: "remove" }));
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
    const res = await POST(jsonRequest({ word: "juosta", base: "juosta", translations: ["to run"], bundleId: 3 }));
    expect(res.status).toBe(503);
  });

  it("answers a membership edit the same way", async () => {
    mocks.sql = fakeSql([undefinedTable()]);
    const res = await PATCH(jsonRequest({ id: 7, bundleId: 3, action: "add" }));
    expect(res.status).toBe(503);
  });

  it("lets an unrelated database failure stay a 500", async () => {
    mocks.sql = fakeSql([new Error("connection reset")]);
    await expect(GET()).rejects.toThrow("connection reset");
  });
});
