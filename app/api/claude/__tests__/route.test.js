import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST } from "../route.js";

const makeRequest = (body) => ({
  json: () => Promise.resolve(body),
});

describe("POST /api/claude", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("returns 400 when apiKey is missing", async () => {
    const req = makeRequest({ messages: [], system: "" });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe("API key required");
  });

  it("proxies successful Anthropic response", async () => {
    const mockResponseBody = {
      content: [{ type: "text", text: "Hei maailma" }],
    };
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve(mockResponseBody),
      })
    );

    const req = makeRequest({
      apiKey: "sk-ant-test",
      messages: [{ role: "user", content: "Hello" }],
      system: "You are helpful.",
      maxTokens: 100,
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.content[0].text).toBe("Hei maailma");
  });

  it("includes system in the Anthropic request body when provided", async () => {
    let capturedBody;
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((_url, opts) => {
        capturedBody = JSON.parse(opts.body);
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ content: [] }),
        });
      })
    );

    const req = makeRequest({
      apiKey: "sk-ant-test",
      messages: [],
      system: "Be concise.",
    });

    await POST(req);
    expect(capturedBody.system).toBe("Be concise.");
  });

  it("omits system from request body when not provided", async () => {
    let capturedBody;
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((_url, opts) => {
        capturedBody = JSON.parse(opts.body);
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ content: [] }),
        });
      })
    );

    const req = makeRequest({ apiKey: "sk-ant-test", messages: [] });
    await POST(req);
    expect(capturedBody.system).toBeUndefined();
  });

  it("forwards Anthropic error status and message", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        json: () =>
          Promise.resolve({ error: { message: "Invalid API key" } }),
      })
    );

    const req = makeRequest({
      apiKey: "bad-key",
      messages: [],
    });

    const res = await POST(req);
    expect(res.status).toBe(401);
    const data = await res.json();
    expect(data.error).toBe("Invalid API key");
  });

  it("returns 500 on unexpected exception", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("Network failure"))
    );

    const req = makeRequest({ apiKey: "sk-ant-test", messages: [] });
    const res = await POST(req);
    expect(res.status).toBe(500);
    const data = await res.json();
    expect(data.error).toBe("Network failure");
  });

  it("uses default maxTokens of 1500 when not specified", async () => {
    let capturedBody;
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((_url, opts) => {
        capturedBody = JSON.parse(opts.body);
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ content: [] }),
        });
      })
    );

    const req = makeRequest({ apiKey: "sk-ant-test", messages: [] });
    await POST(req);
    expect(capturedBody.max_tokens).toBe(1500);
  });
});
