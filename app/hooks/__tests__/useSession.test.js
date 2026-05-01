// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useSession } from "../useSession.js";

beforeEach(() => localStorage.clear());
afterEach(() => localStorage.clear());

describe("useSession – initialisation", () => {
  it("starts with empty object when localStorage has nothing", () => {
    const { result } = renderHook(() => useSession());
    expect(result.current.session).toEqual({});
  });

  it("reads a valid session from localStorage on mount", () => {
    localStorage.setItem("luku_session", JSON.stringify({ talo: { base: "talo", added: false } }));
    const { result } = renderHook(() => useSession());
    expect(result.current.session).toEqual({ talo: { base: "talo", added: false } });
  });

  it("falls back to empty object when localStorage contains an array", () => {
    localStorage.setItem("luku_session", JSON.stringify([1, 2, 3]));
    const { result } = renderHook(() => useSession());
    expect(result.current.session).toEqual({});
  });

  it("falls back to empty object when localStorage contains invalid JSON", () => {
    localStorage.setItem("luku_session", "not-json{");
    const { result } = renderHook(() => useSession());
    expect(result.current.session).toEqual({});
  });
});

describe("useSession – setSession", () => {
  it("replaces session with a plain object", () => {
    const { result } = renderHook(() => useSession());
    act(() => result.current.setSession({ koira: { base: "koira", added: true } }));
    expect(result.current.session).toEqual({ koira: { base: "koira", added: true } });
  });

  it("persists the new session to localStorage", () => {
    const { result } = renderHook(() => useSession());
    act(() => result.current.setSession({ koira: { base: "koira", added: false } }));
    expect(JSON.parse(localStorage.getItem("luku_session"))).toEqual({ koira: { base: "koira", added: false } });
  });

  it("accepts a function updater and receives previous state", () => {
    const initial = { talo: { base: "talo", added: false } };
    localStorage.setItem("luku_session", JSON.stringify(initial));
    const { result } = renderHook(() => useSession());
    act(() => result.current.setSession((prev) => ({ ...prev, talo: { ...prev.talo, added: true } })));
    expect(result.current.session.talo.added).toBe(true);
  });

  it("clears the session when set to empty object", () => {
    localStorage.setItem("luku_session", JSON.stringify({ koira: {} }));
    const { result } = renderHook(() => useSession());
    act(() => result.current.setSession({}));
    expect(result.current.session).toEqual({});
    expect(JSON.parse(localStorage.getItem("luku_session"))).toEqual({});
  });
});
