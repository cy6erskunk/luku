/**
 * The text an MCP client is handed at connect time.
 *
 * Prose is not usually worth testing, but this prose is a specification a
 * remote model acts on, and it restates numbers that live in lib/srs.js. The
 * cases below are the ones where being wrong changes what a client does: the
 * algorithm it thinks it is talking to, what it thinks review_count counts,
 * and whether the ease deltas still match the code that applies them.
 */
import { describe, it, expect } from "vitest";
import { DEFAULT_EASE_FACTOR, FAILURES_TO_FLOOR, MIN_EASE_FACTOR, easeDelta } from "@/lib/srs";
import { INSTRUCTIONS } from "../instructions.js";

describe("INSTRUCTIONS", () => {
  it("names the algorithm that is actually implemented", () => {
    // Guessing FSRS is the specific wrong turn this text exists to prevent:
    // its grades, its reset behaviour and its field names all differ.
    expect(INSTRUCTIONS).toMatch(/SM-2/);
    expect(INSTRUCTIONS).toMatch(/not FSRS/i);
  });

  it("says that a failure resets review_count, not that it increments it", () => {
    // The single most load-bearing sentence here. review_count reads like a
    // lifetime total, and a model that believes that will read a just-failed
    // card as a brand new one.
    expect(INSTRUCTIONS).toMatch(/consecutive passes/i);
    expect(INSTRUCTIONS).toMatch(/resets it to 0/i);
  });

  it("derives the ease deltas from lib/srs.js rather than stating them", () => {
    // Note what this can and cannot catch. The text interpolates easeDelta, so
    // tuning calcSRS moves both sides together and there is nothing to drift —
    // the protection is structural. What this catches is the change that
    // removes it: typing the numbers in as literals, after which the next
    // tuning silently hands clients the old algorithm.
    for (const grade of [1, 3, 5]) {
      const d = Number(easeDelta(grade).toFixed(2));
      expect(INSTRUCTIONS).toContain(d > 0 ? `+${d}` : `${d}`);
    }
  });

  it("derives how many failures reach the floor, rather than stating it", () => {
    // "three failures" is true only from the starting value and only at the
    // current penalty; retuning the Again delta changes it to six. Same guard
    // as the deltas above: it catches the edit that replaces the computed
    // value with the word.
    expect(INSTRUCTIONS).toContain(String(FAILURES_TO_FLOOR));
    expect(INSTRUCTIONS).not.toMatch(/\bthree failures\b/i);
  });

  it("quotes the starting ease factor and its floor from their source", () => {
    expect(INSTRUCTIONS).toContain(String(DEFAULT_EASE_FACTOR));
    expect(INSTRUCTIONS).toContain(String(MIN_EASE_FACTOR));
  });

  it("points a caller asking about difficulty at the filter that answers it", () => {
    expect(INSTRUCTIONS).toContain("difficult");
  });

  it("does not claim the starting ease factor means a card was never graded", () => {
    // It is the obvious inference and it is wrong: easy answers push the
    // factor above the default, and because +0.1 cancels -0.14 at seven to
    // five, a mixed history lands back on it — Easy, Hard, Easy, Hard, Easy,
    // Hard, Easy, Easy, Easy, Hard, Easy, Hard puts a twelve-review card at
    // exactly 2.5. A model told otherwise would read it as untouched.
    expect(INSTRUCTIONS).not.toMatch(/never graded/i);
    expect(INSTRUCTIONS).toMatch(/lost ground/i);
  });

  it("states the writable surface, so a client does not plan an edit it cannot make", () => {
    for (const column of ["translations", "pos", "example", "example_translation"]) {
      expect(INSTRUCTIONS).toContain(column);
    }
    expect(INSTRUCTIONS).toMatch(/reschedule/i);
  });

  it("stays short enough to sit in a system prompt every turn", () => {
    // Not a style rule: a client may carry this for the whole of a
    // conversation, so length is a running cost rather than a one-off.
    expect(INSTRUCTIONS.length).toBeLessThan(2000);
  });
});
