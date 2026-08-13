import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

const mocks = vi.hoisted(() => ({ sent: [] }));

vi.mock("../api.js", () => ({
  sendMessage: (chatId, text, extra) => {
    mocks.sent.push({ chatId, text, extra });
    return Promise.resolve({ message_id: mocks.sent.length });
  },
}));

const { handleUpdate, helpText, parseCommand, connectPrompt, appUrl } = await import("../handlers.js");

const privateMessage = (text) => ({ message: { chat: { id: 42, type: "private" }, from: { id: 7 }, text } });

beforeEach(() => {
  mocks.sent = [];
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

  it("tolerates extra whitespace", () => {
    expect(parseCommand("  /start   abc  ")).toEqual({ command: "/start", arg: "abc" });
  });

  it("returns nulls for plain text and non-strings", () => {
    expect(parseCommand("hello")).toEqual({ command: null, arg: null });
    expect(parseCommand(undefined)).toEqual({ command: null, arg: null });
  });
});

describe("appUrl", () => {
  it("uses APP_URL when set", () => {
    expect(appUrl()).toBe("https://luku.test");
  });

  it("falls back when APP_URL is absent", () => {
    vi.stubEnv("APP_URL", "");
    expect(appUrl()).toMatch(/^https:\/\//);
  });
});

describe("handleUpdate", () => {
  it("answers a bare /start with connection instructions", async () => {
    await handleUpdate(privateMessage("/start"));
    expect(mocks.sent).toHaveLength(1);
    expect(mocks.sent[0].chatId).toBe(42);
    expect(mocks.sent[0].text).toBe(connectPrompt());
    expect(mocks.sent[0].text).toContain("https://luku.test");
  });

  it("answers /help with the command list", async () => {
    await handleUpdate(privateMessage("/help"));
    expect(mocks.sent[0].text).toBe(helpText());
    expect(mocks.sent[0].text).toContain("/review");
  });

  it("nudges toward /help on an unknown command", async () => {
    await handleUpdate(privateMessage("/nonsense"));
    expect(mocks.sent[0].text).toContain("/help");
  });

  it("ignores group chats so nobody can review someone else's words", async () => {
    await handleUpdate({ message: { chat: { id: -100, type: "group" }, from: { id: 7 }, text: "/help" } });
    expect(mocks.sent).toHaveLength(0);
  });

  it("ignores updates with no message", async () => {
    await expect(handleUpdate({ update_id: 1 })).resolves.toBeNull();
    await expect(handleUpdate(undefined)).resolves.toBeNull();
    expect(mocks.sent).toHaveLength(0);
  });
});
