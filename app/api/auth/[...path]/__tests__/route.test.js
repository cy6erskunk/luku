/**
 * The auth catch-all is a thin proxy; what it owns is its failure. A
 * misconfigured deployment throws before any request reaches Neon Auth, and
 * the reader should see a sentence while the operator gets the cause.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({ getAuth: null, captureException: vi.fn() }));

vi.mock("@sentry/nextjs", () => ({ captureException: mocks.captureException }));
vi.mock("@/lib/auth/server", () => ({ getAuth: () => mocks.getAuth() }));

const ctx = { params: Promise.resolve({ path: ["sign-in", "social"] }) };

beforeEach(() => {
  vi.resetModules();
  mocks.captureException.mockClear();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("/api/auth/[...path]", () => {
  it("answers a configuration failure with a readable message and reports the cause", async () => {
    const cause = new Error("cookies.secret must be at least 32 characters long");
    mocks.getAuth = () => { throw cause; };
    const { POST } = await import("../route.js");

    const res = await POST(new Request("https://luku.test/api/auth/sign-in/social", { method: "POST" }), ctx);
    const body = await res.json();

    expect(res.status).toBe(500);
    // `message` is the field the auth client displays; without it the reader
    // sees "HTTP 500".
    expect(body.message).toBe("Sign-in is unavailable right now.");
    expect(JSON.stringify(body)).not.toContain("cookies.secret");
    expect(mocks.captureException).toHaveBeenCalledWith(cause);
  });

  it("passes a request through to the Neon Auth handler by method", async () => {
    const upstream = { GET: vi.fn(() => new Response("get")), POST: vi.fn(() => new Response("post")) };
    mocks.getAuth = () => ({ handler: () => upstream });
    const { GET, POST } = await import("../route.js");

    const get = new Request("https://luku.test/api/auth/get-session");
    expect(await (await GET(get, ctx)).text()).toBe("get");
    expect(upstream.GET).toHaveBeenCalledWith(get, ctx);
    expect(await (await POST(new Request(get, { method: "POST" }), ctx)).text()).toBe("post");
    expect(mocks.captureException).not.toHaveBeenCalled();
  });
});
