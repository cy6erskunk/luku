import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  allCaughtUp,
  formatHour,
  settings,
  cardBack,
  cardFront,
  dueSummary,
  escapeHtml,
  formatInterval,
  receipt,
  reminder,
  sessionComplete,
} from "../render.js";

const CHAT = 42;
const WORD = {
  id: 7,
  base: "juosta",
  pos: "verb",
  translations: ["to run", "to jog"],
  example: "Hän juoksi kotiin.",
  example_translation: "He ran home.",
  forms: [{ word: "juoksin", translation: "I ran" }],
  interval_days: 6,
  next_review_at: "2026-08-13T06:00:00.000Z",
};

beforeEach(() => {
  vi.stubEnv("TELEGRAM_WEBHOOK_SECRET", "test-secret");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("escapeHtml", () => {
  it("escapes the characters Telegram's HTML mode treats specially", () => {
    expect(escapeHtml("<b> & </b>")).toBe("&lt;b&gt; &amp; &lt;/b&gt;");
  });

  it("leaves ordinary Finnish text alone", () => {
    expect(escapeHtml("hyvää yötä")).toBe("hyvää yötä");
  });
});

describe("cardFront", () => {
  it("shows the base form and example but never the answer", () => {
    const card = cardFront(CHAT, WORD);
    expect(card.text).toContain("juosta");
    expect(card.text).toContain("Hän juoksi kotiin.");
    expect(card.text).not.toContain("to run");
    expect(card.text).not.toContain("He ran home");
  });

  it("offers a show-answer button and a stop button", () => {
    const rows = cardFront(CHAT, WORD).reply_markup.inline_keyboard;
    expect(rows[0][0].text).toBe("Show answer");
    expect(rows[0][0].callback_data).toMatch(/^s:7:[0-9a-f]{12}$/);
    expect(rows[1][0].callback_data).toBe("x");
  });

  it("mentions how many cards follow when there are more", () => {
    expect(cardFront(CHAT, WORD, { remaining: 4 }).text).toContain("4 more after this");
    expect(cardFront(CHAT, WORD, { remaining: 0 }).text).not.toContain("more after this");
  });

  it("works for a word with no example", () => {
    const card = cardFront(CHAT, { ...WORD, example: null });
    expect(card.text).toContain("juosta");
  });

  it("escapes a base form containing markup", () => {
    expect(cardFront(CHAT, { ...WORD, base: "<script>" }).text).toContain("&lt;script&gt;");
  });
});

describe("cardBack", () => {
  it("reveals part of speech, translations and the example translation", () => {
    const text = cardBack(CHAT, WORD).text;
    expect(text).toContain("verb");
    expect(text).toContain("to run");
    expect(text).toContain("to jog");
    expect(text).toContain("He ran home.");
  });

  it("lists the inflections seen while scanning", () => {
    const text = cardBack(CHAT, WORD).text;
    expect(text).toContain("seen in text");
    expect(text).toContain("juoksin — I ran");
  });

  it("omits the seen-in-text block when there are no forms", () => {
    expect(cardBack(CHAT, { ...WORD, forms: [] }).text).not.toContain("seen in text");
    expect(cardBack(CHAT, { ...WORD, forms: null }).text).not.toContain("seen in text");
  });

  it("handles an inflection with no translation", () => {
    const text = cardBack(CHAT, { ...WORD, forms: [{ word: "juoksin" }] }).text;
    expect(text).toContain("· juoksin");
    expect(text).not.toContain("· juoksin —");
  });

  it("offers exactly the three grades the web app uses", () => {
    const row = cardBack(CHAT, WORD).reply_markup.inline_keyboard[0];
    expect(row.map((b) => b.text)).toEqual(["Again", "Hard", "Easy"]);
    expect(row[0].callback_data).toMatch(/^g:1:7:[0-9a-f]{12}$/);
    expect(row[1].callback_data).toMatch(/^g:3:7:/);
    expect(row[2].callback_data).toMatch(/^g:5:7:/);
  });

  it("survives a word with no translations", () => {
    expect(() => cardBack(CHAT, { ...WORD, translations: null })).not.toThrow();
  });
});

describe("formatInterval", () => {
  it("describes short intervals in days", () => {
    expect(formatInterval(1)).toBe("tomorrow");
    expect(formatInterval(6)).toBe("in 6d");
    expect(formatInterval(29)).toBe("in 29d");
  });

  it("switches to months for long intervals", () => {
    expect(formatInterval(30)).toBe("in 1mo");
    expect(formatInterval(90)).toBe("in 3mo");
  });

  it("handles zero, string and nonsense values", () => {
    expect(formatInterval(0)).toBe("today");
    expect(formatInterval("6")).toBe("in 6d");
    expect(formatInterval(undefined)).toBe("today");
  });
});

describe("receipt", () => {
  it("names the word, the grade and the next appearance", () => {
    expect(receipt(WORD, 5).text).toContain("juosta");
    expect(receipt(WORD, 5).text).toContain("Easy");
    expect(receipt(WORD, 5).text).toContain("in 6d");
    expect(receipt(WORD, 1).text).toContain("Again");
    expect(receipt(WORD, 3).text).toContain("Hard");
  });

  it("carries no buttons, so a graded card cannot be regraded from its message", () => {
    expect(receipt(WORD, 5).reply_markup).toBeUndefined();
  });
});

describe("closing messages", () => {
  it("reports a finished session without inventing a card count", () => {
    expect(sessionComplete().text).toContain("Session complete");
  });

  it("distinguishes having nothing due from having no words at all", () => {
    expect(allCaughtUp(12).text).toContain("12 words");
    expect(allCaughtUp(1).text).toContain("1 word saved");
    expect(allCaughtUp(0).text).not.toContain("saved");
  });
});

describe("dueSummary and reminder", () => {
  it("pluralize the count", () => {
    expect(dueSummary(1).text).toContain("1 word is due");
    expect(dueSummary(5).text).toContain("5 words are due");
    expect(reminder(1).text).toContain("1 word is due");
    expect(reminder(3).text).toContain("3 words are due");
  });

  it("offer a button that starts a session", () => {
    expect(dueSummary(3).reply_markup.inline_keyboard[0][0].callback_data).toBe("r");
    expect(reminder(3).reply_markup.inline_keyboard[0][0].callback_data).toBe("r");
  });

  it("let a reminder be dismissed", () => {
    expect(reminder(3).reply_markup.inline_keyboard[0][1].callback_data).toBe("x");
  });

  it("falls back to the caught-up message when nothing is due", () => {
    expect(dueSummary(0).text).toContain("All caught up");
  });
});

describe("formatHour", () => {
  it("zero-pads to a 24-hour clock", () => {
    expect(formatHour(0)).toBe("00:00");
    expect(formatHour(9)).toBe("09:00");
    expect(formatHour(21)).toBe("21:00");
  });
});

describe("settings", () => {
  const NOW = new Date("2026-08-13T19:47:00Z");
  const LINK = {
    reminders_enabled: true,
    reminder_hour: 21,
    timezone: "Europe/Helsinki",
    last_reminded_on: "2026-08-12",
  };

  it("states the reminder hour when reminders are on", () => {
    const text = settings(LINK, { now: NOW }).text;
    expect(text).toContain("Reminders on");
    expect(text).toContain("21:00");
  });

  it("says so when reminders are paused, and points at /resume", () => {
    const text = settings({ ...LINK, reminders_enabled: false }, { now: NOW }).text;
    expect(text).toContain("paused");
    expect(text).toContain("/resume");
    expect(text).not.toContain("Reminders on");
  });

  it("names the timezone and the current time there", () => {
    const text = settings(LINK, { now: NOW }).text;
    expect(text).toContain("Europe/Helsinki");
    expect(text).toContain("22:47 there right now");
  });

  it("renders the same instant differently per zone, which is the point", () => {
    const helsinki = settings(LINK, { now: NOW }).text;
    const newYork = settings({ ...LINK, timezone: "America/New_York" }, { now: NOW }).text;
    expect(helsinki).toContain("22:47");
    expect(newYork).toContain("15:47");
  });

  it("reports when the last reminder was sent", () => {
    expect(settings(LINK, { now: NOW }).text).toContain("Last reminded: 2026-08-12");
  });

  it("accepts a Date for last_reminded_on as well as a string", () => {
    const asDate = settings({ ...LINK, last_reminded_on: new Date("2026-08-12T00:00:00Z") }, { now: NOW }).text;
    expect(asDate).toContain("Last reminded: 2026-08-12");
  });

  it("omits the last-reminded line for a link that has never fired", () => {
    expect(settings({ ...LINK, last_reminded_on: null }, { now: NOW }).text).not.toContain("Last reminded");
  });

  it("degrades instead of throwing on a timezone this build cannot resolve", () => {
    const text = settings({ ...LINK, timezone: "Mars/Olympus" }, { now: NOW }).text;
    expect(text).toContain("Mars/Olympus");
    expect(text).not.toContain("there right now");
    expect(text).toContain("21:00");
  });
});

describe("message length", () => {
  // Telegram rejects sendMessage over 4096 characters. base, example and
  // translations are unbounded TEXT and forms grows with every scan, so an
  // unbounded card would fail to send, stay due, and wedge the session.
  const huge = "x".repeat(5000);
  const MONSTER = {
    id: 1,
    base: huge,
    pos: "verb",
    example: huge,
    example_translation: huge,
    translations: Array.from({ length: 50 }, () => huge),
    forms: Array.from({ length: 50 }, () => ({ word: huge, translation: huge })),
    interval_days: 6,
    next_review_at: "2026-08-13T06:00:00.000Z",
  };

  it("keeps the card front inside Telegram's limit", () => {
    expect(cardFront(CHAT, MONSTER).text.length).toBeLessThan(4096);
  });

  it("keeps the card back inside Telegram's limit", () => {
    expect(cardBack(CHAT, MONSTER).text.length).toBeLessThan(4096);
  });

  it("keeps the receipt inside the limit too", () => {
    expect(receipt(MONSTER, 5).text.length).toBeLessThan(4096);
  });

  it("marks truncated text rather than cutting silently", () => {
    expect(cardFront(CHAT, MONSTER).text).toContain("…");
  });

  it("leaves normal-sized cards untouched", () => {
    expect(cardBack(CHAT, WORD).text).not.toContain("…");
    expect(cardBack(CHAT, WORD).text).toContain("to jog");
  });
});
