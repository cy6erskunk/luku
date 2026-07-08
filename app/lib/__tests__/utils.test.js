import { describe, it, expect } from "vitest";
import { hasApiKey, tokenize, sentenceOf, wordForms, findExistingWord, SKIP_KEY } from "../utils.js";

describe("wordForms", () => {
  it("returns the stored forms array when present", () => {
    const forms = [{ word: "juoksin", translation: "I ran" }];
    expect(wordForms({ base: "juosta", forms })).toEqual(forms);
  });

  it("returns empty array when forms is missing or empty", () => {
    expect(wordForms({ base: "juosta" })).toEqual([]);
    expect(wordForms({ base: "juosta", forms: [] })).toEqual([]);
  });

  it("returns empty array for null/undefined input", () => {
    expect(wordForms(null)).toEqual([]);
    expect(wordForms(undefined)).toEqual([]);
  });
});

describe("hasApiKey", () => {
  it("returns true for a valid key", () => {
    expect(hasApiKey("sk-ant-abc123")).toBe(true);
  });

  it("returns false for the skip token", () => {
    expect(hasApiKey(SKIP_KEY)).toBe(false);
  });

  it("returns falsy for empty string", () => {
    expect(hasApiKey("")).toBeFalsy();
  });

  it("returns falsy for null", () => {
    expect(hasApiKey(null)).toBeFalsy();
  });

  it("returns falsy for undefined", () => {
    expect(hasApiKey(undefined)).toBeFalsy();
  });
});

describe("tokenize", () => {
  it("returns empty array for empty string", () => {
    expect(tokenize("")).toEqual([]);
  });

  it("tokenizes a single word", () => {
    expect(tokenize("talo")).toEqual([{ t: "wd", v: "talo", k: "talo" }]);
  });

  it("lowercases the key for words", () => {
    const tokens = tokenize("Talo");
    expect(tokens[0]).toEqual({ t: "wd", v: "Talo", k: "talo" });
  });

  it("identifies punctuation tokens", () => {
    const tokens = tokenize("Hei!");
    expect(tokens).toEqual([
      { t: "wd", v: "Hei", k: "hei" },
      { t: "pu", v: "!" },
    ]);
  });

  it("identifies space tokens", () => {
    const tokens = tokenize("a b");
    expect(tokens[1]).toEqual({ t: "sp", v: " " });
  });

  it("identifies line break tokens", () => {
    const tokens = tokenize("a\nb");
    expect(tokens[1]).toMatchObject({ t: "br" });
  });

  it("handles multiple newlines as a single break token", () => {
    const tokens = tokenize("a\n\nb");
    expect(tokens[1]).toMatchObject({ t: "br", v: "\n\n" });
  });

  it("tokenizes a Finnish sentence correctly", () => {
    const tokens = tokenize("Hyvää päivää!");
    const types = tokens.map((t) => t.t);
    expect(types).toContain("wd");
    expect(types).toContain("sp");
    expect(types).toContain("pu");
  });

  it("handles Finnish special characters", () => {
    const tokens = tokenize("äänestää");
    expect(tokens).toEqual([{ t: "wd", v: "äänestää", k: "äänestää" }]);
  });

  it("handles commas and periods as punctuation", () => {
    const tokens = tokenize("kyllä, ei.");
    const punc = tokens.filter((t) => t.t === "pu").map((t) => t.v);
    expect(punc).toContain(",");
    expect(punc).toContain(".");
  });

  it("handles em-dash as punctuation", () => {
    const tokens = tokenize("a—b");
    expect(tokens.find((t) => t.t === "pu")?.v).toBe("—");
  });

  it("splits wrapping parens, brackets, and braces from words", () => {
    expect(tokenize("(talo)").map((t) => t.v)).toEqual(["(", "talo", ")"]);
    expect(tokenize("[koira]").map((t) => t.v)).toEqual(["[", "koira", "]"]);
    expect(tokenize("{kissa}").map((t) => t.v)).toEqual(["{", "kissa", "}"]);
  });

  it("splits wrapping curly quotes from words", () => {
    expect(tokenize("“talo”").map((t) => t.v)).toEqual(["“", "talo", "”"]);
    expect(tokenize("‘koira’").map((t) => t.v)).toEqual(["‘", "koira", "’"]);
  });
});

describe("findExistingWord", () => {
  const DB = [
    { id: 1, base: "juosta", forms: [{ word: "juoksin", translation: "I ran" }] },
    { id: 2, base: "koira", forms: [] },
    { id: 3, base: "talo" },
  ];

  it("returns null when neither form nor base is provided", () => {
    expect(findExistingWord(DB, {})).toBeNull();
    expect(findExistingWord(DB, { form: "", base: "" })).toBeNull();
  });

  it("returns null when dbWords is not an array", () => {
    expect(findExistingWord(null, { form: "koira" })).toBeNull();
    expect(findExistingWord(undefined, { form: "koira" })).toBeNull();
  });

  it("matches by base case-insensitively", () => {
    expect(findExistingWord(DB, { base: "KOIRA" })).toEqual(DB[1]);
  });

  it("matches when the tapped form equals a stored base", () => {
    expect(findExistingWord(DB, { form: "Juosta" })).toEqual(DB[0]);
  });

  it("matches by a recorded inflection in forms", () => {
    expect(findExistingWord(DB, { form: "Juoksin" })).toEqual(DB[0]);
  });

  it("returns null when neither the form nor base matches", () => {
    expect(findExistingWord(DB, { form: "auto", base: "auto" })).toBeNull();
  });

  it("prefers a base match when both a base and unrelated form are provided", () => {
    expect(findExistingWord(DB, { form: "unrelated", base: "talo" })).toEqual(DB[2]);
  });

  it("ignores words without a base and without a matching form", () => {
    const db = [{ id: 9 }, ...DB];
    expect(findExistingWord(db, { form: "auto" })).toBeNull();
    expect(findExistingWord(db, { base: "koira" })).toEqual(DB[1]);
  });
});

describe("sentenceOf", () => {
  it("returns the sentence containing the word", () => {
    const text = "Minä olen opiskelija. Hän on opettaja. Me olemme suomalaisia.";
    expect(sentenceOf(text, "opettaja")).toContain("opettaja");
  });

  it("is case-insensitive", () => {
    const text = "Koira juoksee nopeasti.";
    expect(sentenceOf(text, "KOIRA")).toContain("Koira");
  });

  it("falls back to first 120 chars when word not found", () => {
    const text = "a".repeat(200);
    const result = sentenceOf(text, "xyz");
    expect(result).toBe(text.slice(0, 120));
  });

  it("handles text without sentence-ending punctuation", () => {
    const text = "tämä on testi";
    const result = sentenceOf(text, "testi");
    expect(result).toContain("testi");
  });

  it("returns the correct sentence when multiple sentences present", () => {
    const text = "Minä syön. Sinä juot. Hän nukkuu.";
    expect(sentenceOf(text, "juot")).toContain("juot");
    expect(sentenceOf(text, "juot")).not.toContain("syön");
  });
});
