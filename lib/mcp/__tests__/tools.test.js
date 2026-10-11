/**
 * The tools an MCP client can reach. Everything a tool is handed comes from a
 * language model, so the cases worth holding are the ones where an argument is
 * wrong or hostile: a card that is not the caller's, a part of speech the UI
 * cannot colour, the failure sentinel being written back. A refused call must
 * reach no query at all.
 */
import { describe, it, expect } from "vitest";
import { fakeSql } from "@/lib/__tests__/helpers/fakeSql.js";
import { MAX_EXAMPLE, MAX_TRANSLATIONS } from "@/lib/words";
import { definitions, toolsFor } from "../tools.js";

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

const call = (sql, name, args) => toolsFor(sql, "u1").call(name, args);
const data = (result) => result.structuredContent;

describe("definitions", () => {
  it("offers exactly the three tools the server implements", () => {
    expect(definitions.map((d) => d.name)).toEqual(["list_words", "get_word", "update_word"]);
  });

  it("tells a client what a good example looks like, in the app's own words", () => {
    // The server writes no language itself — the client does — so this
    // description is the only thing holding an MCP-written example to the same
    // standard ExamplePicker asks for.
    const update = definitions.find((d) => d.name === "update_word");

    expect(update.description).toContain("4-8 words");
    expect(update.description).toContain("Hän toipuu.");
  });

  it("promises in the description that a refine cannot cost the user their progress", () => {
    const update = definitions.find((d) => d.name === "update_word");

    expect(update.description).toMatch(/schedule/i);
  });

  it("describes the ordering the query actually uses", () => {
    // The model plans its paging around this sentence, so a description that
    // disagrees with the ORDER BY is worse than none.
    const list = definitions.find((d) => d.name === "list_words");

    expect(list.description).toContain("alphabetically by Finnish base form");
  });

  it("requires only an id to update, so a caller can change one field", () => {
    const update = definitions.find((d) => d.name === "update_word");

    expect(update.inputSchema.required).toEqual(["id"]);
  });
});

describe("unknown tools and arguments", () => {
  it("reports an unknown tool as a tool error the model can read", async () => {
    const sql = fakeSql();
    const result = await call(sql, "delete_word", {});

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("Unknown tool");
    expect(sql.calls).toHaveLength(0);
  });

  it.each([
    ["__proto__", "__proto__"],
    ["constructor", "constructor"],
    ["toString", "toString"],
    ["valueOf", "valueOf"],
  ])("treats the inherited property %s as an unknown tool, not a handler", async (_name, name) => {
    // A plain HANDLERS[name] resolves Object.prototype, so these reached a
    // non-callable object or a real function — a 500 and a nonsense result
    // respectively, from a name a model is free to invent.
    const sql = fakeSql();
    const result = await call(sql, name, {});

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("Unknown tool");
    expect(sql.calls).toHaveLength(0);
  });

  it.each([
    ["an array", []],
    ["a string", "id=7"],
    ["null", null],
  ])("refuses %s as the arguments object without querying", async (_name, args) => {
    const sql = fakeSql();
    const result = await call(sql, "get_word", args);

    expect(result.isError).toBe(true);
    expect(sql.calls).toHaveLength(0);
  });
});

describe("list_words", () => {
  it("returns the page and its total", async () => {
    const sql = fakeSql([[{ ...ROW, total: 1 }]]);
    const result = await call(sql, "list_words", {});

    expect(data(result)).toEqual({ total: 1, words: [ROW] });
  });

  it("scopes the list to the token's user", async () => {
    const sql = fakeSql([[]]);
    await call(sql, "list_words", {});

    expect(sql.calls[0].values).toContain("u1");
  });

  it("defaults to 25 cards so a large vocabulary does not arrive in one reply", async () => {
    const sql = fakeSql([[]]);
    await call(sql, "list_words", {});

    expect(sql.calls[0].values).toContain(25);
  });

  it("refuses an unknown filter without querying", async () => {
    const sql = fakeSql();
    const result = await call(sql, "list_words", { filter: "broken" });

    expect(result.isError).toBe(true);
    expect(sql.calls).toHaveLength(0);
  });

  it("refuses a limit past the cap, rather than quietly serving the whole list", async () => {
    const sql = fakeSql();
    const result = await call(sql, "list_words", { limit: 5000 });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("1 to 50");
    expect(sql.calls).toHaveLength(0);
  });

  it.each([
    ["a fractional limit", { limit: 2.5 }],
    ["a zero limit", { limit: 0 }],
    ["a negative offset", { offset: -1 }],
    ["a non-numeric offset", { offset: "10" }],
  ])("refuses %s without querying", async (_name, args) => {
    const sql = fakeSql();
    const result = await call(sql, "list_words", args);

    expect(result.isError).toBe(true);
    expect(sql.calls).toHaveLength(0);
  });
});

describe("get_word", () => {
  it("reads a card by id", async () => {
    const sql = fakeSql([[ROW]]);

    expect(data(await call(sql, "get_word", { id: 7 }))).toEqual(ROW);
  });

  it("reads a card by its base form", async () => {
    const sql = fakeSql([[ROW]]);
    await call(sql, "get_word", { base: "toipua" });

    expect(sql.calls[0].values).toEqual(["u1", "toipua"]);
  });

  it("refuses both id and base together, which would be ambiguous", async () => {
    const sql = fakeSql();
    const result = await call(sql, "get_word", { id: 7, base: "toipua" });

    expect(result.isError).toBe(true);
    expect(sql.calls).toHaveLength(0);
  });

  it("refuses neither", async () => {
    const sql = fakeSql();

    expect((await call(sql, "get_word", {})).isError).toBe(true);
    expect(sql.calls).toHaveLength(0);
  });

  it("refuses an id past the int4 range Postgres would error on", async () => {
    const sql = fakeSql();
    const result = await call(sql, "get_word", { id: 2147483648 });

    expect(result.isError).toBe(true);
    expect(sql.calls).toHaveLength(0);
  });

  it("reports another user's card as simply not there", async () => {
    const sql = fakeSql([[]]);
    const result = await call(sql, "get_word", { id: 7 });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("No such card");
  });
});

describe("update_word", () => {
  it("writes the translations it was given, trimmed", async () => {
    const sql = fakeSql([[{ id: 7, translations: ["to recover"] }]]);
    const result = await call(sql, "update_word", { id: 7, translations: ["  to recover "] });

    expect(sql.calls[0].values).toContainEqual(["to recover"]);
    expect(data(result)).toEqual({ id: 7, translations: ["to recover"] });
  });

  it("widens adj to adjective, so the refined card gets its colour back", async () => {
    const sql = fakeSql([[{ id: 7, pos: "adjective" }]]);
    await call(sql, "update_word", { id: 7, pos: "adj" });

    expect(sql.calls[0].values).toContain("adjective");
    expect(sql.calls[0].values).not.toContain("adj");
  });

  it("refuses to write the failure sentinel back over a translation", async () => {
    const sql = fakeSql();
    const result = await call(sql, "update_word", { id: 7, translations: ["(unavailable)"] });

    expect(result.isError).toBe(true);
    expect(sql.calls).toHaveLength(0);
  });

  it("refuses a part of speech the UI has no colour for", async () => {
    const sql = fakeSql();
    const result = await call(sql, "update_word", { id: 7, pos: "pronoun" });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("noun, verb, adjective, adverb, other");
    expect(sql.calls).toHaveLength(0);
  });

  it(`refuses an example longer than ${MAX_EXAMPLE} characters`, async () => {
    const sql = fakeSql();
    const result = await call(sql, "update_word", { id: 7, example: "x".repeat(MAX_EXAMPLE + 1) });

    expect(result.isError).toBe(true);
    expect(sql.calls).toHaveLength(0);
  });

  it(`refuses more than ${MAX_TRANSLATIONS} translations`, async () => {
    const sql = fakeSql();
    const result = await call(sql, "update_word", {
      id: 7,
      translations: Array(MAX_TRANSLATIONS + 1).fill("to recover"),
    });

    expect(result.isError).toBe(true);
    expect(sql.calls).toHaveLength(0);
  });

  it("refuses a call that names no field to change", async () => {
    const sql = fakeSql();
    const result = await call(sql, "update_word", { id: 7 });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("Nothing to change");
    expect(sql.calls).toHaveLength(0);
  });

  it("clears an example's translation when passed null", async () => {
    const sql = fakeSql([[{ id: 7, example_translation: null }]]);
    const result = await call(sql, "update_word", { id: 7, example_translation: null });

    expect(data(result)).toEqual({ id: 7, example_translation: null });
  });

  it("returns only the fields it wrote, not the whole card", async () => {
    // The stored row differs from the patch in every other column, so a reply
    // carrying them all would be visible here.
    const sql = fakeSql([[{
      id: 7,
      translations: ["to recover"],
      pos: "verb",
      example: "Isä toipuu flunssasta.",
      example_translation: "Dad is recovering from a flu.",
    }]]);
    const result = await call(sql, "update_word", { id: 7, pos: "verb" });

    expect(data(result)).toEqual({ id: 7, pos: "verb" });
  });

  it("writes no SRS column, so a refine never moves the card's schedule", async () => {
    const sql = fakeSql([[{ id: 7, pos: "verb" }]]);
    await call(sql, "update_word", { id: 7, pos: "verb" });

    for (const column of ["ease_factor", "interval_days", "review_count", "next_review_at"]) {
      expect(sql.calls[0].text).not.toContain(column);
    }
  });

  it("reports another user's card as not there rather than writing to it", async () => {
    const sql = fakeSql([[]]);
    const result = await call(sql, "update_word", { id: 7, pos: "verb" });

    expect(result.isError).toBe(true);
    expect(sql.calls[0].values).toContain("u1");
  });
});
