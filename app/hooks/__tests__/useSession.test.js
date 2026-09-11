// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useSession } from "../useSession.js";

beforeEach(() => localStorage.clear());
afterEach(() => localStorage.clear());

describe("useSession – initialisation", () => {
  it("starts with empty object when localStorage has nothing", () => {
    const { result } = renderHook(() => useSession("u1"));
    expect(result.current.session).toEqual({});
  });

  it("reads a valid session from localStorage on mount", () => {
    localStorage.setItem("luku_session:u1", JSON.stringify({ talo: { base: "talo", added: false } }));
    const { result } = renderHook(() => useSession("u1"));
    expect(result.current.session).toEqual({ talo: { base: "talo", added: false } });
  });

  it("falls back to empty object when localStorage contains an array", () => {
    localStorage.setItem("luku_session:u1", JSON.stringify([1, 2, 3]));
    const { result } = renderHook(() => useSession("u1"));
    expect(result.current.session).toEqual({});
  });

  it("falls back to empty object when localStorage contains invalid JSON", () => {
    localStorage.setItem("luku_session:u1", "not-json{");
    const { result } = renderHook(() => useSession("u1"));
    expect(result.current.session).toEqual({});
  });
});

describe("useSession – setSession", () => {
  it("replaces session with a plain object", () => {
    const { result } = renderHook(() => useSession("u1"));
    act(() => result.current.setSession({ koira: { base: "koira", added: true } }));
    expect(result.current.session).toEqual({ koira: { base: "koira", added: true } });
  });

  it("persists the new session to localStorage", () => {
    const { result } = renderHook(() => useSession("u1"));
    act(() => result.current.setSession({ koira: { base: "koira", added: false } }));
    expect(JSON.parse(localStorage.getItem("luku_session:u1"))).toEqual({ koira: { base: "koira", added: false } });
  });

  it("accepts a function updater and receives previous state", () => {
    const initial = { talo: { base: "talo", added: false } };
    localStorage.setItem("luku_session:u1", JSON.stringify(initial));
    const { result } = renderHook(() => useSession("u1"));
    act(() => result.current.setSession((prev) => ({ ...prev, talo: { ...prev.talo, added: true } })));
    expect(result.current.session.talo.added).toBe(true);
  });

  it("clears the session when set to empty object", () => {
    localStorage.setItem("luku_session:u1", JSON.stringify({ koira: {} }));
    const { result } = renderHook(() => useSession("u1"));
    act(() => result.current.setSession({}));
    expect(result.current.session).toEqual({});
    expect(JSON.parse(localStorage.getItem("luku_session:u1"))).toEqual({});
  });
});

describe("useSession – the account it belongs to", () => {
  it("does not hand one account's cache to the next", () => {
    // This browser can hold two accounts one after the other, and the cache
    // carries an `added` tick claiming a word is on the reader's own list.
    localStorage.setItem("luku_session:u1", JSON.stringify({ talo: { base: "talo", added: true } }));
    const { result, rerender } = renderHook(({ uid }) => useSession(uid), { initialProps: { uid: "u1" } });
    expect(result.current.session.talo.added).toBe(true);

    rerender({ uid: "u2" });
    expect(result.current.session).toEqual({});
  });

  it("gives each account back its own on return", () => {
    localStorage.setItem("luku_session:u1", JSON.stringify({ talo: { base: "talo" } }));
    localStorage.setItem("luku_session:u2", JSON.stringify({ koira: { base: "koira" } }));
    const { result, rerender } = renderHook(({ uid }) => useSession(uid), { initialProps: { uid: "u2" } });
    expect(result.current.session).toEqual({ koira: { base: "koira" } });

    rerender({ uid: "u1" });
    expect(result.current.session).toEqual({ talo: { base: "talo" } });
  });

  it("writes only under its own key", () => {
    const { result } = renderHook(() => useSession("u1"));
    act(() => result.current.setSession({ koira: { base: "koira" } }));
    expect(localStorage.getItem("luku_session")).toBeNull();
    expect(JSON.parse(localStorage.getItem("luku_session:u1"))).toEqual({ koira: { base: "koira" } });
  });

  it("keeps nothing when there is no account", () => {
    const { result } = renderHook(() => useSession(null));
    act(() => result.current.setSession({ koira: {} }));
    expect(localStorage.length).toBe(0);
  });
});

