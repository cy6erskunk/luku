// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { useBundles } from "../useBundles.js";

const KOTIMAA = { id: 1, name: "Kotimaa" };
const LUKU3 = { id: 2, name: "Luku 3" };

function mockFetch(response) {
  vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(response)));
}

function mockFetchJson(data) {
  mockFetch({ ok: true, json: () => Promise.resolve(data) });
}

async function loaded(bundles) {
  mockFetchJson({ bundles });
  const { result } = renderHook(() => useBundles("user-1"));
  await waitFor(() => expect(result.current.loadingBundles).toBe(false));
  return result;
}

beforeEach(() => localStorage.clear());
afterEach(() => vi.unstubAllGlobals());

describe("useBundles – loading", () => {
  it("loads the user's bundles", async () => {
    const result = await loaded([KOTIMAA, LUKU3]);
    expect(result.current.bundles).toEqual([KOTIMAA, LUKU3]);
  });

  it("clears the list and stops loading with no user", async () => {
    mockFetchJson({ bundles: [KOTIMAA] });
    const { result, rerender } = renderHook(({ uid }) => useBundles(uid), { initialProps: { uid: "user-1" } });
    await waitFor(() => expect(result.current.bundles).toHaveLength(1));
    rerender({ uid: null });
    await waitFor(() => expect(result.current.loadingBundles).toBe(false));
    expect(result.current.bundles).toEqual([]);
  });

  it("survives a failed fetch with an empty list", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new Error("offline"))));
    const { result } = renderHook(() => useBundles("user-1"));
    await waitFor(() => expect(result.current.loadingBundles).toBe(false));
    expect(result.current.bundles).toEqual([]);
  });
});

describe("useBundles – the active bundle", () => {
  it("remembers the selection across a remount", async () => {
    const result = await loaded([KOTIMAA]);
    act(() => result.current.setActiveBundleId(1));
    expect(localStorage.getItem("luku_bundle")).toBe("1");

    const again = await loaded([KOTIMAA]);
    expect(again.current.activeBundleId).toBe(1);
  });

  it("forgets a remembered bundle the account no longer has", async () => {
    // Deleted in another tab, or belonging to the previously signed-in user.
    localStorage.setItem("luku_bundle", "99");
    const result = await loaded([KOTIMAA]);
    await waitFor(() => expect(result.current.activeBundleId).toBeNull());
    expect(localStorage.getItem("luku_bundle")).toBeNull();
  });

  it("does not drop the selection while the list is still loading", () => {
    localStorage.setItem("luku_bundle", "1");
    vi.stubGlobal("fetch", vi.fn(() => new Promise(() => {})));
    const { result } = renderHook(() => useBundles("user-1"));
    expect(result.current.loadingBundles).toBe(true);
    expect(result.current.activeBundleId).toBe(1);
  });

  it("ignores a junk remembered value", async () => {
    localStorage.setItem("luku_bundle", "not-a-number");
    const result = await loaded([KOTIMAA]);
    expect(result.current.activeBundleId).toBeNull();
  });

  it("clears the selection", async () => {
    const result = await loaded([KOTIMAA]);
    act(() => result.current.setActiveBundleId(1));
    act(() => result.current.setActiveBundleId(null));
    expect(result.current.activeBundleId).toBeNull();
    expect(localStorage.getItem("luku_bundle")).toBeNull();
  });
});

describe("useBundles – createBundle", () => {
  it("prepends the new bundle and returns it", async () => {
    const result = await loaded([KOTIMAA]);
    mockFetchJson({ bundle: LUKU3 });
    let created;
    await act(async () => { created = await result.current.createBundle("Luku 3"); });
    expect(created).toEqual(LUKU3);
    expect(result.current.bundles).toEqual([LUKU3, KOTIMAA]);
  });

  it("does not duplicate when the server answers with one already listed", async () => {
    // Asking for a name that exists returns that bundle rather than a new one.
    const result = await loaded([KOTIMAA]);
    mockFetchJson({ bundle: KOTIMAA });
    await act(() => result.current.createBundle("kotimaa"));
    expect(result.current.bundles).toEqual([KOTIMAA]);
  });

  it("throws on a refused create", async () => {
    const result = await loaded([]);
    mockFetch({ ok: false, status: 400 });
    await expect(act(() => result.current.createBundle("  "))).rejects.toThrow("Failed to create bundle (400)");
  });
});

describe("useBundles – deleteBundle", () => {
  it("removes the bundle and clears it as the active one", async () => {
    const result = await loaded([KOTIMAA, LUKU3]);
    act(() => result.current.setActiveBundleId(1));
    mockFetchJson({ ok: true });
    await act(() => result.current.deleteBundle(1));
    expect(result.current.bundles).toEqual([LUKU3]);
    expect(result.current.activeBundleId).toBeNull();
  });

  it("leaves a different active bundle alone", async () => {
    const result = await loaded([KOTIMAA, LUKU3]);
    act(() => result.current.setActiveBundleId(2));
    mockFetchJson({ ok: true });
    await act(() => result.current.deleteBundle(1));
    expect(result.current.activeBundleId).toBe(2);
  });

  it("puts the bundle back when the server refuses", async () => {
    const result = await loaded([KOTIMAA, LUKU3]);
    mockFetch({ ok: false, status: 500, statusText: "Server Error" });
    await expect(act(() => result.current.deleteBundle(1))).rejects.toThrow();
    expect(result.current.bundles.map((b) => b.id).sort()).toEqual([1, 2]);
  });

  it("does nothing for a bundle it does not have", async () => {
    const result = await loaded([KOTIMAA]);
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await act(() => result.current.deleteBundle(99));
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
