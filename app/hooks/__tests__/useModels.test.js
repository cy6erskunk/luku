// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useModels, modelsStorageKey } from "../useModels.js";
import { MODELS, DEFAULT_MODELS } from "@/lib/shared/models.js";

const U1 = "user-1";
const U2 = "user-2";
const KEY_U1 = modelsStorageKey(U1);

const OTHER = MODELS.find((m) => m.id !== DEFAULT_MODELS.ocr).id;

beforeEach(() => localStorage.clear());
afterEach(() => localStorage.clear());

describe("useModels – initialisation", () => {
  it("starts both tasks on the default", () => {
    const { result } = renderHook(() => useModels(U1));
    expect(result.current.models).toEqual({ ...DEFAULT_MODELS });
  });

  it("restores a stored choice", () => {
    localStorage.setItem(KEY_U1, JSON.stringify({ ocr: OTHER, translate: DEFAULT_MODELS.translate }));
    const { result } = renderHook(() => useModels(U1));
    expect(result.current.models.ocr).toBe(OTHER);
  });

  it("falls back for a model that no longer exists", () => {
    localStorage.setItem(KEY_U1, JSON.stringify({ ocr: "claude-retired", translate: OTHER }));
    const { result } = renderHook(() => useModels(U1));
    // Only the retired half is lost; a name Anthropic no longer answers to is
    // worse than the default.
    expect(result.current.models).toEqual({ ocr: DEFAULT_MODELS.ocr, translate: OTHER });
  });

  it("survives a corrupt value", () => {
    localStorage.setItem(KEY_U1, "{not json");
    const { result } = renderHook(() => useModels(U1));
    expect(result.current.models).toEqual({ ...DEFAULT_MODELS });
  });
});

describe("useModels – setModel", () => {
  it("changes one task without touching the other", () => {
    const { result } = renderHook(() => useModels(U1));
    act(() => result.current.setModel("ocr", OTHER));
    expect(result.current.models).toEqual({ ...DEFAULT_MODELS, ocr: OTHER });
  });

  it("persists the choice", () => {
    const { result } = renderHook(() => useModels(U1));
    act(() => result.current.setModel("translate", OTHER));
    expect(JSON.parse(localStorage.getItem(KEY_U1)).translate).toBe(OTHER);
  });

  it("refuses a model or task it does not know", () => {
    const { result } = renderHook(() => useModels(U1));
    act(() => result.current.setModel("ocr", "claude-retired"));
    act(() => result.current.setModel("billing", OTHER));
    expect(result.current.models).toEqual({ ...DEFAULT_MODELS });
    expect(localStorage.getItem(KEY_U1)).toBe(null);
  });
});

describe("useModels – one preference per account", () => {
  it("does not inherit the previous account's choice", () => {
    localStorage.setItem(KEY_U1, JSON.stringify({ ocr: OTHER, translate: OTHER }));
    // The models decide what the next scan costs, and on a shared browser the
    // person paying is not the one who chose them.
    const { result } = renderHook(() => useModels(U2));
    expect(result.current.models).toEqual({ ...DEFAULT_MODELS });
  });

  it("writes under the signed-in account's own name", () => {
    const { result } = renderHook(() => useModels(U2));
    act(() => result.current.setModel("ocr", OTHER));
    expect(localStorage.getItem(KEY_U1)).toBe(null);
    expect(JSON.parse(localStorage.getItem(modelsStorageKey(U2))).ocr).toBe(OTHER);
  });
});
