import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const mocks = vi.hoisted(() => ({ session: null }));

vi.mock("@/lib/auth/server", () => ({
  getAuth: () => ({ getSession: () => Promise.resolve({ data: mocks.session }) }),
}));

const { GET, POST } = await import("../route.js");

const makeRequest = (body) => ({
  json: () => Promise.resolve(body),
});

// NODE_ENV decides whether the key is readable at all, so every test says
// which world it is in rather than inheriting the runner's.
const ORIGINAL_NODE_ENV = process.env.NODE_ENV;
const setEnv = (nodeEnv) => { process.env.NODE_ENV = nodeEnv; };

describe("POST /api/claude", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mocks.session = { user: { id: "u1" } };
    delete process.env.ANTHROPIC_API_KEY;
    setEnv("development");
  });

  afterEach(() => {
    delete process.env.ANTHROPIC_API_KEY;
    setEnv(ORIGINAL_NODE_ENV);
  });

  it("returns 401 when signed out", async () => {
    mocks.session = null;
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const res = await POST(makeRequest({ apiKey: "sk-ant-test", messages: [] }));

    expect(res.status).toBe(401);
    expect((await res.json()).error).toBe("Unauthorized");
    // Spendable credit sits behind this route; an unauthenticated caller must
    // not reach Anthropic at all.
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("returns 400 when neither the caller nor the environment has a key", async () => {
    const req = makeRequest({ messages: [], system: "" });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe("API key required");
  });

  it("falls back to the development key when the caller sends none", async () => {
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

  it("prefers the caller's own key over the development one", async () => {
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

describe("POST /api/claude in production", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mocks.session = { user: { id: "u1" } };
    setEnv("production");
    process.env.ANTHROPIC_API_KEY = "sk-ant-deployment";
  });

  afterEach(() => {
    delete process.env.ANTHROPIC_API_KEY;
    setEnv(ORIGINAL_NODE_ENV);
  });

  it("ignores ANTHROPIC_API_KEY entirely", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const res = await POST(makeRequest({ messages: [] }));

    // A deployed key would be spent by whoever is signed in rather than by
    // whoever owns it, so a keyless request is an error, not a free ride.
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("API key required");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("still forwards a key the caller supplies", async () => {
    let capturedHeaders;
    vi.stubGlobal("fetch", vi.fn().mockImplementation((_url, opts) => {
      capturedHeaders = opts.headers;
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ content: [] }) });
    }));

    await POST(makeRequest({ apiKey: "sk-ant-personal", messages: [] }));

    expect(capturedHeaders["x-api-key"]).toBe("sk-ant-personal");
  });
});

describe("GET /api/claude", () => {
  beforeEach(() => {
    mocks.session = { user: { id: "u1" } };
    delete process.env.ANTHROPIC_API_KEY;
    setEnv("development");
  });

  afterEach(() => {
    delete process.env.ANTHROPIC_API_KEY;
    setEnv(ORIGINAL_NODE_ENV);
  });

  it("returns 401 when signed out", async () => {
    mocks.session = null;
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("reports whether a development key is available", async () => {
    expect((await (await GET()).json()).serverKey).toBe(false);

    process.env.ANTHROPIC_API_KEY = "sk-ant-deployment";
    expect((await (await GET()).json()).serverKey).toBe(true);
  });

  it("reports no key in production, however the variable is set", async () => {
    process.env.ANTHROPIC_API_KEY = "sk-ant-deployment";
    setEnv("production");

    // The key screen has to appear on a deployment, so this answer is what
    // keeps the client from promising a key it will not get.
    expect((await (await GET()).json()).serverKey).toBe(false);
  });

  it("never returns the key itself", async () => {
    process.env.ANTHROPIC_API_KEY = "sk-ant-deployment";
    const body = JSON.stringify(await (await GET()).json());
    expect(body).not.toContain("sk-ant-deployment");
  });
});
