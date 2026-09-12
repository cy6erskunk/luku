// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useApiKey, apiKeyStorageKey } from "../useApiKey.js";

const U1 = "user-1";
const KEY_U1 = apiKeyStorageKey(U1);

beforeEach(() => localStorage.clear());
afterEach(() => localStorage.clear());

describe("useApiKey – initialisation", () => {
  it("starts with empty string when localStorage has nothing", () => {
    const { result } = renderHook(() => useApiKey(U1));
    expect(result.current.savedKey).toBe("");
  });

  it("reads this account's existing key from localStorage on mount", () => {
    localStorage.setItem(KEY_U1, "sk-ant-existing");
    const { result } = renderHook(() => useApiKey(U1));
    expect(result.current.savedKey).toBe("sk-ant-existing");
  });
});

describe("useApiKey – setSavedKey", () => {
  it("updates savedKey in state", () => {
    const { result } = renderHook(() => useApiKey(U1));
    act(() => result.current.setSavedKey("sk-ant-new"));
    expect(result.current.savedKey).toBe("sk-ant-new");
  });

  it("persists the key under this account's own name", () => {
    const { result } = renderHook(() => useApiKey(U1));
    act(() => result.current.setSavedKey("sk-ant-persist"));
    expect(localStorage.getItem(KEY_U1)).toBe("sk-ant-persist");
  });

  it("removes the key from localStorage when set to empty string", () => {
    localStorage.setItem(KEY_U1, "sk-ant-old");
    const { result } = renderHook(() => useApiKey(U1));
    act(() => result.current.setSavedKey(""));
    expect(localStorage.getItem(KEY_U1)).toBeNull();
    expect(result.current.savedKey).toBe("");
  });
});

describe("useApiKey – one key per account", () => {
  it("does not read another account's key", () => {
    localStorage.setItem(apiKeyStorageKey("user-2"), "sk-ant-someone-else");
    const { result } = renderHook(() => useApiKey(U1));
    expect(result.current.savedKey).toBe("");
  });

  it("does not overwrite another account's key", () => {
    const other = apiKeyStorageKey("user-2");
    localStorage.setItem(other, "sk-ant-someone-else");
    const { result } = renderHook(() => useApiKey(U1));
    act(() => result.current.setSavedKey("sk-ant-mine"));
    expect(localStorage.getItem(other)).toBe("sk-ant-someone-else");
  });

  it("clears a pre-scoping key instead of handing it to whoever signs in", () => {
    // The shared name is what the leak was: on a browser last signed in as
    // somebody else, adopting it would bill their key to this account.
    localStorage.setItem("luku_api_key", "sk-ant-previous-reader");
    const { result } = renderHook(() => useApiKey(U1));
    expect(result.current.savedKey).toBe("");
    expect(localStorage.getItem("luku_api_key")).toBeNull();
  });
});
