import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const mocks = vi.hoisted(() => ({ session: null }));

vi.mock("@/lib/auth/server", () => ({
  getAuth: () => ({ getSession: () => Promise.resolve({ data: mocks.session }) }),
}));

const { GET, POST } = await import("../route.js");

const makeRequest = (body) => ({
  json: () => Promise.resolve(body),
});

describe("POST /api/claude", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mocks.session = { user: { id: "u1" } };
    delete process.env.ANTHROPIC_API_KEY;
  });

  afterEach(() => {
    delete process.env.ANTHROPIC_API_KEY;
  });

  it("returns 401 when signed out", async () => {
    mocks.session = null;
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const res = await POST(makeRequest({ apiKey: "sk-ant-test", messages: [] }));

    expect(res.status).toBe(401);
    expect((await res.json()).error).toBe("Unauthorized");
    // The deployment key is spendable credit; an unauthenticated caller must
    // not reach Anthropic at all.
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("returns 400 when neither the caller nor the deployment has a key", async () => {
    const req = makeRequest({ messages: [], system: "" });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe("API key required");
  });

  it("falls back to the deployment key when the caller sends none", async () => {
    process.env.ANTHROPIC_API_KEY = "sk-ant-deployment";
    let capturedHeaders;
    vi.stubGlobal("fetch", vi.fn().mockImplementation((_url, opts) => {
      capturedHeaders = opts.headers;
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ content: [] }) });
    }));

    const res = await POST(makeRequest({ messages: [] }));

    expect(res.status).toBe(200);
    expect(capturedHeaders["x-api-key"]).toBe("sk-ant-deployment");
  });

  it("prefers the caller's own key over the deployment's", async () => {
    process.env.ANTHROPIC_API_KEY = "sk-ant-deployment";
    let capturedHeaders;
    vi.stubGlobal("fetch", vi.fn().mockImplementation((_url, opts) => {
      capturedHeaders = opts.headers;
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ content: [] }) });
    }));

    await POST(makeRequest({ apiKey: "sk-ant-personal", messages: [] }));

    expect(capturedHeaders["x-api-key"]).toBe("sk-ant-personal");
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

describe("GET /api/claude", () => {
  beforeEach(() => {
    mocks.session = { user: { id: "u1" } };
    delete process.env.ANTHROPIC_API_KEY;
  });

  afterEach(() => {
    delete process.env.ANTHROPIC_API_KEY;
  });

  it("returns 401 when signed out", async () => {
    mocks.session = null;
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("reports whether the deployment has a key", async () => {
    expect((await (await GET()).json()).serverKey).toBe(false);

    process.env.ANTHROPIC_API_KEY = "sk-ant-deployment";
    expect((await (await GET()).json()).serverKey).toBe(true);
  });

  it("never returns the key itself", async () => {
    process.env.ANTHROPIC_API_KEY = "sk-ant-deployment";
    const body = JSON.stringify(await (await GET()).json());
    expect(body).not.toContain("sk-ant-deployment");
  });
});
