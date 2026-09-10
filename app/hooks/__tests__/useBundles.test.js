// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { renderHook, act, waitFor, cleanup } from "@testing-library/react";
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

  it("ignores a load that answers after the account changed", async () => {
    let resolveFirst;
    vi.stubGlobal("fetch", vi.fn()
      .mockImplementationOnce(() => new Promise((r) => { resolveFirst = r; }))
      .mockImplementationOnce(() => Promise.resolve({ ok: true, json: () => Promise.resolve({ bundles: [LUKU3] }) })));

    const { result, rerender } = renderHook(({ uid }) => useBundles(uid), { initialProps: { uid: "user-1" } });
    rerender({ uid: "user-2" });
    await waitFor(() => expect(result.current.bundles).toEqual([LUKU3]));

    await act(async () => {
      resolveFirst({ ok: true, json: () => Promise.resolve({ bundles: [KOTIMAA] }) });
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(result.current.bundles).toEqual([LUKU3]);
  });

  it("keeps a bundle created while the list was still loading", async () => {
    // The picker is usable while the initial GET runs, so a reader can create
    // a bundle before it answers. The snapshot predates them.
    let resolveLoad;
    vi.stubGlobal("fetch", vi.fn((_url, opts = {}) => {
      if (opts.method === "POST") {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ bundle: LUKU3 }) });
      }
      return new Promise((r) => { resolveLoad = r; });
    }));

    const { result } = renderHook(() => useBundles("user-1"));
    expect(result.current.loadingBundles).toBe(true);

    await act(async () => {
      const created = await result.current.createBundle("Luku 3");
      result.current.setActiveBundleId(created.id);
    });
    expect(result.current.bundles).toEqual([LUKU3]);

    await act(async () => {
      resolveLoad({ ok: true, json: () => Promise.resolve({ bundles: [KOTIMAA] }) });
      await new Promise((r) => setTimeout(r, 0));
    });

    // The older snapshot must not erase a bundle the server already has...
    expect(result.current.bundles.map((b) => b.id).sort()).toEqual([1, 2]);
    // ...nor let the stale-selection sweep drop it as the active bundle.
    expect(result.current.activeBundleId).toBe(2);
  });

  it("does not duplicate a bundle the snapshot already carries", async () => {
    // The create can land before the load reads, in which case the snapshot
    // has it too and the merge must not list it twice.
    let resolveLoad;
    vi.stubGlobal("fetch", vi.fn((_url, opts = {}) => {
      if (opts.method === "POST") {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ bundle: LUKU3 }) });
      }
      return new Promise((r) => { resolveLoad = r; });
    }));

    const { result } = renderHook(() => useBundles("user-1"));
    await act(() => result.current.createBundle("Luku 3"));

    await act(async () => {
      resolveLoad({ ok: true, json: () => Promise.resolve({ bundles: [LUKU3, KOTIMAA] }) });
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(result.current.bundles.map((b) => b.id).sort()).toEqual([1, 2]);
  });

  it("reports a failed load rather than looking like no bundles exist", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new Error("offline"))));
    const { result } = renderHook(() => useBundles("user-1"));
    await waitFor(() => expect(result.current.loadingBundles).toBe(false));
    expect(result.current.bundles).toEqual([]);
    expect(result.current.bundlesError).toBe("offline");
  });

  it("passes on the server's reason for refusing", async () => {
    mockFetch({ ok: false, status: 503, json: () => Promise.resolve({ error: "Run db/schema.sql against it." }) });
    const { result } = renderHook(() => useBundles("user-1"));
    await waitFor(() => expect(result.current.loadingBundles).toBe(false));
    expect(result.current.bundlesError).toBe("Run db/schema.sql against it.");
  });

  it("has no error after a successful load", async () => {
    const result = await loaded([KOTIMAA]);
    expect(result.current.bundlesError).toBeNull();
  });
});

describe("useBundles – the active bundle", () => {
  it("remembers the selection across a remount", async () => {
    const result = await loaded([KOTIMAA]);
    act(() => result.current.setActiveBundleId(1));
    expect(localStorage.getItem("luku_bundle:user-1")).toBe("1");

    const again = await loaded([KOTIMAA]);
    expect(again.current.activeBundleId).toBe(1);
  });

  it("forgets a remembered bundle the account no longer has", async () => {
    // Deleted in another tab, or belonging to the previously signed-in user.
    localStorage.setItem("luku_bundle:user-1", "99");
    const result = await loaded([KOTIMAA]);
    await waitFor(() => expect(result.current.activeBundleId).toBeNull());
    expect(localStorage.getItem("luku_bundle:user-1")).toBeNull();
  });

  it("does not drop the selection while the list is still loading", () => {
    localStorage.setItem("luku_bundle:user-1", "1");
    vi.stubGlobal("fetch", vi.fn(() => new Promise(() => {})));
    const { result } = renderHook(() => useBundles("user-1"));
    expect(result.current.loadingBundles).toBe(true);
    expect(result.current.activeBundleId).toBe(1);
  });

  it("keeps the remembered bundle when the list fails to load", async () => {
    // An empty list after a failure says nothing about whether the bundle
    // still exists, so forgetting it would cost a good selection — and its
    // localStorage entry — over a dropped connection.
    localStorage.setItem("luku_bundle:user-1", "1");
    mockFetch({ ok: false, status: 500, json: () => Promise.resolve({}) });
    const { result } = renderHook(() => useBundles("user-1"));
    await waitFor(() => expect(result.current.bundlesError).toBeTruthy());

    expect(result.current.activeBundleId).toBe(1);
    expect(localStorage.getItem("luku_bundle:user-1")).toBe("1");
  });

  it("ignores a junk remembered value", async () => {
    localStorage.setItem("luku_bundle:user-1", "not-a-number");
    const result = await loaded([KOTIMAA]);
    expect(result.current.activeBundleId).toBeNull();
  });

  it("does not let a partly-numeric value activate a real bundle", async () => {
    // parseInt would read every one of these as bundle 1, quietly pointing the
    // reader's next words at a bundle they never chose.
    for (const junk of ["1junk", "1.5", "1 2", "0x1", "+1e0junk"]) {
      localStorage.setItem("luku_bundle:user-1", junk);
      cleanup();
      const result = await loaded([KOTIMAA]);
      expect(result.current.activeBundleId).toBeNull();
    }
  });

  it("does not carry one account's selection into another's session", async () => {
    // A shared key would leave A's bundle id live under B until B's own list
    // arrived — and if that load failed, indefinitely, with B's saves quoting
    // a bundle that is not theirs.
    localStorage.setItem("luku_bundle:user-1", "1");
    mockFetchJson({ bundles: [KOTIMAA] });
    const { result, rerender } = renderHook(({ uid }) => useBundles(uid), { initialProps: { uid: "user-1" } });
    await waitFor(() => expect(result.current.activeBundleId).toBe(1));

    rerender({ uid: "user-2" });
    expect(result.current.activeBundleId).toBeNull();
    // ...and A's own selection is still there when A comes back.
    rerender({ uid: "user-1" });
    expect(result.current.activeBundleId).toBe(1);
  });

  it("stores a selection where only its own account can read it", async () => {
    const result = await loaded([KOTIMAA]);
    act(() => result.current.setActiveBundleId(1));
    expect(localStorage.getItem("luku_bundle:user-1")).toBe("1");
    expect(localStorage.getItem("luku_bundle")).toBeNull();
  });

  it("clears the selection", async () => {
    const result = await loaded([KOTIMAA]);
    act(() => result.current.setActiveBundleId(1));
    act(() => result.current.setActiveBundleId(null));
    expect(result.current.activeBundleId).toBeNull();
    expect(localStorage.getItem("luku_bundle:user-1")).toBeNull();
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

  it("does not hand a stale bundle back to the caller either", async () => {
    // BundlePicker selects whatever createBundle returns, and the hook holding
    // that selection is still mounted after an account switch — so keeping the
    // stale row out of the list is not enough on its own.
    let resolveCreate;
    vi.stubGlobal("fetch", vi.fn((_url, opts = {}) => {
      if (opts.method === "POST") return new Promise((r) => { resolveCreate = r; });
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ bundles: [] }) });
    }));

    const { result, rerender } = renderHook(({ uid }) => useBundles(uid), { initialProps: { uid: "user-1" } });
    await waitFor(() => expect(result.current.loadingBundles).toBe(false));

    let created;
    await act(async () => { created = result.current.createBundle("Kotimaa"); });
    rerender({ uid: "user-2" });
    await waitFor(() => expect(result.current.loadingBundles).toBe(false));

    await act(async () => {
      resolveCreate({ ok: true, json: () => Promise.resolve({ bundle: KOTIMAA }) });
      expect(await created).toBeNull();
    });
    expect(result.current.activeBundleId).toBeNull();
  });

  it("does not drop a bundle into the next account's list", async () => {
    // The create answers after a sign-out. Its bundle belongs to the account
    // that asked for it, not the one now on screen.
    let resolveCreate;
    vi.stubGlobal("fetch", vi.fn((_url, opts = {}) => {
      if (opts.method === "POST") return new Promise((r) => { resolveCreate = r; });
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ bundles: [] }) });
    }));

    const { result, rerender } = renderHook(({ uid }) => useBundles(uid), { initialProps: { uid: "user-1" } });
    await waitFor(() => expect(result.current.loadingBundles).toBe(false));

    let pending;
    await act(async () => { pending = result.current.createBundle("Kotimaa").catch(() => {}); });
    rerender({ uid: "user-2" });
    await waitFor(() => expect(result.current.loadingBundles).toBe(false));

    await act(async () => {
      resolveCreate({ ok: true, json: () => Promise.resolve({ bundle: KOTIMAA }) });
      await pending;
    });
    expect(result.current.bundles).toEqual([]);
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
    mockFetch({ ok: false, status: 400, json: () => Promise.reject(new SyntaxError("not JSON")) });
    await expect(act(() => result.current.createBundle("  "))).rejects.toThrow(/Could not create that bundle/);
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
    mockFetch({ ok: false, status: 500, json: () => Promise.reject(new SyntaxError("not JSON")) });
    await expect(act(() => result.current.deleteBundle(1))).rejects.toThrow();
    expect(result.current.bundles.map((b) => b.id).sort()).toEqual([1, 2]);
  });

  it("does not undo a selection the reader made while the delete was in flight", async () => {
    // Deleting the active bundle clears the selection; if the reader picks
    // another one before the request fails, the rollback must not drag the
    // deleted bundle back into a slot they have since filled.
    const result = await loaded([KOTIMAA, LUKU3]);
    act(() => result.current.setActiveBundleId(1));

    let reject;
    vi.stubGlobal("fetch", vi.fn(() => new Promise((_r, rej) => { reject = rej; })));
    let pending;
    act(() => { pending = result.current.deleteBundle(1).catch(() => {}); });
    expect(result.current.activeBundleId).toBeNull();

    act(() => result.current.setActiveBundleId(2));

    await act(async () => { reject(new Error("offline")); await pending; });
    expect(result.current.activeBundleId).toBe(2);
    expect(localStorage.getItem("luku_bundle:user-1")).toBe("2");
  });

  it("puts the active selection back with the bundle it was on", async () => {
    // The bundle returns, so the selection it was carrying has to return too —
    // otherwise a refused delete still costs the reader their active bundle.
    const result = await loaded([KOTIMAA, LUKU3]);
    act(() => result.current.setActiveBundleId(1));
    mockFetch({ ok: false, status: 500, json: () => Promise.reject(new SyntaxError("not JSON")) });
    await expect(act(() => result.current.deleteBundle(1))).rejects.toThrow();
    expect(result.current.activeBundleId).toBe(1);
    expect(localStorage.getItem("luku_bundle:user-1")).toBe("1");
  });

  it("does nothing for a bundle it does not have", async () => {
    const result = await loaded([KOTIMAA]);
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await act(() => result.current.deleteBundle(99));
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
