// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useApiKey } from "../useApiKey.js";

beforeEach(() => localStorage.clear());
afterEach(() => localStorage.clear());

describe("useApiKey – initialisation", () => {
  it("starts with empty string when localStorage has nothing", () => {
    const { result } = renderHook(() => useApiKey());
    expect(result.current.savedKey).toBe("");
  });

  it("reads an existing key from localStorage on mount", () => {
    localStorage.setItem("luku_api_key", "sk-ant-existing");
    const { result } = renderHook(() => useApiKey());
    expect(result.current.savedKey).toBe("sk-ant-existing");
  });
});

describe("useApiKey – setSavedKey", () => {
  it("updates savedKey in state", () => {
    const { result } = renderHook(() => useApiKey());
    act(() => result.current.setSavedKey("sk-ant-new"));
    expect(result.current.savedKey).toBe("sk-ant-new");
  });

  it("persists the key to localStorage", () => {
    const { result } = renderHook(() => useApiKey());
    act(() => result.current.setSavedKey("sk-ant-persist"));
    expect(localStorage.getItem("luku_api_key")).toBe("sk-ant-persist");
  });

  it("removes the key from localStorage when set to empty string", () => {
    localStorage.setItem("luku_api_key", "sk-ant-old");
    const { result } = renderHook(() => useApiKey());
    act(() => result.current.setSavedKey(""));
    expect(localStorage.getItem("luku_api_key")).toBeNull();
    expect(result.current.savedKey).toBe("");
  });
});
