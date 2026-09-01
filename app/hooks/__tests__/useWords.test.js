// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { useWords } from "../useWords.js";

const WORD_A = { id: 1, base: "juosta", translations: ["to run"], pos: "verb" };
const WORD_B = { id: 2, base: "koira", translations: ["dog"], pos: "noun" };

function mockFetch(response) {
  vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(response)));
}

function mockFetchJson(data) {
  mockFetch({ ok: true, json: () => Promise.resolve(data) });
}

afterEach(() => vi.unstubAllGlobals());

describe("useWords – initial fetch", () => {
  it("loads words for the given userId", async () => {
    mockFetchJson({ words: [WORD_A, WORD_B] });
    const { result } = renderHook(() => useWords("user-1"));
    await waitFor(() => expect(result.current.loadingWords).toBe(false));
    expect(result.current.dbWords).toEqual([WORD_A, WORD_B]);
  });

  it("starts with loadingWords true while fetching", () => {
    let resolve;
    vi.stubGlobal("fetch", vi.fn(() => new Promise((r) => { resolve = r; })));
    const { result } = renderHook(() => useWords("user-1"));
    expect(result.current.loadingWords).toBe(true);
    act(() => resolve({ ok: true, json: () => Promise.resolve({ words: [] }) }));
  });

  it("clears words and stops loading when userId is null", async () => {
    const { result, rerender } = renderHook(({ uid }) => useWords(uid), {
      initialProps: { uid: "user-1" },
    });
    mockFetchJson({ words: [WORD_A] });
    await waitFor(() => expect(result.current.loadingWords).toBe(false));
    rerender({ uid: null });
    await waitFor(() => expect(result.current.loadingWords).toBe(false));
    expect(result.current.dbWords).toEqual([]);
  });

  it("clears dbWords before re-fetching when userId changes", async () => {
    mockFetchJson({ words: [WORD_A] });
    const { result, rerender } = renderHook(({ uid }) => useWords(uid), {
      initialProps: { uid: "user-1" },
    });
    await waitFor(() => expect(result.current.dbWords).toEqual([WORD_A]));
    mockFetchJson({ words: [WORD_B] });
    rerender({ uid: "user-2" });
    // Immediately after rerender, before new fetch resolves, words should be cleared.
    expect(result.current.dbWords).toEqual([]);
    await waitFor(() => expect(result.current.dbWords).toEqual([WORD_B]));
  });
});

describe("useWords – saveWord", () => {
  it("appends the saved word to dbWords", async () => {
    mockFetchJson({ words: [] });
    const { result } = renderHook(() => useWords("user-1"));
    await waitFor(() => expect(result.current.loadingWords).toBe(false));

    mockFetchJson({ word: WORD_A });
    await act(() => result.current.saveWord({ original: "juosta", base: "juosta", translations: ["to run"], pos: "verb" }));
    expect(result.current.dbWords).toContainEqual(WORD_A);
  });

  it("deduplicates by id when saving", async () => {
    mockFetchJson({ words: [WORD_A] });
    const { result } = renderHook(() => useWords("user-1"));
    await waitFor(() => expect(result.current.loadingWords).toBe(false));

    mockFetchJson({ word: { ...WORD_A, translations: ["to run fast"] } });
    await act(() => result.current.saveWord({ original: "juosta", base: "juosta", translations: ["to run fast"], pos: "verb" }));
    expect(result.current.dbWords).toHaveLength(1);
    expect(result.current.dbWords[0].translations).toEqual(["to run fast"]);
  });

  it("throws on non-ok response", async () => {
    mockFetchJson({ words: [] });
    const { result } = renderHook(() => useWords("user-1"));
    await waitFor(() => expect(result.current.loadingWords).toBe(false));

    mockFetch({ ok: false, status: 500 });
    await expect(
      act(() => result.current.saveWord({ original: "juosta", base: "juosta", translations: [], pos: "verb" }))
    ).rejects.toThrow("Failed to save word (500)");
  });

  it("sends the form translation in the request body", async () => {
    mockFetchJson({ words: [] });
    const { result } = renderHook(() => useWords("user-1"));
    await waitFor(() => expect(result.current.loadingWords).toBe(false));

    let body;
    vi.stubGlobal("fetch", vi.fn((_url, opts) => {
      body = JSON.parse(opts.body);
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ word: WORD_A }) });
    }));
    await act(() => result.current.saveWord({ original: "juoksin", base: "juosta", translations: ["to run"], pos: "verb", formTranslation: "I ran" }));
    expect(body).toEqual({ word: "juoksin", base: "juosta", translations: ["to run"], pos: "verb", formTranslation: "I ran", example: null, example_translation: null });
  });
});

describe("useWords – updateWord", () => {
  it("replaces the matching word in dbWords", async () => {
    mockFetchJson({ words: [WORD_A, WORD_B] });
    const { result } = renderHook(() => useWords("user-1"));
    await waitFor(() => expect(result.current.dbWords).toHaveLength(2));

    const updated = { ...WORD_A, translations: ["to sprint"] };
    act(() => result.current.updateWord(updated));
    expect(result.current.dbWords.find((w) => w.id === 1).translations).toEqual(["to sprint"]);
    expect(result.current.dbWords).toHaveLength(2);
  });
});

describe("useWords – removeWord / restoreWord", () => {
  it("removes the word with the given id", async () => {
    mockFetchJson({ words: [WORD_A, WORD_B] });
    const { result } = renderHook(() => useWords("user-1"));
    await waitFor(() => expect(result.current.dbWords).toHaveLength(2));

    act(() => result.current.removeWord(1));
    expect(result.current.dbWords).toEqual([WORD_B]);
  });

  it("restores a word that was removed", async () => {
    mockFetchJson({ words: [WORD_B] });
    const { result } = renderHook(() => useWords("user-1"));
    await waitFor(() => expect(result.current.dbWords).toHaveLength(1));

    act(() => result.current.restoreWord(WORD_A));
    expect(result.current.dbWords).toContainEqual(WORD_A);
  });

  it("does not duplicate when restoring a word that already exists", async () => {
    mockFetchJson({ words: [WORD_A] });
    const { result } = renderHook(() => useWords("user-1"));
    await waitFor(() => expect(result.current.dbWords).toHaveLength(1));

    act(() => result.current.restoreWord(WORD_A));
    expect(result.current.dbWords).toHaveLength(1);
  });
});
