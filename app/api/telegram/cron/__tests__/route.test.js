import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

const mocks = vi.hoisted(() => ({ result: null, throwWith: null, runs: 0 }));

vi.mock("@/lib/db", () => ({ getDb: () => "sql" }));
vi.mock("@/lib/telegram/reminders", () => ({
  sendReminders: () => {
    mocks.runs += 1;
    if (mocks.throwWith) return Promise.reject(mocks.throwWith);
    return Promise.resolve(mocks.result);
  },
}));
vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn() }));

const { POST } = await import("../route.js");
const Sentry = await import("@sentry/nextjs");

const SECRET = "cron-s3cret";

const makeRequest = (auth) => ({
  headers: { get: (name) => (name === "authorization" ? auth ?? null : null) },
});

beforeEach(() => {
  vi.stubEnv("TELEGRAM_CRON_SECRET", SECRET);
  mocks.result = { considered: 2, sent: 1, skipped: 1, blocked: 0, failed: 0 };
  mocks.throwWith = null;
  mocks.runs = 0;
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe("POST /api/telegram/cron", () => {
  it("rejects a request with no Authorization header", async () => {
    expect((await POST(makeRequest(undefined))).status).toBe(401);
    expect(mocks.runs).toBe(0);
  });

  it("rejects a wrong bearer token", async () => {
    expect((await POST(makeRequest("Bearer nope"))).status).toBe(401);
    expect(mocks.runs).toBe(0);
  });

  it("rejects a token that only shares a prefix", async () => {
    expect((await POST(makeRequest(`Bearer ${SECRET.slice(0, -1)}`))).status).toBe(401);
  });

  it("rejects a correct token sent without the Bearer scheme", async () => {
    expect((await POST(makeRequest(SECRET))).status).toBe(401);
  });

  it("refuses everything when no cron secret is configured", async () => {
    vi.stubEnv("TELEGRAM_CRON_SECRET", "");
    expect((await POST(makeRequest(`Bearer ${SECRET}`))).status).toBe(401);
    expect(mocks.runs).toBe(0);
  });

  it("runs the reminder pass and reports what it did", async () => {
    const res = await POST(makeRequest(`Bearer ${SECRET}`));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ considered: 2, sent: 1, skipped: 1, blocked: 0, failed: 0 });
    expect(mocks.runs).toBe(1);
  });

  it("returns 500 and reports to Sentry when the run throws", async () => {
    mocks.throwWith = new Error("database unreachable");

    const res = await POST(makeRequest(`Bearer ${SECRET}`));

    expect(res.status).toBe(500);
    expect(Sentry.captureException).toHaveBeenCalledWith(mocks.throwWith);
  });
});
