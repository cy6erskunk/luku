import { describe, it, expect, vi, beforeEach } from "vitest";
import { callClaude, ocrImage, translateWord } from "../api.js";

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("callClaude", () => {
  it("returns text content from a successful response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ content: [{ type: "text", text: "Hei" }] }),
    }));
    const result = await callClaude("sk-test", [{ role: "user", content: "hi" }]);
    expect(result).toBe("Hei");
  });

  it("throws on non-ok response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: () => Promise.resolve({ error: "Unauthorized" }),
    }));
    await expect(callClaude("bad-key", [])).rejects.toThrow("Unauthorized");
  });

  it("throws HTTP status when error body has no message", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: () => Promise.resolve({}),
    }));
    await expect(callClaude("sk-test", [])).rejects.toThrow("HTTP 500");
  });

  it("returns empty string when content has no text block", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ content: [{ type: "image" }] }),
    }));
    const result = await callClaude("sk-test", []);
    expect(result).toBe("");
  });

  it("sends maxTokens defaulting to 1500", async () => {
    let body;
    vi.stubGlobal("fetch", vi.fn().mockImplementation((_url, opts) => {
      body = JSON.parse(opts.body);
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ content: [] }) });
    }));
    await callClaude("sk-test", []);
    expect(body.maxTokens).toBe(1500);
  });

  it("forwards a custom maxTokens value", async () => {
    let body;
    vi.stubGlobal("fetch", vi.fn().mockImplementation((_url, opts) => {
      body = JSON.parse(opts.body);
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ content: [] }) });
    }));
    await callClaude("sk-test", [], undefined, 250);
    expect(body.maxTokens).toBe(250);
  });
});

describe("ocrImage", () => {
  it("calls /api/claude with an image content block", async () => {
    let body;
    vi.stubGlobal("fetch", vi.fn().mockImplementation((_url, opts) => {
      body = JSON.parse(opts.body);
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ content: [{ type: "text", text: "text" }] }) });
    }));
    await ocrImage("sk-test", "abc123", "image/jpeg");
    const msg = body.messages[0];
    expect(msg.role).toBe("user");
    const imgBlock = msg.content.find((b) => b.type === "image");
    expect(imgBlock.source.data).toBe("abc123");
    expect(imgBlock.source.media_type).toBe("image/jpeg");
  });
});

describe("translateWord", () => {
  it("parses a valid JSON response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ content: [{ type: "text", text: '{"base":"koira","translations":["dog"],"pos":"noun"}' }] }),
    }));
    const result = await translateWord("sk-test", "koiran", "Koiran nimi on Musti.");
    expect(result).toEqual({ base: "koira", translations: ["dog"], pos: "noun" });
  });

  it("strips markdown fences before parsing", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ content: [{ type: "text", text: "```json\n{\"base\":\"kissa\",\"translations\":[\"cat\"],\"pos\":\"noun\"}\n```" }] }),
    }));
    const result = await translateWord("sk-test", "kissaa", "Kissaa ei löydy.");
    expect(result.base).toBe("kissa");
  });

  it("returns fallback object on invalid JSON", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ content: [{ type: "text", text: "not json" }] }),
    }));
    const result = await translateWord("sk-test", "talo", "Talo on iso.");
    expect(result).toEqual({ base: "talo", translations: ["(unavailable)"], pos: "?" });
  });
});
