import { describe, it, expect } from "vitest";
import { calcSRS } from "../srs.js";

const DAY = 24 * 60 * 60 * 1000;
const daysFromNow = (d) => Math.round((d.getTime() - Date.now()) / DAY);

describe("calcSRS", () => {
  it("schedules a brand new card one day out", () => {
    const r = calcSRS({ ease_factor: 2.5, interval_days: 0, review_count: 0 }, 5);
    expect(r.interval_days).toBe(1);
    expect(r.review_count).toBe(1);
    expect(daysFromNow(r.next_review_at)).toBe(1);
  });

  it("moves the second correct review to six days", () => {
    const r = calcSRS({ ease_factor: 2.5, interval_days: 1, review_count: 1 }, 5);
    expect(r.interval_days).toBe(6);
    expect(r.review_count).toBe(2);
  });

  it("multiplies interval by ease factor from the third review on", () => {
    const r = calcSRS({ ease_factor: 2.5, interval_days: 6, review_count: 2 }, 5);
    expect(r.interval_days).toBe(15);
    expect(r.review_count).toBe(3);
  });

  it("keeps a hard second review shorter than an easy one", () => {
    const hard = calcSRS({ ease_factor: 2.5, interval_days: 1, review_count: 1 }, 3);
    const easy = calcSRS({ ease_factor: 2.5, interval_days: 1, review_count: 1 }, 5);
    expect(hard.interval_days).toBe(3);
    expect(easy.interval_days).toBe(6);
    expect(hard.review_count).toBe(2);
  });

  it("grows a hard card slowly instead of by the ease factor", () => {
    const r = calcSRS({ ease_factor: 2.5, interval_days: 30, review_count: 5 }, 3);
    expect(r.interval_days).toBe(36);
    expect(r.review_count).toBe(6);
    expect(r.ease_factor).toBeLessThan(2.5);
  });

  it("still moves a one-day card forward on hard", () => {
    const r = calcSRS({ ease_factor: 1.3, interval_days: 1, review_count: 2 }, 3);
    expect(r.interval_days).toBe(2);
  });

  it("does not send a repeatedly hard card months out", () => {
    let card = { ease_factor: 2.5, interval_days: 0, review_count: 0 };
    for (let i = 0; i < 6; i++) card = calcSRS(card, 3);
    expect(card.interval_days).toBeLessThan(14);
  });

  it("resets a failed card to one day and review_count 0", () => {
    const r = calcSRS({ ease_factor: 2.5, interval_days: 30, review_count: 5 }, 1);
    expect(r.interval_days).toBe(1);
    expect(r.review_count).toBe(0);
    expect(daysFromNow(r.next_review_at)).toBe(1);
  });

  it("lowers ease factor on a failure and raises it on an easy grade", () => {
    const failed = calcSRS({ ease_factor: 2.5, interval_days: 6, review_count: 2 }, 1);
    const easy = calcSRS({ ease_factor: 2.5, interval_days: 6, review_count: 2 }, 5);
    expect(failed.ease_factor).toBeLessThan(2.5);
    expect(easy.ease_factor).toBeGreaterThan(2.5);
  });

  it("clamps ease factor at 1.3", () => {
    const r = calcSRS({ ease_factor: 1.3, interval_days: 1, review_count: 1 }, 1);
    expect(r.ease_factor).toBe(1.3);
  });

  it("coerces string column values instead of concatenating them", () => {
    const r = calcSRS({ ease_factor: "2.5", interval_days: "6", review_count: "2" }, 5);
    expect(Number.isNaN(r.ease_factor)).toBe(false);
    expect(r.ease_factor).toBeCloseTo(2.6, 5);
    expect(r.interval_days).toBe(15);
    expect(r.review_count).toBe(3);
  });

  it("falls back to defaults for a card with no SRS fields yet", () => {
    const r = calcSRS({}, 5);
    expect(r.interval_days).toBe(1);
    expect(r.review_count).toBe(1);
    expect(r.ease_factor).toBeCloseTo(2.6, 5);
  });
});
