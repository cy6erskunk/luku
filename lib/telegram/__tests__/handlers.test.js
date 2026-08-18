import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { fakeSql } from "@/lib/__tests__/helpers/fakeSql.js";
import { sha256 } from "../link.js";

const mocks = vi.hoisted(() => ({ sent: [], sql: null }));

vi.mock("../api.js", () => ({
  sendMessage: (chatId, text, extra) => {
    mocks.sent.push({ chatId, text, extra });
    return Promise.resolve({ message_id: mocks.sent.length });
  },
}));
vi.mock("../../db.js", () => ({ getDb: () => mocks.sql }));

const { handleUpdate, helpText, parseCommand, connectPrompt, appUrl } = await import("../handlers.js");

const CHAT = 42;
const TG_USER = 7;

const message = (text, over = {}) => ({
  message: {
    chat: { id: CHAT, type: "private" },
    from: { id: TG_USER, username: "matti" },
    text,
    ...over,
  },
});

// Mirrors a real row: reminders_enabled, reminder_hour and timezone are all
// NOT NULL with defaults in db/schema.sql.
const LINK = {
  telegram_user_id: TG_USER,
  user_id: "u1",
  chat_id: CHAT,
  username: "matti",
  reminders_enabled: true,
  reminder_hour: 9,
  timezone: "Europe/Helsinki",
  last_reminded_on: null,
};
const lastSent = () => mocks.sent[mocks.sent.length - 1];

beforeEach(() => {
  mocks.sent = [];
  mocks.sql = fakeSql();
  vi.stubEnv("APP_URL", "https://luku.test");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("parseCommand", () => {
  it("extracts the command and its argument", () => {
    expect(parseCommand("/start abc123")).toEqual({ command: "/start", arg: "abc123" });
  });

  it("returns a null argument for a bare command", () => {
    expect(parseCommand("/help")).toEqual({ command: "/help", arg: null });
  });

  it("strips the @BotName suffix Telegram appends", () => {
    expect(parseCommand("/start@LukuBot abc")).toEqual({ command: "/start", arg: "abc" });
  });

  it("lowercases the command but preserves the argument's case", () => {
    expect(parseCommand("/START AbC")).toEqual({ command: "/start", arg: "AbC" });
  });

  it("returns nulls for plain text and non-strings", () => {
    expect(parseCommand("hello")).toEqual({ command: null, arg: null });
    expect(parseCommand(undefined)).toEqual({ command: null, arg: null });
  });
});

describe("appUrl", () => {
  it("uses APP_URL when set and falls back when absent", () => {
    expect(appUrl()).toBe("https://luku.test");
    vi.stubEnv("APP_URL", "");
    expect(appUrl()).toMatch(/^https:\/\//);
  });
});

describe("routing guards", () => {
  it("ignores group chats so nobody can review someone else's words", async () => {
    await handleUpdate({ message: { chat: { id: -100, type: "group" }, from: { id: TG_USER }, text: "/help" } });
    expect(mocks.sent).toHaveLength(0);
  });

  it("ignores updates with no message and no sender", async () => {
    await expect(handleUpdate({ update_id: 1 })).resolves.toBeNull();
    await handleUpdate({ message: { chat: { id: CHAT, type: "private" }, text: "/help" } });
    expect(mocks.sent).toHaveLength(0);
  });

  it("answers /help without needing a link or the database", async () => {
    // /help is the isolation test for a broken deployment: it must exercise
    // the webhook secret, bot token and sendMessage and nothing else.
    mocks.sql = () => { throw new Error("getDb() must not be reached for /help"); };
    mocks.sql.calls = [];

    await handleUpdate(message("/help"));

    expect(lastSent().text).toBe(helpText());
    expect(mocks.sql.calls).toHaveLength(0);
  });
});

describe("linking", () => {
  it("binds the account when the code is valid", async () => {
    mocks.sql = fakeSql([
      [{ user_id: "u1" }],          // consume code
      [LINK],                        // create link
      [{ email: "matti@example.com" }], // account email
    ]);

    await handleUpdate(message("/start Sup3rC0d3"));

    expect(lastSent().text).toContain("✅ Connected");
    expect(lastSent().text).toContain("matti@example.com");
  });

  it("states the reminder schedule in the confirmation", async () => {
    mocks.sql = fakeSql([
      [{ user_id: "u1" }],
      [{ ...LINK, reminders_enabled: true, reminder_hour: 9, timezone: "Europe/Helsinki" }],
      [{ email: "matti@example.com" }],
    ]);

    await handleUpdate(message("/start Sup3rC0d3"));

    // The defaults are invisible otherwise, and this is the cheapest moment to
    // notice the timezone is wrong.
    expect(lastSent().text).toContain("09:00");
    expect(lastSent().text).toContain("Europe/Helsinki");
  });

  it("claims the code by hash, not plaintext", async () => {
    mocks.sql = fakeSql([[{ user_id: "u1" }], [LINK], [[]]]);
    await handleUpdate(message("/start Sup3rC0d3"));
    expect(mocks.sql.calls[0].values).toEqual([sha256("Sup3rC0d3")]);
  });

  it("accepts /link as an equivalent entry point", async () => {
    mocks.sql = fakeSql([[{ user_id: "u1" }], [LINK], [[]]]);
    await handleUpdate(message("/link Sup3rC0d3"));
    expect(lastSent().text).toContain("✅ Connected");
  });

  it("still confirms when the account email cannot be read", async () => {
    mocks.sql = fakeSql([[{ user_id: "u1" }], [LINK], new Error("no users_sync")]);
    await handleUpdate(message("/start Sup3rC0d3"));
    expect(lastSent().text).toContain("✅ Connected");
    expect(lastSent().text).not.toContain("undefined");
  });

  it("reports an expired or already used code", async () => {
    mocks.sql = fakeSql([[]]);
    await handleUpdate(message("/start Sup3rC0d3"));

    expect(lastSent().text).toContain("expired or was already used");
    expect(lastSent().text).toContain("https://luku.test");
  });

  it("explains when the Luku account is already linked to another chat", async () => {
    const dup = Object.assign(new Error("duplicate key value violates unique constraint"), { code: "23505" });
    mocks.sql = fakeSql([[{ user_id: "u1" }], dup]);

    await handleUpdate(message("/start Sup3rC0d3"));

    expect(lastSent().text).toContain("already connected to a different Telegram account");
  });

  it("does not swallow unrelated database failures", async () => {
    mocks.sql = fakeSql([[{ user_id: "u1" }], new Error("connection reset")]);
    await expect(handleUpdate(message("/start Sup3rC0d3"))).rejects.toThrow("connection reset");
  });

  it("stores the sender's telegram id and chat, not values from the message body", async () => {
    mocks.sql = fakeSql([[{ user_id: "u1" }], [LINK], [[]]]);
    await handleUpdate(message("/start Sup3rC0d3"));

    const [telegramUserId, userId, chatId, username] = mocks.sql.calls[1].values;
    expect(telegramUserId).toBe(TG_USER);
    expect(userId).toBe("u1");
    expect(chatId).toBe(CHAT);
    expect(username).toBe("matti");
  });
});

describe("unlinked chats", () => {
  it("answers a bare /start with connection instructions", async () => {
    mocks.sql = fakeSql([[]]);
    await handleUpdate(message("/start"));
    expect(lastSent().text).toBe(connectPrompt());
  });

  it("refuses every other command without leaking anything", async () => {
    for (const cmd of ["/review", "/due", "/disconnect", "/nonsense"]) {
      mocks.sent = [];
      mocks.sql = fakeSql([[]]);
      await handleUpdate(message(cmd));
      expect(lastSent().text).toBe(connectPrompt());
    }
  });
});

describe("linked chats", () => {
  it("tells an already connected user what to do next", async () => {
    mocks.sql = fakeSql([[LINK], []]);
    await handleUpdate(message("/start"));
    expect(lastSent().text).toContain("already connected");
  });

  it("disconnects on request", async () => {
    mocks.sql = fakeSql([[LINK], [], [{ telegram_user_id: TG_USER }]]);
    await handleUpdate(message("/disconnect"));

    expect(lastSent().text).toContain("Disconnected");
    const del = mocks.sql.calls.find((c) => c.text.includes("DELETE FROM telegram_links"));
    expect(del.values).toEqual([TG_USER]);
  });

  it("nudges toward /help on an unknown command", async () => {
    mocks.sql = fakeSql([[LINK], []]);
    await handleUpdate(message("/nonsense"));
    expect(lastSent().text).toContain("/help");
  });

  it("reports the reminder schedule on /settings", async () => {
    const linked = { ...LINK, reminders_enabled: true, reminder_hour: 21, timezone: "Europe/Helsinki" };
    mocks.sql = fakeSql([[linked], []]);

    await handleUpdate(message("/settings"));

    expect(lastSent().text).toContain("21:00");
    expect(lastSent().text).toContain("Europe/Helsinki");
  });

  it("renders /settings from the link already loaded, with no extra query", async () => {
    mocks.sql = fakeSql([[{ ...LINK, reminder_hour: 9, timezone: "Europe/Helsinki" }], []]);

    await handleUpdate(message("/settings"));

    // Only the link lookup and touchLink — the row carries everything rendered.
    expect(mocks.sql.calls).toHaveLength(2);
  });
});

describe("reminder settings", () => {
  const LINKED = { ...LINK, reminder_hour: 9, timezone: "Europe/Helsinki" };
  // touchLink also updates telegram_links, so match the settings write specifically.
  const settingsUpdate = () => mocks.sql.calls.find((c) => c.text.includes("reminders_enabled = COALESCE"));

  it("pauses reminders", async () => {
    mocks.sql = fakeSql([[LINKED], [], [LINKED]]);
    await handleUpdate(message("/pause"));

    expect(lastSent().text).toContain("paused");
    expect(settingsUpdate().values[0]).toBe(false);
  });

  it("resumes reminders and restates the schedule", async () => {
    mocks.sql = fakeSql([[LINKED], [], [LINKED]]);
    await handleUpdate(message("/resume"));

    expect(settingsUpdate().values[0]).toBe(true);
    expect(lastSent().text).toContain("09:00");
    expect(lastSent().text).toContain("Europe/Helsinki");
  });

  it("sets the reminder hour", async () => {
    mocks.sql = fakeSql([[LINKED], [], [LINKED]]);
    await handleUpdate(message("/settime 21"));

    expect(settingsUpdate().values[1]).toBe(21);
    expect(lastSent().text).toContain("21:00");
  });

  it("turns reminders back on when an hour is set while paused", async () => {
    mocks.sql = fakeSql([[{ ...LINKED, reminders_enabled: false }], [], [LINKED]]);
    await handleUpdate(message("/settime 7"));
    expect(settingsUpdate().values[0]).toBe(true);
  });

  it("rejects an hour outside 0-23 without writing", async () => {
    // A bare /settime must not read as midnight.
    for (const bad of ["24", "-1", "9.5", "nine", ""]) {
      mocks.sql = fakeSql([[LINKED], []]);
      await handleUpdate(message(`/settime ${bad}`.trim()));
      expect(lastSent().text).toContain("0 to 23");
      expect(settingsUpdate()).toBeUndefined();
    }
  });

  it("sets a valid IANA timezone", async () => {
    mocks.sql = fakeSql([[LINKED], [], [LINKED]]);
    await handleUpdate(message("/settz America/New_York"));

    expect(settingsUpdate().values[2]).toBe("America/New_York");
    expect(lastSent().text).toContain("America/New_York");
  });

  it("rejects an unknown timezone without writing", async () => {
    mocks.sql = fakeSql([[LINKED], []]);
    await handleUpdate(message("/settz Mars/Olympus"));

    expect(lastSent().text).toContain("IANA");
    expect(settingsUpdate()).toBeUndefined();
  });
});
