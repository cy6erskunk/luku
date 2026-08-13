import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  answerCallbackQuery,
  editMessageText,
  inlineKeyboard,
  isBlockedError,
  sendMessage,
  tgCall,
} from "../api.js";

const okResponse = (result = {}) => ({ json: () => Promise.resolve({ ok: true, result }) });

beforeEach(() => {
  vi.stubEnv("TELEGRAM_BOT_TOKEN", "123:ABC");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("tgCall", () => {
  it("posts JSON to the method URL built from the bot token", async () => {
    let url, opts;
    vi.stubGlobal("fetch", vi.fn((u, o) => { url = u; opts = o; return Promise.resolve(okResponse({ message_id: 9 })); }));

    const result = await tgCall("sendMessage", { chat_id: 42, text: "hi" });

    expect(url).toBe("https://api.telegram.org/bot123:ABC/sendMessage");
    expect(opts.method).toBe("POST");
    expect(opts.headers["Content-Type"]).toBe("application/json");
    expect(JSON.parse(opts.body)).toEqual({ chat_id: 42, text: "hi" });
    expect(result).toEqual({ message_id: 9 });
  });

  it("throws with Telegram's description and error code when ok is false", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve({
      json: () => Promise.resolve({ ok: false, error_code: 403, description: "Forbidden: bot was blocked by the user" }),
    })));

    await expect(tgCall("sendMessage", {})).rejects.toThrow(/blocked by the user/);
  });

  it("tags the thrown error so blocked users can be detected", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve({
      json: () => Promise.resolve({ ok: false, error_code: 403, description: "Forbidden" }),
    })));

    const err = await tgCall("sendMessage", {}).catch((e) => e);
    expect(err.code).toBe(403);
    expect(err.method).toBe("sendMessage");
    expect(isBlockedError(err)).toBe(true);
  });

  it("does not treat other failures as blocked", async () => {
    expect(isBlockedError({ code: 400 })).toBe(false);
    expect(isBlockedError(null)).toBe(false);
  });

  it("throws when the bot token is missing", async () => {
    vi.stubEnv("TELEGRAM_BOT_TOKEN", "");
    await expect(tgCall("getMe")).rejects.toThrow(/TELEGRAM_BOT_TOKEN/);
  });
});

describe("message helpers", () => {
  it("sendMessage merges extra options such as a keyboard", async () => {
    let body;
    vi.stubGlobal("fetch", vi.fn((_u, o) => { body = JSON.parse(o.body); return Promise.resolve(okResponse()); }));

    await sendMessage(42, "hello", inlineKeyboard([[{ text: "Go", callback_data: "r" }]]));

    expect(body.chat_id).toBe(42);
    expect(body.text).toBe("hello");
    expect(body.reply_markup.inline_keyboard[0][0].text).toBe("Go");
  });

  it("editMessageText targets a specific message", async () => {
    let body;
    vi.stubGlobal("fetch", vi.fn((_u, o) => { body = JSON.parse(o.body); return Promise.resolve(okResponse()); }));

    await editMessageText(42, 7, "updated");

    expect(body).toMatchObject({ chat_id: 42, message_id: 7, text: "updated" });
  });

  it("answerCallbackQuery omits text when none is given", async () => {
    let body;
    vi.stubGlobal("fetch", vi.fn((_u, o) => { body = JSON.parse(o.body); return Promise.resolve(okResponse()); }));

    await answerCallbackQuery("cbq-1");
    expect(body).toEqual({ callback_query_id: "cbq-1" });

    await answerCallbackQuery("cbq-2", "Done");
    expect(body).toEqual({ callback_query_id: "cbq-2", text: "Done" });
  });
});
