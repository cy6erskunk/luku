import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

const mocks = vi.hoisted(() => ({ handled: [], throwOnHandle: null }));

vi.mock("@/lib/telegram/handlers", () => ({
  handleUpdate: (update) => {
    if (mocks.throwOnHandle) return Promise.reject(mocks.throwOnHandle);
    mocks.handled.push(update);
    return Promise.resolve();
  },
}));
vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn(), captureMessage: vi.fn() }));

const { POST } = await import("../route.js");
const Sentry = await import("@sentry/nextjs");

const SECRET = "s3cret-token";

const makeRequest = (body, secret) => ({
  headers: { get: (name) => (name === "x-telegram-bot-api-secret-token" ? secret ?? null : null) },
  json: () => Promise.resolve(body),
});

const UPDATE = { update_id: 1, message: { chat: { id: 42, type: "private" }, text: "/help" } };

beforeEach(() => {
  vi.stubEnv("TELEGRAM_WEBHOOK_SECRET", SECRET);
  mocks.handled = [];
  mocks.throwOnHandle = null;
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe("POST /api/telegram/webhook", () => {
  it("rejects a request with no secret header", async () => {
    const res = await POST(makeRequest(UPDATE, undefined));
    expect(res.status).toBe(401);
    expect(mocks.handled).toHaveLength(0);
  });

  it("rejects a wrong secret", async () => {
    const res = await POST(makeRequest(UPDATE, "wrong-token"));
    expect(res.status).toBe(401);
    expect(mocks.handled).toHaveLength(0);
  });

  it("rejects a secret that only shares a prefix", async () => {
    const res = await POST(makeRequest(UPDATE, SECRET.slice(0, -1)));
    expect(res.status).toBe(401);
  });

  it("reports a wrong secret, which is otherwise invisible", async () => {
    await POST(makeRequest(UPDATE, "wrong-token"));
    expect(Sentry.captureMessage).toHaveBeenCalledWith("Telegram webhook secret mismatch", "warning");
  });

  it("stays quiet for a request with no secret header at all", async () => {
    // Scanners hitting the path should not fill Sentry.
    await POST(makeRequest(UPDATE, undefined));
    expect(Sentry.captureMessage).not.toHaveBeenCalled();
  });

  it("refuses everything when the server has no secret configured", async () => {
    vi.stubEnv("TELEGRAM_WEBHOOK_SECRET", "");
    const res = await POST(makeRequest(UPDATE, SECRET));
    expect(res.status).toBe(401);
    expect(mocks.handled).toHaveLength(0);
  });

  it("accepts a correct secret and forwards the update", async () => {
    const res = await POST(makeRequest(UPDATE, SECRET));
    expect(res.status).toBe(200);
    expect(mocks.handled).toEqual([UPDATE]);
  });

  it("returns 200 for an update it does not understand", async () => {
    const res = await POST(makeRequest({ update_id: 2, poll: {} }, SECRET));
    expect(res.status).toBe(200);
  });

  it("returns 200 and reports to Sentry when handling throws", async () => {
    mocks.throwOnHandle = new Error("boom");

    const res = await POST(makeRequest(UPDATE, SECRET));

    // A non-2xx would make Telegram redeliver the same update on a schedule.
    expect(res.status).toBe(200);
    expect(Sentry.captureException).toHaveBeenCalledWith(mocks.throwOnHandle);
  });

  it("returns 200 when the body is not valid JSON", async () => {
    const req = makeRequest(null, SECRET);
    req.json = () => Promise.reject(new SyntaxError("bad json"));

    const res = await POST(req);
    expect(res.status).toBe(200);
  });
});
