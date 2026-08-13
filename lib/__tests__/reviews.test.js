import { describe, it, expect } from "vitest";
import {
  countDueWords,
  getWord,
  gradeWord,
  isValidGrade,
  isValidWordId,
  listDueWords,
  nextDueWord,
} from "../reviews.js";
import { fakeSql } from "./helpers/fakeSql.js";

const CARD = {
  id: 7,
  user_id: "u1",
  base: "juosta",
  translations: ["to run"],
  ease_factor: 2.5,
  interval_days: 6,
  review_count: 2,
};

describe("isValidGrade", () => {
  it("accepts only the three grades the UI offers", () => {
    expect(isValidGrade(1)).toBe(true);
    expect(isValidGrade(3)).toBe(true);
    expect(isValidGrade(5)).toBe(true);
  });

  it("rejects out-of-range, non-numeric and missing grades", () => {
    for (const bad of [0, 2, 4, 6, 100, -1, "5", null, undefined, NaN, {}]) {
      expect(isValidGrade(bad)).toBe(false);
    }
  });
});

describe("isValidWordId", () => {
  it("accepts positive safe integers", () => {
    expect(isValidWordId(1)).toBe(true);
    expect(isValidWordId(9999)).toBe(true);
  });

  it("rejects zero, negatives, floats, strings and missing ids", () => {
    for (const bad of [0, -3, 1.5, "7", null, undefined, NaN, Number.MAX_SAFE_INTEGER + 1]) {
      expect(isValidWordId(bad)).toBe(false);
    }
  });
});

describe("countDueWords", () => {
  it("returns the count for the user", async () => {
    const sql = fakeSql([[{ count: 4 }]]);
    expect(await countDueWords(sql, "u1")).toBe(4);
    expect(sql.calls[0].values).toEqual(["u1"]);
  });

  it("returns 0 when the query yields no row", async () => {
    expect(await countDueWords(fakeSql([[]]), "u1")).toBe(0);
  });
});

describe("listDueWords", () => {
  it("scopes to the user and passes the limit", async () => {
    const sql = fakeSql([[CARD]]);
    const rows = await listDueWords(sql, "u1", 25);
    expect(rows).toEqual([CARD]);
    expect(sql.calls[0].values).toEqual(["u1", 25]);
    expect(sql.calls[0].text).toContain("next_review_at <= NOW()");
  });

  it("defaults to a limit of 50", async () => {
    const sql = fakeSql([[]]);
    await listDueWords(sql, "u1");
    expect(sql.calls[0].values).toEqual(["u1", 50]);
  });
});

describe("nextDueWord", () => {
  it("returns the single most overdue card", async () => {
    const sql = fakeSql([[CARD]]);
    expect(await nextDueWord(sql, "u1")).toEqual(CARD);
    expect(sql.calls[0].values).toEqual(["u1", 1]);
  });

  it("returns null when nothing is due", async () => {
    expect(await nextDueWord(fakeSql([[]]), "u1")).toBeNull();
  });
});

describe("getWord", () => {
  it("scopes the lookup by both id and user", async () => {
    const sql = fakeSql([[CARD]]);
    await getWord(sql, "u1", 7);
    expect(sql.calls[0].values).toEqual([7, "u1"]);
  });

  it("returns null for a word belonging to someone else", async () => {
    expect(await getWord(fakeSql([[]]), "u2", 7)).toBeNull();
  });
});

describe("gradeWord", () => {
  it("returns null and does not update when the word is not found", async () => {
    const sql = fakeSql([[]]);
    expect(await gradeWord(sql, "u1", 7, 5)).toBeNull();
    expect(sql.calls).toHaveLength(1);
  });

  it("writes the SRS result computed from the loaded card", async () => {
    const updated = { ...CARD, interval_days: 15 };
    const sql = fakeSql([[CARD], [updated]]);

    expect(await gradeWord(sql, "u1", 7, 5)).toEqual(updated);

    const [easeFactor, intervalDays, nextReviewAt, reviewCount, id, userId] = sql.calls[1].values;
    expect(intervalDays).toBe(15);
    expect(reviewCount).toBe(3);
    expect(easeFactor).toBeGreaterThan(2.5);
    expect(nextReviewAt).toBeInstanceOf(Date);
    expect(id).toBe(7);
    expect(userId).toBe("u1");
  });

  it("resets the schedule on a failing grade", async () => {
    const sql = fakeSql([[CARD], [CARD]]);
    await gradeWord(sql, "u1", 7, 1);
    const [, intervalDays, , reviewCount] = sql.calls[1].values;
    expect(intervalDays).toBe(1);
    expect(reviewCount).toBe(0);
  });
});
