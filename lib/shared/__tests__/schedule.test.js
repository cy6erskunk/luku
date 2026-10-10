import { describe, it, expect } from "vitest";
import { pickSchedule } from "../schedule.js";

describe("pickSchedule", () => {
  it("keeps the id and the schedule, and nothing else", () => {
    const row = { id: 3, user_id: "u1", base: "juosta", example: "Hän juoksee.", ease_factor: 2.6, interval_days: 6, next_review_at: "2026-10-14T06:00:00.000Z", review_count: 3 };
    expect(pickSchedule(row)).toEqual({ id: 3, ease_factor: 2.6, interval_days: 6, next_review_at: "2026-10-14T06:00:00.000Z", review_count: 3 });
  });

  it("leaves out a field the row lacks rather than setting it to undefined", () => {
    const picked = pickSchedule({ id: 3, interval_days: 6 });
    expect(picked).toEqual({ id: 3, interval_days: 6 });
    expect("review_count" in picked).toBe(false);
  });
});

