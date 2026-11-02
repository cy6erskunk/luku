import { describe, it, expect } from "vitest";
import { REVERSE_SESSION_SIZE, REVERSE_MIN_REVIEW_COUNT, reverseEligible, pickReverseSession } from "../reverse.js";

const word = (id, review_count) => ({ id, base: `w${id}`, translations: [`t${id}`], review_count });
const many = (n, review_count = REVERSE_MIN_REVIEW_COUNT) => Array.from({ length: n }, (_, i) => word(i + 1, review_count));
const ids = (ws) => ws.map((w) => w.id).sort((a, b) => a - b);

describe("reverseEligible", () => {
  it("keeps only words with two consecutive passes", () => {
    const words = [word(1, 0), word(2, 1), word(3, 2), word(4, 7)];
    expect(ids(reverseEligible(words))).toEqual([3, 4]);
  });

  it("reads a count the driver returned as a string", () => {
    expect(reverseEligible([word(1, "3")])).toHaveLength(1);
  });

  it("treats a missing count as never reviewed", () => {
    expect(reverseEligible([{ id: 1 }])).toHaveLength(0);
  });
});

describe("pickReverseSession", () => {
  it("caps a pass at the session size", () => {
    expect(REVERSE_SESSION_SIZE).toBe(12);
    expect(pickReverseSession(many(30), new Set())).toHaveLength(12);
  });

  it("never picks a word that is not far enough along", () => {
    const words = [...many(3), word(99, 1)];
    expect(ids(pickReverseSession(words, new Set()))).toEqual([1, 2, 3]);
  });

  it("returns nothing when no word qualifies", () => {
    const seen = new Set();
    expect(pickReverseSession(many(5, 0), seen)).toEqual([]);
    expect(seen.size).toBe(0);
  });

  it("moves on to unseen words in the next session", () => {
    const words = many(24);
    const seen = new Set();
    const first = ids(pickReverseSession(words, seen));
    const second = ids(pickReverseSession(words, seen));
    expect(first.filter((id) => second.includes(id))).toEqual([]);
    expect(seen.size).toBe(24);
  });

  it("tops a short last round up from words already seen", () => {
    const words = many(15);
    const seen = new Set();
    const first = ids(pickReverseSession(words, seen));
    const leftOver = ids(words).filter((id) => !first.includes(id));
    const second = ids(pickReverseSession(words, seen));
    expect(second).toHaveLength(12);
    expect(new Set(second).size).toBe(12);
    // The three not drawn the first time are all in.
    expect(leftOver).toHaveLength(3);
    for (const id of leftOver) expect(second).toContain(id);
  });

  it("starts the cycle over once every word has been seen", () => {
    const words = many(5);
    const seen = new Set([1, 2, 3, 4, 5]);
    expect(ids(pickReverseSession(words, seen))).toEqual([1, 2, 3, 4, 5]);
  });
});
