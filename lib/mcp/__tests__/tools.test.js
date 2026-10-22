/**
 * The tools an MCP client can reach. Everything a tool is handed comes from a
 * language model, so the cases worth holding are the ones where an argument is
 * wrong or hostile: a card that is not the caller's, a part of speech the UI
 * cannot colour, the failure sentinel being written back. A refused call must
 * reach no query at all.
 */
import { describe, it, expect, afterAll } from "vitest";
import { fakeSql } from "@/lib/__tests__/helpers/fakeSql.js";
import { AGAIN_DELAY_MINUTES } from "@/lib/srs";
import { MAX_EXAMPLE, MAX_TRANSLATIONS } from "@/lib/words";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { skillsFrom } from "../skills.js";
import { definitions, toolsFor } from "../tools.js";

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

const call = (sql, name, args) => toolsFor(sql, "u1").call(name, args);
const data = (result) => result.structuredContent;

describe("definitions", () => {
  it("offers exactly the five tools the server implements", () => {
    expect(definitions.map((d) => d.name)).toEqual(["list_words", "get_word", "update_word", "list_skills", "read_skill"]);
  });

  it("tells a model when to look for a skill, not only what the tool returns", () => {
    // Most clients surface a skill through this tool or not at all, so the
    // description is what decides whether a model ever checks.
    const listSkills = definitions.find((d) => d.name === "list_skills");

    expect(listSkills.description).toMatch(/before starting/i);
    expect(listSkills.description).toContain("read_skill");
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
    // disagrees with the ORDER BY is worse than none. Ordering is now
    // filter-dependent, so an unconditional claim would be the wrong one.
    const list = definitions.find((d) => d.name === "list_words");

    expect(list.description).toContain("alphabetically by Finnish base form");
    expect(list.description).toMatch(/depends on the filter/i);
    expect(list.description).toMatch(/difficult.*hardest first/is);
  });

  it("offers a filter ordering cards by when they are due, and says which way", () => {
    const list = definitions.find((d) => d.name === "list_words");

    expect(list.inputSchema.properties.filter.enum).toContain("due");
    expect(list.description).toMatch(/due.*most overdue first/is);
    expect(list.description).toContain("due_now");
  });

  it("offers a filter for the cards the user keeps failing", () => {
    const list = definitions.find((d) => d.name === "list_words");

    expect(list.inputSchema.properties.filter.enum).toContain("difficult");
  });

  it.each(["list_words", "get_word"])("tells %s's caller what review_count counts", (name) => {
    // review_count reads like a lifetime total and is a streak, so a client
    // left to guess reads a just-failed card as a brand new one. This is said
    // here as well as in the handshake instructions because some clients store
    // that field without ever reading it, while a tool description always
    // arrives.
    const tool = definitions.find((d) => d.name === name);

    expect(tool.description).toMatch(/consecutive/i);
    expect(tool.description).toMatch(/resets it to 0|resets.*to 0/i);
  });

  it.each(["list_words", "get_word"])("explains ease_factor on %s, since it is the only difficulty signal", (name) => {
    const tool = definitions.find((d) => d.name === name);

    expect(tool.description).toContain("ease_factor");
    expect(tool.description).toMatch(/lost ground/i);
    // It rises on an easy answer with no ceiling, so a card at 3.5 has to have
    // a reading. Describing only the fall left that card unexplained.
    expect(tool.description).toMatch(/rises|no ceiling/i);
  });

  it.each(["list_words", "get_word"])("tells %s's caller how soon a failed card is due", (name) => {
    const tool = definitions.find((d) => d.name === name);

    expect(tool.description).toContain(`${AGAIN_DELAY_MINUTES} minutes`);
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

    // Bound twice: once for the case-insensitive match, once for the
    // ORDER BY that prefers an exact-case row.
    expect(sql.calls[0].values).toEqual(["u1", "toipua", "toipua"]);
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

    for (const column of ["ease_factor", "interval_days", "review_count", "lapses", "next_review_at"]) {
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

describe("skills as tools", () => {
  const root = mkdtempSync(path.join(tmpdir(), "luku-skill-tools-"));
  mkdirSync(path.join(root, "drill", "references"), { recursive: true });
  writeFileSync(path.join(root, "drill", "SKILL.md"), '---\nname: drill\ndescription: "Drill one word."\n---\n\n# Drill\n');
  writeFileSync(path.join(root, "drill", "references", "cases.md"), "# Cases\n");
  writeFileSync(path.join(root, "secret.md"), "outside every skill");
  afterAll(() => rmSync(root, { recursive: true, force: true }));

  const skillCall = (name, args) => toolsFor(fakeSql(), "u1", skillsFrom(root)).call(name, args);

  it("lists each skill with its description and files", async () => {
    const result = await skillCall("list_skills", {});

    expect(data(result).skills).toEqual([{
      name: "drill",
      description: "Drill one word.",
      uri: "skill://drill/SKILL.md",
      files: ["SKILL.md", "references/cases.md"],
    }]);
  });

  it("reads SKILL.md by default and a supporting file by its relative path", async () => {
    expect((await skillCall("read_skill", { name: "drill" })).content[0].text).toContain("# Drill");
    expect((await skillCall("read_skill", { name: "drill", path: "./references/cases.md" })).content[0].text).toBe("# Cases\n");
  });

  it("names the skills there are when asked for one that is not", async () => {
    const result = await skillCall("read_skill", { name: "story" });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("drill");
  });

  it.each([
    ["a parent directory", "../secret.md"],
    ["an absolute path", "/etc/passwd"],
    ["a file the skill does not have", "references/other.md"],
  ])("refuses %s rather than reading it", async (_label, wanted) => {
    const result = await skillCall("read_skill", { name: "drill", path: wanted });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("has no file");
  });

  it("serves the shipped skill when no catalog is passed in", async () => {
    const result = await toolsFor(fakeSql(), "u1").call("read_skill", { name: "luku-story-practice" });

    expect(result.isError).toBe(false);
    expect(result.content[0].text).toMatch(/^---\nname: "luku-story-practice"/);
  });
});
