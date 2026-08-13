import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  ACTION_GRADE,
  ACTION_REVIEW,
  ACTION_SHOW,
  ACTION_STOP,
  gradeData,
  parseCallback,
  showData,
  signCard,
  verifyCard,
} from "../callback.js";

const CHAT = 42;
const WORD = { id: 7, next_review_at: "2026-08-13T06:00:00.000Z" };

beforeEach(() => {
  vi.stubEnv("TELEGRAM_WEBHOOK_SECRET", "test-secret");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("signCard", () => {
  it("is deterministic for the same chat and card state", () => {
    expect(signCard(CHAT, WORD)).toBe(signCard(CHAT, WORD));
  });

  it("changes when the card's schedule moves", () => {
    const graded = { ...WORD, next_review_at: "2026-08-19T06:00:00.000Z" };
    expect(signCard(CHAT, graded)).not.toBe(signCard(CHAT, WORD));
  });

  it("differs per chat, so a signature cannot be carried to another user", () => {
    expect(signCard(99, WORD)).not.toBe(signCard(CHAT, WORD));
  });

  it("differs per word", () => {
    expect(signCard(CHAT, { ...WORD, id: 8 })).not.toBe(signCard(CHAT, WORD));
  });

  it("changes with the webhook secret", () => {
    const before = signCard(CHAT, WORD);
    vi.stubEnv("TELEGRAM_WEBHOOK_SECRET", "rotated");
    expect(signCard(CHAT, WORD)).not.toBe(before);
  });

  it("throws when the secret is not configured", () => {
    vi.stubEnv("TELEGRAM_WEBHOOK_SECRET", "");
    expect(() => signCard(CHAT, WORD)).toThrow(/TELEGRAM_WEBHOOK_SECRET/);
  });

  it("accepts a Date as well as a string schedule", () => {
    expect(signCard(CHAT, { ...WORD, next_review_at: new Date(WORD.next_review_at) })).toBe(signCard(CHAT, WORD));
  });
});

describe("verifyCard", () => {
  it("accepts a signature it just produced", () => {
    expect(verifyCard(signCard(CHAT, WORD), CHAT, WORD)).toBe(true);
  });

  it("rejects a signature for a card that has since been graded", () => {
    const sig = signCard(CHAT, WORD);
    const graded = { ...WORD, next_review_at: "2026-08-19T06:00:00.000Z" };
    expect(verifyCard(sig, CHAT, graded)).toBe(false);
  });

  it("rejects a signature from another chat", () => {
    expect(verifyCard(signCard(99, WORD), CHAT, WORD)).toBe(false);
  });

  it("rejects malformed, truncated and missing signatures", () => {
    for (const bad of ["", "abc", null, undefined, 12, "z".repeat(12)]) {
      expect(verifyCard(bad, CHAT, WORD)).toBe(false);
    }
  });
});

describe("callback data builders", () => {
  it("stay within Telegram's 64 byte limit", () => {
    const big = { id: 2147483647, next_review_at: WORD.next_review_at };
    expect(Buffer.byteLength(showData(CHAT, big))).toBeLessThanOrEqual(64);
    expect(Buffer.byteLength(gradeData(CHAT, big, 5))).toBeLessThanOrEqual(64);
  });

  it("round-trip through parseCallback", () => {
    expect(parseCallback(showData(CHAT, WORD))).toEqual({
      action: ACTION_SHOW,
      wordId: 7,
      sig: signCard(CHAT, WORD),
    });
    expect(parseCallback(gradeData(CHAT, WORD, 5))).toEqual({
      action: ACTION_GRADE,
      grade: 5,
      wordId: 7,
      sig: signCard(CHAT, WORD),
    });
  });
});

describe("parseCallback", () => {
  it("parses the bare stop and review actions", () => {
    expect(parseCallback("x")).toEqual({ action: ACTION_STOP });
    expect(parseCallback("r")).toEqual({ action: ACTION_REVIEW });
  });

  it("returns null for unknown actions", () => {
    expect(parseCallback("nope")).toBeNull();
    expect(parseCallback("q:1:2")).toBeNull();
  });

  it("returns null for the wrong number of segments", () => {
    expect(parseCallback("s:7")).toBeNull();
    expect(parseCallback("s:7:sig:extra")).toBeNull();
    expect(parseCallback("g:5:7")).toBeNull();
    expect(parseCallback("x:1")).toBeNull();
  });

  it("returns null for non-numeric ids and grades", () => {
    expect(parseCallback("s:abc:sig")).toBeNull();
    expect(parseCallback("g:abc:7:sig")).toBeNull();
    expect(parseCallback("g:5:abc:sig")).toBeNull();
  });

  it("returns null for empty, oversized and non-string data", () => {
    expect(parseCallback("")).toBeNull();
    expect(parseCallback("s:7:" + "a".repeat(64))).toBeNull();
    expect(parseCallback(null)).toBeNull();
    expect(parseCallback(42)).toBeNull();
  });
});
