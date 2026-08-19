import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { fakeSql } from "@/lib/__tests__/helpers/fakeSql.js";

const mocks = vi.hoisted(() => ({ sent: [], edited: [], answered: [], sql: null, editError: null }));

vi.mock("../api.js", () => ({
  sendMessage: (chatId, text, extra) => {
    mocks.sent.push({ chatId, text, extra });
    return Promise.resolve({ message_id: 100 + mocks.sent.length });
  },
  editMessageText: (chatId, messageId, text, extra) => {
    mocks.edited.push({ chatId, messageId, text, extra });
    return mocks.editError ? Promise.reject(mocks.editError) : Promise.resolve({});
  },
  answerCallbackQuery: (id, text) => {
    mocks.answered.push({ id, text });
    return Promise.resolve(true);
  },
}));
vi.mock("../../db.js", () => ({ getDb: () => mocks.sql }));

const { handleUpdate } = await import("../handlers.js");
const { signCard } = await import("../callback.js");

const CHAT = 42;
const TG_USER = 7;
const MSG = 55;
const LINK = { telegram_user_id: TG_USER, user_id: "u1", chat_id: CHAT };
const SCHEDULED_LINK = {
  ...LINK,
  reminders_enabled: true,
  reminder_hour: 21,
  timezone: "Europe/Helsinki",
  last_reminded_on: null,
};

const WORD = {
  id: 3,
  base: "juosta",
  pos: "verb",
  translations: ["to run"],
  example: "Hän juoksi.",
  forms: [],
  ease_factor: 2.5,
  interval_days: 6,
  review_count: 2,
  next_review_at: "2026-08-13T06:00:00.000Z",
};

const message = (text) => ({
  message: { chat: { id: CHAT, type: "private" }, from: { id: TG_USER, username: "matti" }, text },
});

const callback = (data) => ({
  callback_query: {
    id: "cbq-1",
    data,
    from: { id: TG_USER },
    message: { message_id: MSG, chat: { id: CHAT, type: "private" } },
  },
});

const lastSent = () => mocks.sent[mocks.sent.length - 1];
const lastEdit = () => mocks.edited[mocks.edited.length - 1];

beforeEach(() => {
  mocks.sent = [];
  mocks.edited = [];
  mocks.answered = [];
  mocks.sql = fakeSql();
  mocks.editError = null;
  vi.stubEnv("TELEGRAM_WEBHOOK_SECRET", "test-secret");
  vi.stubEnv("APP_URL", "https://luku.test");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("/review", () => {
  it("sends the first due card face down", async () => {
    mocks.sql = fakeSql([[LINK], [], [WORD], [{ count: 3 }]]);
    await handleUpdate(message("/review"));

    expect(lastSent().text).toContain("juosta");
    expect(lastSent().text).not.toContain("to run");
    expect(lastSent().extra.reply_markup.inline_keyboard[0][0].text).toBe("Show answer");
  });

  it("says everything is caught up when nothing is due", async () => {
    mocks.sql = fakeSql([[LINK], [], [], [{ count: 12 }]]);
    await handleUpdate(message("/review"));

    expect(lastSent().text).toContain("All caught up");
    expect(lastSent().text).toContain("12 words");
  });

  it("scopes the due lookup to the linked account", async () => {
    mocks.sql = fakeSql([[LINK], [], [WORD], [{ count: 1 }]]);
    await handleUpdate(message("/review"));

    const due = mocks.sql.calls.find((c) => c.text.includes("next_review_at <= NOW()"));
    expect(due.values).toContain("u1");
  });
});

describe("/due", () => {
  it("reports the count with a start button", async () => {
    mocks.sql = fakeSql([[LINK], [], [{ count: 5 }]]);
    await handleUpdate(message("/due"));

    expect(lastSent().text).toContain("5 words are due");
    expect(lastSent().extra.reply_markup.inline_keyboard[0][0].callback_data).toBe("r");
  });
});

describe("revealing a card", () => {
  it("edits the message in place to show the answer", async () => {
    mocks.sql = fakeSql([[LINK], [WORD]]);
    await handleUpdate(callback(`s:3:${signCard(CHAT, WORD)}`));

    expect(lastEdit().messageId).toBe(MSG);
    expect(lastEdit().text).toContain("to run");
    expect(lastEdit().extra.reply_markup.inline_keyboard[0].map((b) => b.text)).toEqual(["Again", "Hard", "Easy"]);
    expect(mocks.answered).toHaveLength(1);
  });

  it("refuses a signature that does not match the card", async () => {
    mocks.sql = fakeSql([[LINK], [WORD]]);
    await handleUpdate(callback("s:3:deadbeef1234"));

    expect(mocks.edited).toHaveLength(0);
    expect(mocks.answered[0].text).toMatch(/moved on/i);
  });

  it("refuses when the word belongs to someone else", async () => {
    mocks.sql = fakeSql([[LINK], []]);
    await handleUpdate(callback(`s:3:${signCard(CHAT, WORD)}`));

    expect(mocks.edited).toHaveLength(0);
    expect(mocks.answered[0].text).toMatch(/moved on/i);
  });
});

describe("grading a card", () => {
  it("persists the grade, leaves a receipt and sends the next card", async () => {
    const graded = { ...WORD, interval_days: 15, next_review_at: "2026-08-28T06:00:00.000Z" };
    const nextWord = { ...WORD, id: 4, base: "syödä" };
    mocks.sql = fakeSql([
      [LINK],        // link lookup
      [WORD],        // getWord for signature check
      [WORD],        // gradeWord: load card
      [graded],      // gradeWord: update
      [nextWord],    // next due
      [{ count: 1 }],// remaining
    ]);

    await handleUpdate(callback(`g:5:3:${signCard(CHAT, WORD)}`));

    expect(lastEdit().text).toContain("✓");
    expect(lastEdit().text).toContain("Easy");
    expect(lastEdit().extra.reply_markup).toBeUndefined();
    expect(lastSent().text).toContain("syödä");
  });

  it("closes the session when nothing is left", async () => {
    mocks.sql = fakeSql([[LINK], [WORD], [WORD], [WORD], []]);
    await handleUpdate(callback(`g:5:3:${signCard(CHAT, WORD)}`));

    expect(lastSent().text).toContain("Session complete");
  });

  it("guards the write with the schedule the signature covers", async () => {
    mocks.sql = fakeSql([[LINK], [WORD], [WORD], [WORD], []]);
    await handleUpdate(callback(`g:5:3:${signCard(CHAT, WORD)}`));

    // A retry that slips past the signature check still cannot apply the grade
    // a second time: the update matches zero rows.
    const update = mocks.sql.calls.find((c) => c.text.includes("UPDATE words SET"));
    expect(update.text).toContain("next_review_at = ");
    expect(update.values).toContain(WORD.next_review_at);
  });

  it("reports a card graded concurrently rather than sending another", async () => {
    // Signature and read both pass, but the guarded update loses the race.
    mocks.sql = fakeSql([[LINK], [WORD], [WORD], []]);
    await handleUpdate(callback(`g:5:3:${signCard(CHAT, WORD)}`));

    expect(mocks.sent).toHaveLength(0);
    expect(mocks.answered[0].text).toMatch(/moved on/i);
  });

  it("rejects a replayed tap on an already graded card", async () => {
    const staleSig = signCard(CHAT, WORD);
    const alreadyGraded = { ...WORD, next_review_at: "2026-08-28T06:00:00.000Z" };
    mocks.sql = fakeSql([[LINK], [alreadyGraded]]);

    await handleUpdate(callback(`g:5:3:${staleSig}`));

    expect(mocks.edited).toHaveLength(0);
    expect(mocks.sent).toHaveLength(0);
    expect(mocks.answered[0].text).toMatch(/moved on/i);
  });

  it("rejects a grade the review UI never offers", async () => {
    mocks.sql = fakeSql([[LINK]]);
    await handleUpdate(callback(`g:4:3:${signCard(CHAT, WORD)}`));

    expect(mocks.edited).toHaveLength(0);
    expect(mocks.answered[0].text).toMatch(/unknown grade/i);
  });

  it("writes the grade against the linked user, not anything from the callback", async () => {
    mocks.sql = fakeSql([[LINK], [WORD], [WORD], [WORD], []]);
    await handleUpdate(callback(`g:3:3:${signCard(CHAT, WORD)}`));

    const update = mocks.sql.calls.find((c) => c.text.includes("UPDATE words SET"));
    expect(update.values).toContain("u1");
  });
});

describe("callback guards", () => {
  it("asks an unlinked chat to connect", async () => {
    mocks.sql = fakeSql([[]]);
    await handleUpdate(callback("r"));

    expect(lastSent().text).toContain("isn't connected");
    expect(mocks.answered).toHaveLength(1);
  });

  it("starts a session from the reminder button", async () => {
    mocks.sql = fakeSql([[LINK], [WORD], [{ count: 1 }]]);
    await handleUpdate(callback("r"));

    expect(lastSent().text).toContain("juosta");
  });

  it("replaces the card with a closing summary when the session is stopped", async () => {
    mocks.sql = fakeSql([[SCHEDULED_LINK], [{ count: 3 }]]);
    await handleUpdate(callback("x"));

    expect(mocks.answered).toHaveLength(1);
    // The card's own message becomes the summary, so the word being reviewed
    // and its buttons go away with it.
    expect(lastEdit().messageId).toBe(MSG);
    expect(lastEdit().text).toMatch(/Review stopped/i);
    expect(lastEdit().text).toContain("3 words are still due");
    // The exact wording depends on the hour of the run; render.test.js pins
    // each branch with an injected clock.
    expect(lastEdit().text).toMatch(/reminder/i);
    expect(mocks.sent).toHaveLength(0);
  });

  it("counts the remaining words for the stopped user, not for the caller", async () => {
    mocks.sql = fakeSql([[SCHEDULED_LINK], [{ count: 3 }]]);
    await handleUpdate(callback("x"));

    const count = mocks.sql.calls.find((c) => c.text.includes("count(*)"));
    expect(count.values).toContain("u1");
  });

  it("says nothing is left when the queue emptied, and drops the resume button", async () => {
    mocks.sql = fakeSql([[SCHEDULED_LINK], [{ count: 0 }]]);
    await handleUpdate(callback("x"));

    expect(lastEdit().text).toMatch(/nothing else is due/i);
    expect(lastEdit().extra.reply_markup).toBeUndefined();
  });

  it("treats the reminder's Later button as a postponement", async () => {
    mocks.sql = fakeSql([[SCHEDULED_LINK], [{ count: 2 }]]);
    await handleUpdate(callback("l"));

    expect(lastEdit().text).not.toMatch(/Review stopped/i);
    expect(lastEdit().text).toContain("2 words are still due");
  });

  it("sends the summary as a new message when the card is too old to edit", async () => {
    mocks.sql = fakeSql([[SCHEDULED_LINK], [{ count: 1 }]]);
    mocks.editError = Object.assign(new Error("message can't be edited"), { code: 400 });
    await handleUpdate(callback("x"));

    expect(lastSent().text).toMatch(/Review stopped/i);
  });

  it("always answers the callback so the client spinner clears", async () => {
    mocks.sql = fakeSql([[LINK]]);
    await handleUpdate(callback("garbage-data"));
    expect(mocks.answered).toHaveLength(1);
  });

  it("ignores a callback with no chat or sender", async () => {
    await handleUpdate({ callback_query: { id: "x", data: "r", from: { id: TG_USER } } });
    expect(mocks.answered).toHaveLength(0);
  });
});
