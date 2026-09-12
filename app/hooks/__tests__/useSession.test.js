// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useSession, sessionStorageKey } from "../useSession.js";

const U1 = "user-1";
const KEY_U1 = sessionStorageKey(U1);

beforeEach(() => localStorage.clear());
afterEach(() => localStorage.clear());

describe("useSession – initialisation", () => {
  it("starts with empty object when localStorage has nothing", () => {
    const { result } = renderHook(() => useSession(U1));
    expect(result.current.session).toEqual({});
  });

  it("reads a valid session from localStorage on mount", () => {
    localStorage.setItem(KEY_U1, JSON.stringify({ talo: { base: "talo", added: false } }));
    const { result } = renderHook(() => useSession(U1));
    expect(result.current.session).toEqual({ talo: { base: "talo", added: false } });
  });

  it("falls back to empty object when localStorage contains an array", () => {
    localStorage.setItem(KEY_U1, JSON.stringify([1, 2, 3]));
    const { result } = renderHook(() => useSession(U1));
    expect(result.current.session).toEqual({});
  });

  it("falls back to empty object when localStorage contains invalid JSON", () => {
    localStorage.setItem(KEY_U1, "not-json{");
    const { result } = renderHook(() => useSession(U1));
    expect(result.current.session).toEqual({});
  });
});

describe("useSession – setSession", () => {
  it("replaces session with a plain object", () => {
    const { result } = renderHook(() => useSession(U1));
    act(() => result.current.setSession({ koira: { base: "koira", added: true } }));
    expect(result.current.session).toEqual({ koira: { base: "koira", added: true } });
  });

  it("persists the new session to localStorage", () => {
    const { result } = renderHook(() => useSession(U1));
    act(() => result.current.setSession({ koira: { base: "koira", added: false } }));
    expect(JSON.parse(localStorage.getItem(KEY_U1))).toEqual({ koira: { base: "koira", added: false } });
  });

  it("accepts a function updater and receives previous state", () => {
    const initial = { talo: { base: "talo", added: false } };
    localStorage.setItem(KEY_U1, JSON.stringify(initial));
    const { result } = renderHook(() => useSession(U1));
    act(() => result.current.setSession((prev) => ({ ...prev, talo: { ...prev.talo, added: true } })));
    expect(result.current.session.talo.added).toBe(true);
  });

  it("persists a functional update that is queued behind another update", () => {
    // React only runs a state updater when it processes the update. With
    // another update already pending on this component, the updater does not
    // run at call time — so anything read out of it to persist is not there
    // yet, and the whole cache is what gets lost.
    const { result } = renderHook(() => useSession(U1));

    act(() => {
      result.current.setSession({ talo: { base: "talo" } });
      result.current.setSession((prev) => ({ ...prev, koira: { base: "koira" } }));
    });

    const both = { talo: { base: "talo" }, koira: { base: "koira" } };
    expect(result.current.session).toEqual(both);
    expect(localStorage.getItem(KEY_U1)).not.toBe("undefined");
    expect(JSON.parse(localStorage.getItem(KEY_U1))).toEqual(both);
  });

  it("persists a replacement that is queued behind another update", () => {
    // Same hazard without a functional updater: the value was only read
    // inside the updater, so a plain object was lost the same way.
    const { result } = renderHook(() => useSession(U1));

    act(() => {
      result.current.setSession({ talo: { base: "talo" } });
      result.current.setSession({});
    });

    expect(result.current.session).toEqual({});
    expect(JSON.parse(localStorage.getItem(KEY_U1))).toEqual({});
  });

  it("clears the session when set to empty object", () => {
    localStorage.setItem(KEY_U1, JSON.stringify({ koira: {} }));
    const { result } = renderHook(() => useSession(U1));
    act(() => result.current.setSession({}));
    expect(result.current.session).toEqual({});
    expect(JSON.parse(localStorage.getItem(KEY_U1))).toEqual({});
  });
});

describe("useSession – one cache per account", () => {
  it("does not read another account's scanned page", () => {
    localStorage.setItem(sessionStorageKey("user-2"), JSON.stringify({ salaisuus: { base: "salaisuus" } }));
    const { result } = renderHook(() => useSession(U1));
    expect(result.current.session).toEqual({});
  });

  it("clears a pre-scoping cache instead of showing it to whoever signs in", () => {
    localStorage.setItem("luku_session", JSON.stringify({ talo: { base: "talo" } }));
    const { result } = renderHook(() => useSession(U1));
    expect(result.current.session).toEqual({});
    expect(localStorage.getItem("luku_session")).toBeNull();
  });
});
