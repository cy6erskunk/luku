/**
 * Word content access. The invariant worth a test of its own is what
 * updateWordContent does *not* write: a refine pass must never move a card's
 * schedule, because the reader's progress on it is the thing they would not
 * get back.
 */
import { describe, it, expect } from "vitest";
import { fakeSql } from "./helpers/fakeSql.js";
import {
  MAX_EXAMPLE,
  MAX_TRANSLATION,
  MAX_TRANSLATIONS,
  getWordByBase,
  getWordById,
  isExampleText,
  isExampleTranslation,
  listWords,
  normalizePos,
  normalizeTranslations,
  updateWordContent,
} from "../words.js";

const ROW = {
  id: 7,
  base: "toipua",
  translations: ["to recover"],
  pos: "verb",
  example: "Isä toipuu flunssasta.",
  example_translation: "Dad is recovering from a flu.",
  review_count: 2,
  next_review_at: "2026-10-20T06:00:00.000Z",
};

describe("normalizePos", () => {
  it.each(["noun", "verb", "adjective", "adverb", "other"])("accepts %s", (pos) => {
    expect(normalizePos(pos)).toBe(pos);
  });

  it("widens adj to adjective, which is what the UI colours by", () => {
    // translateWord()'s own prompt asks for "adj", but POS_CLR keys on the
    // long name, so a card saved as "adj" renders in the fallback grey.
    expect(normalizePos("adj")).toBe("adjective");
  });

  it("widens adv to adverb for the same reason", () => {
    expect(normalizePos("adv")).toBe("adverb");
  });

  it("ignores case and surrounding space", () => {
    expect(normalizePos("  Verb ")).toBe("verb");
  });

  it.each([
    ["the failure sentinel", "?"],
    ["a part of speech the UI has no colour for", "pronoun"],
    ["a non-string", 7],
    ["nothing", ""],
  ])("rejects %s", (_name, value) => {
    expect(normalizePos(value)).toBeNull();
  });
});

describe("normalizeTranslations", () => {
  it("trims each translation, so no caller can store an untrimmed one", () => {
    expect(normalizeTranslations(["  to recover ", "to get better"])).toEqual(["to recover", "to get better"]);
  });

  it("refuses the failure sentinel, so a refine pass cannot re-mark a card broken", () => {
    expect(normalizeTranslations(["(unavailable)"])).toBeNull();
  });

  it("refuses the sentinel however it is cased or spaced", () => {
    expect(normalizeTranslations(["to recover", " (Unavailable) "])).toBeNull();
  });

  it.each([
    ["an empty list", []],
    ["a non-array", "to recover"],
    ["a list with a non-string", ["to recover", 4]],
    ["a list with a blank entry", ["to recover", "   "]],
  ])("rejects %s", (_name, value) => {
    expect(normalizeTranslations(value)).toBeNull();
  });

  it(`rejects more than ${MAX_TRANSLATIONS} translations`, () => {
    expect(normalizeTranslations(Array(MAX_TRANSLATIONS + 1).fill("x"))).toBeNull();
    expect(normalizeTranslations(Array(MAX_TRANSLATIONS).fill("x"))).toHaveLength(MAX_TRANSLATIONS);
  });

  it("rejects a translation longer than the column should hold", () => {
    expect(normalizeTranslations(["x".repeat(MAX_TRANSLATION + 1)])).toBeNull();
  });
});

describe("example validators", () => {
  it("accepts an example at the cap and refuses one past it", () => {
    expect(isExampleText("x".repeat(MAX_EXAMPLE))).toBe(true);
    expect(isExampleText("x".repeat(MAX_EXAMPLE + 1))).toBe(false);
  });

  it("refuses a blank example, which would read as a card with none", () => {
    expect(isExampleText("   ")).toBe(false);
  });

  it("treats null as a value for an example's translation, since it can be cleared", () => {
    expect(isExampleTranslation(null)).toBe(true);
    expect(isExampleTranslation("")).toBe(true);
    expect(isExampleTranslation("x".repeat(MAX_EXAMPLE + 1))).toBe(false);
  });
});

describe("listWords", () => {
  it("scopes the page to the signed-in user", async () => {
    const sql = fakeSql([[]]);
    await listWords(sql, "u1");

    expect(sql.calls[0].values).toContain("u1");
  });

  it("reads the window count off a row and strips it from the words", async () => {
    const sql = fakeSql([[{ ...ROW, total: 42 }]]);
    const result = await listWords(sql, "u1");

    expect(result.total).toBe(42);
    expect(result.words).toEqual([ROW]);
    expect(result.words[0]).not.toHaveProperty("total");
  });

  it("reports a total of zero for an empty page rather than undefined", async () => {
    const sql = fakeSql([[]]);

    expect(await listWords(sql, "u1")).toEqual({ total: 0, words: [] });
  });

  it("finds cards with no example, counting a blank one as none", async () => {
    const sql = fakeSql([[]]);
    await listWords(sql, "u1", { filter: "missing_example" });

    expect(sql.calls[0].text).toContain("example IS NULL");
    expect(sql.calls[0].text).toContain("trim(example) = ''");
  });

  it("finds cards whose translation or part of speech failed to save", async () => {
    const sql = fakeSql([[]]);
    await listWords(sql, "u1", { filter: "suspect" });

    expect(sql.calls[0].text).toContain("pos = '?'");
    expect(sql.calls[0].text).toContain("ANY(translations)");
    expect(sql.calls[0].values).toContain("(unavailable)");
  });

  it("passes limit and offset as values, never built into the statement", async () => {
    const sql = fakeSql([[]]);
    await listWords(sql, "u1", { limit: 10, offset: 20 });

    expect(sql.calls[0].values).toEqual(["u1", 10, 20]);
  });

  it("orders by base so paging with an offset is stable", async () => {
    const sql = fakeSql([[]]);
    await listWords(sql, "u1");

    expect(sql.calls[0].text).toContain("ORDER BY base ASC, id ASC");
  });

  it("never selects the SRS internals a caller refining meanings has no use for", async () => {
    const sql = fakeSql([[]]);
    await listWords(sql, "u1");

    expect(sql.calls[0].text).not.toContain("ease_factor");
    expect(sql.calls[0].text).not.toContain("interval_days");
  });
});

describe("getWordById / getWordByBase", () => {
  it("scopes a read by id to the user", async () => {
    const sql = fakeSql([[ROW]]);
    await getWordById(sql, "u1", 7);

    expect(sql.calls[0].values).toEqual([7, "u1"]);
  });

  it("returns null rather than undefined when the card is not the user's", async () => {
    const sql = fakeSql([[]]);

    expect(await getWordById(sql, "u1", 7)).toBeNull();
  });

  it("matches a base form case-insensitively, since a caller quoting it may not have kept the case", async () => {
    const sql = fakeSql([[ROW]]);
    await getWordByBase(sql, "u1", "Toipua");

    expect(sql.calls[0].text).toContain("lower(base) = lower(");
    expect(sql.calls[0].values).toEqual(["u1", "Toipua"]);
  });
});

describe("updateWordContent", () => {
  it("names no SRS column, so refining a card cannot reschedule it", async () => {
    const sql = fakeSql([[{ id: 7, pos: "verb" }]]);
    await updateWordContent(sql, "u1", 7, { pos: "verb" });

    const { text } = sql.calls[0];
    for (const column of ["ease_factor", "interval_days", "review_count", "next_review_at"]) {
      expect(text).not.toContain(column);
    }
  });

  it("never writes the base form or the recorded inflections", async () => {
    const sql = fakeSql([[{ id: 7, pos: "verb" }]]);
    await updateWordContent(sql, "u1", 7, { pos: "verb" });

    expect(sql.calls[0].text).not.toMatch(/\bbase\s*=/);
    expect(sql.calls[0].text).not.toMatch(/\bforms\s*=/);
  });

  it("scopes the write to the user as well as the id", async () => {
    const sql = fakeSql([[{ id: 7, pos: "verb" }]]);
    await updateWordContent(sql, "u1", 7, { pos: "verb" });

    expect(sql.calls[0].text).toContain("WHERE id =");
    expect(sql.calls[0].text).toContain("AND user_id =");
    expect(sql.calls[0].values).toContain("u1");
  });

  it("is one statement, so there is no read to hold against the write", async () => {
    const sql = fakeSql([[{ id: 7, pos: "verb" }]]);
    await updateWordContent(sql, "u1", 7, { pos: "verb", example: "Isä toipuu." });

    expect(sql.calls).toHaveLength(1);
  });

  it("returns only the fields it wrote, so a caller merging the reply cannot blank the rest", async () => {
    // The row carries every content column; the patch owns one. A reply with
    // all four would let a merge put back a translation this write never saw.
    const sql = fakeSql([[{
      id: 7,
      translations: ["to recover"],
      pos: "verb",
      example: "Isä toipuu flunssasta.",
      example_translation: "Dad is recovering.",
    }]]);
    const updated = await updateWordContent(sql, "u1", 7, { example: "Isä toipuu flunssasta." });

    expect(updated).toEqual({ id: 7, example: "Isä toipuu flunssasta." });
  });

  it("leaves a column alone when the patch does not name it", async () => {
    const sql = fakeSql([[{ id: 7, pos: "verb" }]]);
    await updateWordContent(sql, "u1", 7, { pos: "verb" });

    // The CASE arms are what carry "named or not" into one statement.
    expect(sql.calls[0].values).toContain(false);
    expect(sql.calls[0].values).toContain(true);
  });

  it("distinguishes clearing an example's translation from leaving it", async () => {
    const sql = fakeSql([[{ id: 7, example_translation: null }]]);
    const updated = await updateWordContent(sql, "u1", 7, { example_translation: null });

    expect(updated).toEqual({ id: 7, example_translation: null });
    // Explicit null is a write, so its flag is true — the thing a COALESCE
    // could not express.
    expect(sql.calls[0].values[6]).toBe(true);
  });

  it("writes nothing and issues no query for an empty patch", async () => {
    const sql = fakeSql();

    expect(await updateWordContent(sql, "u1", 7, {})).toBeNull();
    expect(sql.calls).toHaveLength(0);
  });

  it("reports not-found when the card is not the user's", async () => {
    const sql = fakeSql([[]]);

    expect(await updateWordContent(sql, "u1", 7, { pos: "verb" })).toBeNull();
  });
});
