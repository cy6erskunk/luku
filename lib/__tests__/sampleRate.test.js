import { describe, it, expect } from "vitest";
import { sampleRate, defaultTracesSampleRate } from "../sampleRate.js";

describe("sampleRate", () => {
  it("uses a valid configured rate", () => {
    expect(sampleRate("0.25", 1)).toBe(0.25);
    expect(sampleRate("0", 1)).toBe(0);
    expect(sampleRate("1", 0.1)).toBe(1);
  });

  it("falls back when nothing is configured", () => {
    expect(sampleRate(undefined, 0.1)).toBe(0.1);
    expect(sampleRate(null, 0.1)).toBe(0.1);
    // An env var set to nothing is absent, not zero — Number("") would be 0
    // and would silently switch tracing off.
    expect(sampleRate("", 0.1)).toBe(0.1);
  });

  it("treats a whitespace-only value as absent too", () => {
    // A dashboard field someone cleared by typing over it, or a value pasted
    // with a stray newline. Number() reads all of these as 0.
    for (const blank of ["   ", "\t", "\n", " \t\n "]) {
      expect(sampleRate(blank, 0.1)).toBe(0.1);
    }
  });

  it("still accepts a padded number", () => {
    expect(sampleRate(" 0.25 ", 1)).toBe(0.25);
  });

  it("falls back on anything Sentry could not use", () => {
    for (const bad of ["abc", "1.5", "-0.2", "NaN", "Infinity", {}]) {
      expect(sampleRate(bad, 0.1)).toBe(0.1);
    }
  });
});

describe("defaultTracesSampleRate", () => {
  it("traces everything outside production", () => {
    expect(defaultTracesSampleRate("development")).toBe(1);
    expect(defaultTracesSampleRate("test")).toBe(1);
    expect(defaultTracesSampleRate(undefined)).toBe(1);
  });

  it("samples production traffic instead of tracing all of it", () => {
    expect(defaultTracesSampleRate("production")).toBe(0.1);
  });
});
