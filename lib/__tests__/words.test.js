/**
 * Word content access. The invariant worth a test of its own is what
 * updateWordContent does *not* write: a refine pass must never move a card's
 * schedule, because the reader's progress on it is the thing they would not
 * get back.
 */
import { describe, it, expect } from "vitest";
import { fakeSql } from "./helpers/fakeSql.js";
import { DEFAULT_EASE_FACTOR } from "../srs.js";
import {
  LIST_FILTERS,
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
  ease_factor: 2.36,
  lapses: 3,
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

  it("ranks the difficult page by ease factor, hardest first", async () => {
    const sql = fakeSql([[]]);
    await listWords(sql, "u1", { filter: "difficult" });

    expect(sql.calls[0].text).toContain("ORDER BY ease_factor ASC");
  });

  it("leaves never-graded cards out of the difficult page", async () => {
    // An ungraded row holds the schema default untouched, so the predicate
    // keeps those off a page named "difficult". It does not follow that
    // everything on the default is ungraded — seven easy answers cancel five
    // hard ones exactly — but a card that has broken even is not difficult
    // either, so both are rightly excluded.
    const sql = fakeSql([[]]);
    await listWords(sql, "u1", { filter: "difficult" });

    expect(sql.calls[0].text).toContain("ease_factor <");
    expect(sql.calls[0].values).toContain(DEFAULT_EASE_FACTOR);
  });

  it.each(LIST_FILTERS)("ends the %s ordering with id, so an offset page cannot repeat a card", async (filter) => {
    // ease_factor is nowhere near unique, so without the tiebreak two cards of
    // equal difficulty could swap places between calls and a paging caller
    // would see one twice and the other never.
    const sql = fakeSql([[]]);
    await listWords(sql, "u1", { filter });

    expect(sql.calls[0].text).toMatch(/ORDER BY[^;]*id ASC\s*$/m);
  });

  it.each(LIST_FILTERS)("returns the ease factor on the %s page, as the only lasting difficulty signal", async (filter) => {
    // Deliberately reversing the first cut of these tools, which left it out
    // as noise: nothing counts lapses and review_count is reset by every
    // failure, so without this column "which words are hardest to recall" has
    // no answer.
    //
    // Asserted against the SELECT list alone. The difficult branch names
    // ease_factor in its WHERE and ORDER BY too, so a bare substring check
    // stays green when the column is dropped from what is actually returned.
    const sql = fakeSql([[]]);
    await listWords(sql, "u1", { filter });

    const selected = sql.calls[0].text.split(/\bFROM\b/)[0];
    expect(selected).toContain("ease_factor");
  });

  it.each(LIST_FILTERS)("hands back a numeric ease factor on the %s page even when the driver stringifies it", async (filter) => {
    // The column is a Postgres FLOAT and the driver's type parsers may return
    // "1.42"; the tool descriptions tell a model to compare this against the
    // default and the floor, so a string here is a quiet mismatch.
    const sql = fakeSql([[{ ...ROW, ease_factor: "1.42", total: 1 }]]);
    const result = await listWords(sql, "u1", { filter });

    expect(result.words[0].ease_factor).toBe(1.42);
  });

  it("narrows the lapsed page to cards failed at their last review", async () => {
    // review_count reaches 0 only after a failure or before the first review,
    // so it needs a second condition to rule the latter out.
    const sql = fakeSql([[]]);
    await listWords(sql, "u1", { filter: "lapsed" });

    expect(sql.calls[0].text).toContain("review_count = 0");
    expect(sql.calls[0].values).toContain(DEFAULT_EASE_FACTOR);
  });

  it("proves a lapse by either signal, because each alone drops cards the filter is for", async () => {
    // Both halves are sufficient and neither is necessary, so dropping either
    // silently loses real lapses:
    //
    //   without `lapses > 0`, a card pushed up by easy answers is missed —
    //     six Easy reach 3.1, and one Again leaves review_count 0 at 2.56,
    //     which is a failure sitting above the default;
    //   without `ease_factor < DEFAULT`, nothing from before the lapses
    //     column is visible at all, since it starts every row at 0.
    //
    // This assertion is what makes either deletion fail rather than quietly
    // narrowing the result.
    const sql = fakeSql([[]]);
    await listWords(sql, "u1", { filter: "lapsed" });

    const where = sql.calls[0].text.match(/\bWHERE\b([\s\S]*?)\bORDER BY\b/i)[1];
    expect(where).toMatch(/lapses > 0\s*OR\s*ease_factor <|ease_factor <[^)]*OR\s*lapses > 0/);
  });

  it("breaks ties within an ease level by lapses, rather than leading with them", async () => {
    // This ordering is the point of the column. The ease factor saturates at
    // its floor after three failures, so on a real collection a large share of
    // cards pile up there with nothing to separate them; lapses separates
    // them. Leading with lapses instead would let a card failed once since the
    // column existed outrank one failed twenty times before it.
    const sql = fakeSql([[]]);
    await listWords(sql, "u1", { filter: "difficult" });

    expect(sql.calls[0].text).toContain("ORDER BY ease_factor ASC, lapses DESC");
  });

  it.each(LIST_FILTERS)("returns the lapse count on the %s page", async (filter) => {
    const sql = fakeSql([[]]);
    await listWords(sql, "u1", { filter });

    expect(sql.calls[0].text.split(/\bFROM\b/)[0]).toContain("lapses");
  });

  it("hands back a numeric lapse count even when the driver stringifies it", async () => {
    const sql = fakeSql([[{ ...ROW, lapses: "3", total: 1 }]]);
    const result = await listWords(sql, "u1");

    expect(result.words[0].lapses).toBe(3);
  });

  it("still withholds interval_days, which next_review_at already answers", async () => {
    const sql = fakeSql([[]]);
    await listWords(sql, "u1");

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
    expect(sql.calls[0].values).toEqual(["u1", "Toipua", "Toipua"]);
  });

  it.each([
    ["getWordById", (sql) => getWordById(sql, "u1", 7)],
    ["getWordByBase", (sql) => getWordByBase(sql, "u1", "toipua")],
  ])("returns the ease factor from %s, so one card reads like a page row", async (_name, read) => {
    // A caller that found a hard card in a list and then re-read it must not
    // lose the column it was ranked by.
    const sql = fakeSql([[{ ...ROW, ease_factor: "1.42" }]]);
    const card = await read(sql);

    expect(sql.calls[0].text.split(/\bFROM\b/)[0]).toContain("ease_factor");
    // Coerced here too, so one card reads like a page row in type as well as
    // in shape.
    expect(card.ease_factor).toBe(1.42);
  });

  it("prefers the exact-case card when two differ only by case", async () => {
    // UNIQUE (user_id, base) is case-sensitive, so "Suomi" and "suomi" can
    // both be saved. Without an ORDER BY, which one came back was whatever
    // Postgres felt like returning.
    const sql = fakeSql([[ROW]]);
    await getWordByBase(sql, "u1", "Suomi");

    expect(sql.calls[0].text).toContain("ORDER BY (base =");
    expect(sql.calls[0].text).toContain("LIMIT 1");
  });
});

describe("updateWordContent", () => {
  it("names no SRS column, so refining a card cannot reschedule it", async () => {
    const sql = fakeSql([[{ id: 7, pos: "verb" }]]);
    await updateWordContent(sql, "u1", 7, { pos: "verb" });

    const { text } = sql.calls[0];
    for (const column of ["ease_factor", "interval_days", "review_count", "lapses", "next_review_at"]) {
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
