/**
 * The vocabulary route — the one place user data is written. Every case here
 * is about the two things a caller must not be able to influence: whose rows
 * are read, written and deleted, and what a malformed body or query is allowed
 * to store.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { fakeSql } from "@/lib/__tests__/helpers/fakeSql.js";

const mocks = vi.hoisted(() => ({ session: null, sql: null }));

vi.mock("@/lib/auth/server", () => ({
  getAuth: () => ({ getSession: () => Promise.resolve({ data: mocks.session }) }),
}));
vi.mock("@/lib/db", () => ({ getDb: () => mocks.sql }));

const { GET, POST, DELETE } = await import("../route.js");

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

const postRequest = (body) => ({ json: () => Promise.resolve(body) });
const deleteRequest = (id) =>
  ({ url: `https://luku.test/api/words${id === undefined ? "" : `?id=${encodeURIComponent(id)}`}` });

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
    const res = await POST(postRequest(BODY));

    expect(res.status).toBe(401);
    expect((await res.json()).error).toBe("Unauthorized");
    expect(mocks.sql.calls).toHaveLength(0);
  });

  it("returns the stored row", async () => {
    mocks.sql = fakeSql([[WORD]]);
    const res = await POST(postRequest(BODY));

    expect(res.status).toBe(200);
    expect((await res.json()).word).toEqual(WORD);
  });

  it("returns null rather than undefined when the write returned no row", async () => {
    mocks.sql = fakeSql([[]]);
    expect((await (await POST(postRequest(BODY))).json()).word).toBeNull();
  });

  it("stores the row against the session's user, not anything the body claims", async () => {
    mocks.sql = fakeSql([[WORD]]);
    await POST(postRequest({ ...BODY, user_id: "someone-else" }));

    expect(inserted().userId).toBe("u1");
    expect(mocks.sql.calls[0].values).not.toContain("someone-else");
  });

  it("records the tapped inflection and its translation", async () => {
    mocks.sql = fakeSql([[WORD]]);
    await POST(postRequest(BODY));

    const { base, forms } = inserted();
    expect(base).toBe("juosta");
    expect(forms).toEqual([{ word: "juoksin", translation: "I ran" }]);
  });

  it("records the inflection with a null translation when none came back", async () => {
    mocks.sql = fakeSql([[WORD]]);
    await POST(postRequest({ ...BODY, formTranslation: undefined }));

    expect(inserted().forms).toEqual([{ word: "juoksin", translation: null }]);
  });

  it("records no inflection when the tapped word is the base form", async () => {
    mocks.sql = fakeSql([[WORD]]);
    // Capitalised at the start of a sentence — still the base form, not an
    // inflection worth listing under "seen in text".
    await POST(postRequest({ ...BODY, word: "Juosta" }));

    expect(inserted().forms).toEqual([]);
  });

  it("falls back to the tapped word when no base form was resolved", async () => {
    mocks.sql = fakeSql([[WORD]]);
    await POST(postRequest({ ...BODY, base: undefined }));

    const { base, forms } = inserted();
    expect(base).toBe("juoksin");
    expect(forms).toEqual([]);
  });

  it("defaults an unknown part of speech instead of writing null", async () => {
    mocks.sql = fakeSql([[WORD]]);
    await POST(postRequest({ ...BODY, pos: undefined }));

    expect(inserted().pos).toBe("other");
  });

  it("writes a missing example as null", async () => {
    mocks.sql = fakeSql([[WORD]]);
    await POST(postRequest({ ...BODY, example: undefined, example_translation: undefined }));

    const { example, exampleTranslation } = inserted();
    expect(example).toBeNull();
    expect(exampleTranslation).toBeNull();
  });

  it("upserts on the word rather than duplicating it", async () => {
    mocks.sql = fakeSql([[WORD]]);
    await POST(postRequest(BODY));

    expect(mocks.sql.calls[0].text).toContain("ON CONFLICT (user_id, base) DO UPDATE");
  });

  it("keeps the inflections already recorded, and does not list one twice", async () => {
    // Tapping the same word again must not wipe the forms collected on earlier
    // scans, and tapping the same inflection twice must not list it twice.
    mocks.sql = fakeSql([[WORD]]);
    await POST(postRequest(BODY));

    const { text } = mocks.sql.calls[0];
    expect(text).toContain("WHEN jsonb_array_length(EXCLUDED.forms) = 0 THEN words.forms");
    expect(text).toContain("lower(f->>'word') = lower(EXCLUDED.forms->0->>'word')");
    expect(text).toContain("ELSE words.forms || EXCLUDED.forms");
  });

  it("keeps the stored example when the new one is empty", async () => {
    mocks.sql = fakeSql([[WORD]]);
    await POST(postRequest(BODY));

    const { text } = mocks.sql.calls[0];
    expect(text).toContain("example = COALESCE(EXCLUDED.example, words.example)");
  });

  it("writes one statement, so a half-applied save is not possible", async () => {
    // The HTTP driver has no transactions: anything split across two tagged
    // templates can land half-done.
    mocks.sql = fakeSql([[WORD]]);
    await POST(postRequest(BODY));

    expect(mocks.sql.calls).toHaveLength(1);
  });
});
