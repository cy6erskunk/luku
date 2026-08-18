import { describe, it, expect, beforeEach, vi } from "vitest";
import { fakeSql } from "@/lib/__tests__/helpers/fakeSql.js";

const mocks = vi.hoisted(() => ({ sent: [], failWith: null, failChats: new Map() }));

vi.mock("../api.js", () => ({
  sendMessage: (chatId, text, extra) => {
    const err = mocks.failChats.get(chatId) ?? mocks.failWith;
    if (err) return Promise.reject(err);
    mocks.sent.push({ chatId, text, extra });
    return Promise.resolve({});
  },
  isBlockedError: (e) => e?.code === 403,
}));

const { findDueReminders, sendReminders } = await import("../reminders.js");

const row = (over = {}) => ({
  telegram_user_id: 7,
  chat_id: 42,
  timezone: "Europe/Helsinki",
  due_count: 3,
  ...over,
});

beforeEach(() => {
  mocks.sent = [];
  mocks.failWith = null;
  mocks.failChats = new Map();
});

describe("findDueReminders", () => {
  it("filters on enabled, local hour and not-yet-reminded-today", async () => {
    const sql = fakeSql([[]]);
    await findDueReminders(sql);

    const q = sql.calls[0].text;
    expect(q).toContain("l.reminders_enabled");
    expect(q).toContain("l.last_reminded_on IS NULL");
    expect(q).toContain("(NOW() AT TIME ZONE l.timezone)::date");
  });

  it("catches up on a reminder hour that has already passed", async () => {
    const sql = fakeSql([[]]);
    await findDueReminders(sql);

    // `>=`, not `=`: a skipped or delayed hourly run — or an hour removed by a
    // DST transition — would otherwise cost that user the whole day.
    expect(sql.calls[0].text).toContain("EXTRACT(hour FROM NOW() AT TIME ZONE l.timezone) >= l.reminder_hour");
  });

  it("counts due words per user in the same query", async () => {
    const sql = fakeSql([[]]);
    await findDueReminders(sql);
    expect(sql.calls[0].text).toContain("w.next_review_at <= NOW()");
  });
});

const CLAIMED = [{ telegram_user_id: 7 }];
const NOT_CLAIMED = [];

describe("sendReminders", () => {
  it("messages a user who has words due", async () => {
    const sql = fakeSql([[row()], CLAIMED]);
    const result = await sendReminders(sql);

    expect(mocks.sent).toHaveLength(1);
    expect(mocks.sent[0].chatId).toBe(42);
    expect(mocks.sent[0].text).toContain("3 words are due");
    expect(result).toMatchObject({ considered: 1, sent: 1, skipped: 0, raced: 0 });
  });

  it("offers a button that starts the session", async () => {
    const sql = fakeSql([[row()], CLAIMED]);
    await sendReminders(sql);
    expect(mocks.sent[0].extra.reply_markup.inline_keyboard[0][0].callback_data).toBe("r");
  });

  it("claims the day in the user's own timezone before sending", async () => {
    const sql = fakeSql([[row()], CLAIMED]);
    await sendReminders(sql);

    const claim = sql.calls.find((c) => c.text.includes("SET last_reminded_on ="));
    expect(claim.text).toContain("(NOW() AT TIME ZONE timezone)::date");
    expect(claim.values).toEqual([7]);
    // Guarded, so a concurrent run updates zero rows rather than sending twice.
    expect(claim.text).toContain("last_reminded_on IS NULL");
  });

  it("re-checks reminders_enabled at the claim, not just at selection", async () => {
    const sql = fakeSql([[row()], CLAIMED]);
    await sendReminders(sql);

    // /pause partway through a run must still take effect: the eligibility
    // read happened before the loop started.
    const claim = sql.calls.find((c) => c.text.includes("SET last_reminded_on ="));
    expect(claim.text).toContain("reminders_enabled");
  });

  it("skips a user another run already claimed", async () => {
    const sql = fakeSql([[row()], NOT_CLAIMED]);
    const result = await sendReminders(sql);

    expect(mocks.sent).toHaveLength(0);
    expect(result).toMatchObject({ considered: 1, sent: 0, raced: 1 });
  });

  it("skips a user with nothing due without claiming them", async () => {
    const sql = fakeSql([[row({ due_count: 0 })]]);
    const result = await sendReminders(sql);

    expect(mocks.sent).toHaveLength(0);
    expect(result).toMatchObject({ considered: 1, sent: 0, skipped: 1 });
    // No claim: a later hour in the same day can still reach them.
    expect(sql.calls.some((c) => c.text.includes("SET last_reminded_on ="))).toBe(false);
  });

  it("sends nothing when nobody is eligible", async () => {
    const result = await sendReminders(fakeSql([[]]));
    expect(result).toMatchObject({ considered: 0, sent: 0 });
    expect(mocks.sent).toHaveLength(0);
  });

  it("disables reminders for a user who blocked the bot", async () => {
    mocks.failWith = Object.assign(new Error("Forbidden: bot was blocked by the user"), { code: 403 });
    const sql = fakeSql([[row()], CLAIMED, []]);

    const result = await sendReminders(sql);

    expect(result).toMatchObject({ blocked: 1, sent: 0 });
    const disable = sql.calls.find((c) => c.text.includes("reminders_enabled = FALSE"));
    expect(disable.values).toEqual([7]);
  });

  it("hands the claim back when delivery fails, so a later run retries today", async () => {
    mocks.failWith = Object.assign(new Error("Bad Gateway"), { code: 502 });
    const sql = fakeSql([[row({ last_reminded_on: "2026-08-12" })], CLAIMED, []]);

    const result = await sendReminders(sql);

    expect(result).toMatchObject({ failed: 1, sent: 0, blocked: 0 });
    const release = sql.calls[sql.calls.length - 1];
    expect(release.text).toContain("SET last_reminded_on =");
    expect(release.values).toEqual(["2026-08-12", 7]);
    expect(sql.calls.some((c) => c.text.includes("reminders_enabled = FALSE"))).toBe(false);
  });

  it("keeps going after one chat fails", async () => {
    mocks.failChats.set(1, Object.assign(new Error("Bad Gateway"), { code: 502 }));
    const sql = fakeSql([
      [row({ telegram_user_id: 1, chat_id: 1 }), row({ telegram_user_id: 2, chat_id: 2 })],
      [{ telegram_user_id: 1 }],
      [],
      [{ telegram_user_id: 2 }],
    ]);

    const result = await sendReminders(sql);

    expect(result).toMatchObject({ considered: 2, sent: 1, failed: 1 });
    expect(mocks.sent.map((s) => s.chatId)).toEqual([2]);
  });
});
