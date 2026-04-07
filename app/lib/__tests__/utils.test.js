import { describe, it, expect } from "vitest";
import { hasApiKey, tokenize, sentenceOf, SKIP_KEY } from "../utils.js";

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
