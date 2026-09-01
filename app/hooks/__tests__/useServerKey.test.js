// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { useServerKey } from "../useServerKey.js";

const mockFetch = (response) => vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(response)));
const mockJson = (data) => mockFetch({ ok: true, json: () => Promise.resolve(data) });

afterEach(() => vi.unstubAllGlobals());

describe("useServerKey", () => {
  it("reports the deployment key the route advertises", async () => {
    mockJson({ serverKey: true });
    const { result } = renderHook(() => useServerKey("user-1"));

    await waitFor(() => expect(result.current.checking).toBe(false));
    expect(result.current.serverKey).toBe(true);
  });

  it("reports no key when the deployment has none", async () => {
    mockJson({ serverKey: false });
    const { result } = renderHook(() => useServerKey("user-1"));

    await waitFor(() => expect(result.current.checking).toBe(false));
    expect(result.current.serverKey).toBe(false);
  });

  it("starts out checking so the key screen doesn't flash", () => {
    vi.stubGlobal("fetch", vi.fn(() => new Promise(() => {})));
    const { result } = renderHook(() => useServerKey("user-1"));

    expect(result.current.checking).toBe(true);
    expect(result.current.serverKey).toBe(false);
  });

  it("doesn't probe until there is a user", () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { result } = renderHook(() => useServerKey(null));

    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.current.checking).toBe(false);
  });

  it("falls back to no key when the probe fails", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new Error("offline"))));
    const { result } = renderHook(() => useServerKey("user-1"));

    await waitFor(() => expect(result.current.checking).toBe(false));
    expect(result.current.serverKey).toBe(false);
  });

  it("treats an unauthorized probe as no key", async () => {
    mockFetch({ ok: false, status: 401, json: () => Promise.resolve({ error: "Unauthorized" }) });
    const { result } = renderHook(() => useServerKey("user-1"));

    await waitFor(() => expect(result.current.checking).toBe(false));
    expect(result.current.serverKey).toBe(false);
  });
});
