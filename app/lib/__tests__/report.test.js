// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const mocks = vi.hoisted(() => ({ captureException: vi.fn() }));
vi.mock("@sentry/nextjs", () => ({ captureException: mocks.captureException }));

const { reportClientError } = await import("../report.js");

const setOnline = (value) =>
  Object.defineProperty(navigator, "onLine", { value, configurable: true });

beforeEach(() => {
  mocks.captureException.mockReset();
  vi.spyOn(console, "error").mockImplementation(() => {});
  setOnline(true);
});

afterEach(() => vi.restoreAllMocks());

describe("reportClientError", () => {
  it("sends the exception to Sentry, tagged with where it came from", () => {
    const err = new Error("boom");
    reportClientError("load words", err);
    expect(mocks.captureException).toHaveBeenCalledWith(err, { tags: { where: "load words" } });
  });

  it("still logs to the console", () => {
    const err = new Error("boom");
    reportClientError("load words", err);
    expect(console.error).toHaveBeenCalledWith("load words", err);
  });

  it("does not report while the browser is offline", () => {
    // Nothing at the other end to fix, and a reader on a train would report
    // every retry.
    setOnline(false);
    reportClientError("load words", new Error("Failed to fetch"));
    expect(mocks.captureException).not.toHaveBeenCalled();
    expect(console.error).toHaveBeenCalled();
  });
});
