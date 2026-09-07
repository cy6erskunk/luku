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

  it("reports a failed load instead of showing an empty vocabulary", async () => {
    // The bug this covers: an empty list is the app's ordinary state, so a
    // swallowed failure looked exactly like an account with no saved words.
    mockFetch({ ok: false, status: 503, json: () => Promise.resolve({ error: "Run db/schema.sql against it." }) });
    const { result } = renderHook(() => useWords("user-1"));
    await waitFor(() => expect(result.current.loadingWords).toBe(false));
    expect(result.current.wordsError).toBe("Run db/schema.sql against it.");
    expect(result.current.dbWords).toEqual([]);
  });

  it("reports a load that failed with no readable body", async () => {
    mockFetch({ ok: false, status: 500, json: () => Promise.reject(new SyntaxError("not JSON")) });
    const { result } = renderHook(() => useWords("user-1"));
    await waitFor(() => expect(result.current.loadingWords).toBe(false));
    expect(result.current.wordsError).toBe("Could not load your saved words (500)");
  });

  it("reports a load that never reached the server", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new Error("offline"))));
    const { result } = renderHook(() => useWords("user-1"));
    await waitFor(() => expect(result.current.loadingWords).toBe(false));
    expect(result.current.wordsError).toBe("offline");
  });

  it("has no error after a successful load", async () => {
    mockFetchJson({ words: [WORD_A] });
    const { result } = renderHook(() => useWords("user-1"));
    await waitFor(() => expect(result.current.loadingWords).toBe(false));
    expect(result.current.wordsError).toBeNull();
  });

  it("clears a previous error when the user changes", async () => {
    mockFetch({ ok: false, status: 500, json: () => Promise.resolve({}) });
    const { result, rerender } = renderHook(({ uid }) => useWords(uid), { initialProps: { uid: "user-1" } });
    await waitFor(() => expect(result.current.wordsError).toBeTruthy());
    mockFetchJson({ words: [WORD_B] });
    rerender({ uid: "user-2" });
    await waitFor(() => expect(result.current.dbWords).toEqual([WORD_B]));
    expect(result.current.wordsError).toBeNull();
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
    expect(body).toEqual({ word: "juoksin", base: "juosta", translations: ["to run"], pos: "verb", formTranslation: "I ran", example: null, example_translation: null, bundleId: null });
  });

  it("sends the bundle the reader is collecting into", async () => {
    mockFetchJson({ words: [] });
    const { result } = renderHook(() => useWords("user-1"));
    await waitFor(() => expect(result.current.loadingWords).toBe(false));

    let body;
    vi.stubGlobal("fetch", vi.fn((_url, opts) => {
      body = JSON.parse(opts.body);
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ word: { ...WORD_A, bundle_ids: [4] } }) });
    }));
    await act(() => result.current.saveWord({ original: "juosta", base: "juosta", translations: ["to run"], pos: "verb" }, 4));
    expect(body.bundleId).toBe(4);
    expect(result.current.dbWords[0].bundle_ids).toEqual([4]);
  });
});

describe("useWords – bundle membership", () => {
  const inBundle = { ...WORD_A, bundle_ids: [2] };

  async function loaded(words) {
    mockFetchJson({ words });
    const { result } = renderHook(() => useWords("user-1"));
    await waitFor(() => expect(result.current.loadingWords).toBe(false));
    return result;
  }

  it("adds a membership optimistically and keeps the server's answer", async () => {
    const result = await loaded([{ ...WORD_A, bundle_ids: [] }]);

    let resolve;
    vi.stubGlobal("fetch", vi.fn(() => new Promise((r) => { resolve = r; })));
    let pending;
    act(() => { pending = result.current.addWordToBundle(1, 2); });
    // Optimistic: the tag is there before the request comes back.
    expect(result.current.dbWords[0].bundle_ids).toEqual([2]);

    await act(async () => {
      resolve({ ok: true, json: () => Promise.resolve({ bundleIds: [2, 5] }) });
      await pending;
    });
    expect(result.current.dbWords[0].bundle_ids).toEqual([2, 5]);
  });

  it("removes a membership optimistically", async () => {
    const result = await loaded([inBundle]);
    mockFetchJson({ bundleIds: [] });
    await act(() => result.current.removeWordFromBundle(1, 2));
    expect(result.current.dbWords[0].bundle_ids).toEqual([]);
  });

  it("puts the membership back when the server refuses", async () => {
    const result = await loaded([inBundle]);
    mockFetch({ ok: false, status: 500 });
    await expect(act(() => result.current.removeWordFromBundle(1, 2))).rejects.toThrow(/Failed to update bundle/);
    expect(result.current.dbWords[0].bundle_ids).toEqual([2]);
  });

  it("sends the word, bundle and action", async () => {
    const result = await loaded([{ ...WORD_A, bundle_ids: [] }]);
    let call;
    vi.stubGlobal("fetch", vi.fn((url, opts) => {
      call = { url, method: opts.method, body: JSON.parse(opts.body) };
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ bundleIds: [2] }) });
    }));
    await act(() => result.current.addWordToBundle(1, 2));
    expect(call).toEqual({ url: "/api/words", method: "PATCH", body: { id: 1, bundleId: 2, action: "add" } });
  });

  it("does nothing for a word that is not on the list", async () => {
    const result = await loaded([]);
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await act(() => result.current.addWordToBundle(99, 2));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does not let a second edit issued from the same render undo the first", async () => {
    // Both calls close over the same dbWords, so an update computed from that
    // snapshot would have the second write [10] back over the first's [20].
    const result = await loaded([{ ...WORD_A, bundle_ids: [10, 20] }]);

    const resolvers = [];
    vi.stubGlobal("fetch", vi.fn(() => new Promise((r) => resolvers.push(r))));
    let pending;
    act(() => {
      pending = Promise.all([
        result.current.removeWordFromBundle(1, 10),
        result.current.removeWordFromBundle(1, 20),
      ]);
    });
    expect(result.current.dbWords[0].bundle_ids).toEqual([]);

    await act(async () => {
      resolvers.forEach((r) => r({ ok: true, json: () => Promise.resolve({ bundleIds: [] }) }));
      await pending;
    });
    expect(result.current.dbWords[0].bundle_ids).toEqual([]);
  });

  it("rolls back only the membership that failed, not the whole list", async () => {
    // A rollback restoring the snapshot would drop the concurrent add of 20
    // along with the failed add of 10.
    const result = await loaded([{ ...WORD_A, bundle_ids: [] }]);

    const resolvers = [];
    vi.stubGlobal("fetch", vi.fn(() => new Promise((r) => resolvers.push(r))));
    let failing, succeeding;
    act(() => {
      failing = result.current.addWordToBundle(1, 10).catch(() => {});
      succeeding = result.current.addWordToBundle(1, 20);
    });
    expect(result.current.dbWords[0].bundle_ids).toEqual([10, 20]);

    await act(async () => {
      resolvers[0]({ ok: false, status: 500 });
      resolvers[1]({ ok: true, json: () => Promise.resolve({ bundleIds: [20] }) });
      await Promise.all([failing, succeeding]);
    });
    expect(result.current.dbWords[0].bundle_ids).toEqual([20]);
  });

  it("is idempotent, so a rollback cannot double-remove", async () => {
    const result = await loaded([{ ...WORD_A, bundle_ids: [2] }]);
    mockFetchJson({ bundleIds: [2] });
    await act(() => result.current.addWordToBundle(1, 2));
    expect(result.current.dbWords[0].bundle_ids).toEqual([2]);
  });

  it("drops a deleted bundle from every word that carried it", async () => {
    const result = await loaded([{ ...WORD_A, bundle_ids: [2, 3] }, { ...WORD_B, bundle_ids: [3] }]);
    act(() => result.current.forgetBundle(3));
    expect(result.current.dbWords[0].bundle_ids).toEqual([2]);
    expect(result.current.dbWords[1].bundle_ids).toEqual([]);
  });

  it("puts the memberships back when the bundle delete turns out to have failed", async () => {
    const result = await loaded([{ ...WORD_A, bundle_ids: [2, 3] }, { ...WORD_B, bundle_ids: [3] }]);
    act(() => result.current.forgetBundle(3));
    act(() => result.current.restoreBundle(3, [1, 2]));
    expect(result.current.dbWords[0].bundle_ids).toEqual([2, 3]);
    expect(result.current.dbWords[1].bundle_ids).toEqual([3]);
  });

  it("restores only the words that actually carried the bundle", async () => {
    const result = await loaded([{ ...WORD_A, bundle_ids: [3] }, { ...WORD_B, bundle_ids: [] }]);
    act(() => result.current.forgetBundle(3));
    act(() => result.current.restoreBundle(3, [1]));
    expect(result.current.dbWords[0].bundle_ids).toEqual([3]);
    expect(result.current.dbWords[1].bundle_ids).toEqual([]);
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
