import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { waitForTesseract, getOrCreateWorker, resetTesseractWorker, ocrLocal } from "../ocr.js";

beforeEach(() => {
  vi.restoreAllMocks();
  resetTesseractWorker();
});

afterEach(() => {
  resetTesseractWorker();
  delete global.window;
});

describe("waitForTesseract", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("resolves immediately when window.Tesseract is already set", async () => {
    const fakeTesseract = { createWorker: vi.fn() };
    global.window = { Tesseract: fakeTesseract };
    await expect(waitForTesseract()).resolves.toBe(fakeTesseract);
  });

  it("resolves once window.Tesseract appears", async () => {
    global.window = {};
    const fakeTesseract = { createWorker: vi.fn() };
    const promise = waitForTesseract(2000);
    global.window.Tesseract = fakeTesseract;
    await vi.advanceTimersByTimeAsync(110); // past one 100ms polling interval
    await expect(promise).resolves.toBe(fakeTesseract);
  });

  it("rejects after timeout when Tesseract never loads", async () => {
    global.window = {};
    // Timeout is 200ms; rejection fires at the first interval tick where
    // Date.now() - t0 > 200, which is the 300ms tick (100ms polling interval).
    const promise = waitForTesseract(200);
    // Suppress unhandled-rejection warning — the rejection fires inside
    // setInterval before the await below can attach its own handler.
    promise.catch(() => {});
    await vi.advanceTimersByTimeAsync(310);
    await expect(promise).rejects.toThrow("Tesseract.js failed to load");
  });
});

describe("resetTesseractWorker", () => {
  it("is a no-op when no worker exists", () => {
    expect(() => resetTesseractWorker()).not.toThrow();
  });

  it("terminates the worker when one exists", async () => {
    const terminate = vi.fn().mockResolvedValue(undefined);
    const fakeWorker = { recognize: vi.fn(), setParameters: vi.fn().mockResolvedValue(undefined), terminate };
    const fakeCreateWorker = vi.fn().mockResolvedValue(fakeWorker);
    global.window = { Tesseract: { createWorker: fakeCreateWorker } };

    await getOrCreateWorker();
    resetTesseractWorker();
    // Flush the microtask queue so the resolved .then(w => w.terminate()) runs
    await Promise.resolve();
    await Promise.resolve();
    expect(terminate).toHaveBeenCalled();
  });
});

describe("getOrCreateWorker", () => {
  it("returns the same promise on repeated calls", async () => {
    const fakeWorker = { setParameters: vi.fn().mockResolvedValue(undefined) };
    global.window = { Tesseract: { createWorker: vi.fn().mockResolvedValue(fakeWorker) } };

    const p1 = getOrCreateWorker();
    const p2 = getOrCreateWorker();
    expect(p1).toBe(p2);
    await p1;
  });

  it("creates a new worker after reset", async () => {
    const fakeWorker = { setParameters: vi.fn().mockResolvedValue(undefined), terminate: vi.fn().mockResolvedValue(undefined) };
    const createWorker = vi.fn().mockResolvedValue(fakeWorker);
    global.window = { Tesseract: { createWorker } };

    await getOrCreateWorker();
    resetTesseractWorker();
    await getOrCreateWorker();
    expect(createWorker).toHaveBeenCalledTimes(2);
  });
});

describe("ocrLocal", () => {
  it("returns recognized text", async () => {
    const fakeWorker = {
      setParameters: vi.fn().mockResolvedValue(undefined),
      terminate: vi.fn().mockResolvedValue(undefined),
      recognize: vi.fn().mockResolvedValue({ data: { text: "Hei maailma" } }),
    };
    global.window = { Tesseract: { createWorker: vi.fn().mockResolvedValue(fakeWorker) } };

    const text = await ocrLocal("abc123", "image/jpeg");
    expect(text).toBe("Hei maailma");
  });

  it("calls the status callback with initial message", async () => {
    const fakeWorker = {
      setParameters: vi.fn().mockResolvedValue(undefined),
      terminate: vi.fn().mockResolvedValue(undefined),
      recognize: vi.fn().mockResolvedValue({ data: { text: "" } }),
    };
    global.window = { Tesseract: { createWorker: vi.fn().mockResolvedValue(fakeWorker) } };

    const onStatus = vi.fn();
    await ocrLocal("abc123", "image/jpeg", onStatus);
    expect(onStatus).toHaveBeenCalledWith("Loading OCR engine…", 0);
  });
});
