import { describe, it, expect } from "vitest";
import { REDACTED, redactDeep, redactString } from "../redact.js";

const BOT_URL = "https://api.telegram.org/bot123456:ABC-DEF_ghi/sendMessage";

describe("redactString", () => {
  it("removes a bot token from an API URL", () => {
    expect(redactString(BOT_URL)).toBe("https://api.telegram.org/bot[REDACTED]/sendMessage");
  });

  it("removes a Vercel protection-bypass token from a query string", () => {
    const url = "https://x.vercel.app/api/telegram/webhook?x-vercel-protection-bypass=SECRET&a=1";
    const out = redactString(url);
    expect(out).not.toContain("SECRET");
    expect(out).toContain("a=1");
  });

  it("handles both in one string", () => {
    const out = redactString(`${BOT_URL}?x-vercel-protection-bypass=SECRET`);
    expect(out).not.toContain("ABC-DEF_ghi");
    expect(out).not.toContain("SECRET");
  });

  it("removes an Anthropic API key, keeping the text around it", () => {
    const out = redactString("Bad key: sk-ant-api03-Abc_123-xyz was rejected");
    expect(out).not.toContain("api03-Abc_123-xyz");
    expect(out).toBe(`Bad key: sk-ant-${REDACTED} was rejected`);
  });

  it("removes an admin key, which carries the same prefix", () => {
    expect(redactString("sk-ant-admin01-SECRET")).toBe(`sk-ant-${REDACTED}`);
  });

  it("leaves a key-shaped string from another vendor alone", () => {
    // The prefix is what identifies an Anthropic key; anything else is not
    // ours to guess at, and over-matching would scrub useful context.
    expect(redactString("sk-proj-abc123")).toBe("sk-proj-abc123");
  });

  it("leaves ordinary strings and non-strings alone", () => {
    expect(redactString("https://api.telegram.org/getMe")).toBe("https://api.telegram.org/getMe");
    expect(redactString(42)).toBe(42);
    expect(redactString(null)).toBeNull();
  });
});

describe("redactDeep", () => {
  it("redacts the webhook secret header Telegram sends on every delivery", () => {
    const event = { request: { headers: { "X-Telegram-Bot-Api-Secret-Token": "webhook-secret" } } };
    expect(redactDeep(event).request.headers["X-Telegram-Bot-Api-Secret-Token"]).toBe(REDACTED);
  });

  it("matches secret header names case-insensitively", () => {
    const event = { headers: { "x-telegram-bot-api-secret-token": "s", AUTHORIZATION: "Bearer cron" } };
    redactDeep(event);
    expect(event.headers["x-telegram-bot-api-secret-token"]).toBe(REDACTED);
    expect(event.headers.AUTHORIZATION).toBe(REDACTED);
  });

  it("redacts a credential header whatever shape its value takes", () => {
    // Header values can arrive as arrays; keying off the name covers those too.
    const event = { headers: { authorization: ["Bearer a", "Bearer b"], cookie: { v: "x" } } };
    redactDeep(event);
    expect(event.headers.authorization).toBe(REDACTED);
    expect(event.headers.cookie).toBe(REDACTED);
  });

  it("redacts the API key field /api/claude receives in its request body", () => {
    // The route's session check runs outside its try/catch, so a throw there
    // is reported with the request — body included — rather than caught.
    const event = { request: { data: { apiKey: "sk-ant-api03-SECRET", maxTokens: 1500 } } };
    redactDeep(event);
    expect(event.request.data.apiKey).toBe(REDACTED);
    expect(event.request.data.maxTokens).toBe(1500);
  });

  it("redacts the x-api-key header the proxy sends to Anthropic", () => {
    const event = { headers: { "X-Api-Key": "sk-ant-api03-SECRET" } };
    redactDeep(event);
    expect(event.headers["X-Api-Key"]).toBe(REDACTED);
  });

  it("reaches a key nested in a serialized body, under no telling field name", () => {
    const event = { extra: { payload: '{"apiKey":"sk-ant-api03-SECRET"}' } };
    redactDeep(event);
    expect(event.extra.payload).not.toContain("api03-SECRET");
  });

  it("reaches a bot token nested in a span description", () => {
    const event = { spans: [{ description: `POST ${BOT_URL}` }] };
    expect(redactDeep(event).spans[0].description).not.toContain("ABC-DEF_ghi");
  });

  it("leaves everything else untouched", () => {
    const event = { request: { headers: { "user-agent": "TelegramBot" } }, level: "error", count: 3 };
    redactDeep(event);
    expect(event.request.headers["user-agent"]).toBe("TelegramBot");
    expect(event.level).toBe("error");
    expect(event.count).toBe(3);
  });

  it("mutates in place so the SDK keeps its object", () => {
    const event = { a: { b: BOT_URL } };
    expect(redactDeep(event)).toBe(event);
  });

  it("terminates on a deeply nested or cyclic structure", () => {
    const cyclic = { headers: { authorization: "Bearer x" } };
    cyclic.self = cyclic;
    expect(() => redactDeep(cyclic)).not.toThrow();
    expect(cyclic.headers.authorization).toBe(REDACTED);
  });

  it("ignores non-objects", () => {
    expect(redactDeep(null)).toBeNull();
    expect(redactDeep("x")).toBe("x");
  });
});
