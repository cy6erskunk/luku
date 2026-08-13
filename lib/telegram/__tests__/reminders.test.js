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
    expect(q).toContain("EXTRACT(hour FROM NOW() AT TIME ZONE l.timezone) = l.reminder_hour");
    expect(q).toContain("l.last_reminded_on IS NULL");
    expect(q).toContain("(NOW() AT TIME ZONE l.timezone)::date");
  });

  it("counts due words per user in the same query", async () => {
    const sql = fakeSql([[]]);
    await findDueReminders(sql);
    expect(sql.calls[0].text).toContain("w.next_review_at <= NOW()");
  });
});

describe("sendReminders", () => {
  it("messages a user who has words due", async () => {
    const sql = fakeSql([[row()], []]);
    const result = await sendReminders(sql);

    expect(mocks.sent).toHaveLength(1);
    expect(mocks.sent[0].chatId).toBe(42);
    expect(mocks.sent[0].text).toContain("3 words are due");
    expect(result).toMatchObject({ considered: 1, sent: 1, skipped: 0 });
  });

  it("offers a button that starts the session", async () => {
    const sql = fakeSql([[row()], []]);
    await sendReminders(sql);
    expect(mocks.sent[0].extra.reply_markup.inline_keyboard[0][0].callback_data).toBe("r");
  });

  it("stamps last_reminded_on in the user's own timezone after sending", async () => {
    const sql = fakeSql([[row()], []]);
    await sendReminders(sql);

    const stamp = sql.calls.find((c) => c.text.includes("last_reminded_on ="));
    expect(stamp.text).toContain("(NOW() AT TIME ZONE timezone)::date");
    expect(stamp.values).toEqual([7]);
  });

  it("skips a user with nothing due without stamping them", async () => {
    const sql = fakeSql([[row({ due_count: 0 })]]);
    const result = await sendReminders(sql);

    expect(mocks.sent).toHaveLength(0);
    expect(result).toMatchObject({ considered: 1, sent: 0, skipped: 1 });
    // No stamp: a later hour in the same day can still reach them.
    expect(sql.calls.some((c) => c.text.includes("last_reminded_on ="))).toBe(false);
  });

  it("sends nothing when nobody is eligible", async () => {
    const result = await sendReminders(fakeSql([[]]));
    expect(result).toMatchObject({ considered: 0, sent: 0 });
    expect(mocks.sent).toHaveLength(0);
  });

  it("disables reminders for a user who blocked the bot", async () => {
    mocks.failWith = Object.assign(new Error("Forbidden: bot was blocked by the user"), { code: 403 });
    const sql = fakeSql([[row()], []]);

    const result = await sendReminders(sql);

    expect(result).toMatchObject({ blocked: 1, sent: 0 });
    const disable = sql.calls.find((c) => c.text.includes("reminders_enabled = FALSE"));
    expect(disable.values).toEqual([7]);
  });

  it("counts other failures without stamping or disabling", async () => {
    mocks.failWith = Object.assign(new Error("Bad Gateway"), { code: 502 });
    const sql = fakeSql([[row()]]);

    const result = await sendReminders(sql);

    expect(result).toMatchObject({ failed: 1, sent: 0, blocked: 0 });
    expect(sql.calls.some((c) => c.text.includes("last_reminded_on ="))).toBe(false);
    expect(sql.calls.some((c) => c.text.includes("reminders_enabled = FALSE"))).toBe(false);
  });

  it("keeps going after one chat fails", async () => {
    mocks.failChats.set(1, Object.assign(new Error("Bad Gateway"), { code: 502 }));
    const sql = fakeSql([
      [row({ telegram_user_id: 1, chat_id: 1 }), row({ telegram_user_id: 2, chat_id: 2 })],
      [],
    ]);

    const result = await sendReminders(sql);

    expect(result).toMatchObject({ considered: 2, sent: 1, failed: 1 });
    expect(mocks.sent.map((s) => s.chatId)).toEqual([2]);
  });
});
