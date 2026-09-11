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

  it("ignores a load that answers after the account changed", async () => {
    // Sign out and back in as someone else: two loads overlap, and the first
    // account's words must not land under the second account's session.
    let resolveFirst;
    vi.stubGlobal("fetch", vi.fn()
      .mockImplementationOnce(() => new Promise((r) => { resolveFirst = r; }))
      .mockImplementationOnce(() => Promise.resolve({ ok: true, json: () => Promise.resolve({ words: [WORD_B] }) })));

    const { result, rerender } = renderHook(({ uid }) => useWords(uid), { initialProps: { uid: "user-1" } });
    rerender({ uid: "user-2" });
    await waitFor(() => expect(result.current.dbWords).toEqual([WORD_B]));

    await act(async () => {
      resolveFirst({ ok: true, json: () => Promise.resolve({ words: [WORD_A] }) });
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(result.current.dbWords).toEqual([WORD_B]);
  });

  it("does not report a failure that belonged to the previous account", async () => {
    let rejectFirst;
    vi.stubGlobal("fetch", vi.fn()
      .mockImplementationOnce(() => new Promise((_r, rej) => { rejectFirst = rej; }))
      .mockImplementationOnce(() => Promise.resolve({ ok: true, json: () => Promise.resolve({ words: [WORD_B] }) })));

    const { result, rerender } = renderHook(({ uid }) => useWords(uid), { initialProps: { uid: "user-1" } });
    rerender({ uid: "user-2" });
    await waitFor(() => expect(result.current.dbWords).toEqual([WORD_B]));

    await act(async () => {
      rejectFirst(new Error("offline"));
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(result.current.wordsError).toBeNull();
    expect(result.current.loadingWords).toBe(false);
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

  it("does not file a save that answered after the account changed", async () => {
    let resolveSave;
    vi.stubGlobal("fetch", vi.fn((_url, opts = {}) => {
      if (opts?.method === "POST") return new Promise((r) => { resolveSave = r; });
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ words: [] }) });
    }));

    const { result, rerender } = renderHook(({ uid }) => useWords(uid), { initialProps: { uid: "user-1" } });
    await waitFor(() => expect(result.current.loadingWords).toBe(false));

    let saving;
    await act(async () => { saving = result.current.saveWord({ original: "juosta", base: "juosta", translations: ["to run"] }); });
    rerender({ uid: "user-2" });
    await waitFor(() => expect(result.current.loadingWords).toBe(false));

    await act(async () => {
      resolveSave({ ok: true, json: () => Promise.resolve({ word: WORD_A }) });
      // Withheld from the caller too: page.jsx files the returned id under the
      // session's new words.
      expect(await saving).toBeNull();
    });
    expect(result.current.dbWords).toEqual([]);
  });

  it("does not report a success body that failed to parse after the account changed", async () => {
    // A 2xx whose body is truncated rejects on .json(); before, that rejection
    // was raised outside the guard and reached the new account's banner.
    let resolveSave;
    vi.stubGlobal("fetch", vi.fn((_url, opts = {}) => {
      if (opts?.method === "POST") return new Promise((r) => { resolveSave = r; });
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ words: [] }) });
    }));

    const { result, rerender } = renderHook(({ uid }) => useWords(uid), { initialProps: { uid: "user-1" } });
    await waitFor(() => expect(result.current.loadingWords).toBe(false));

    let saving;
    await act(async () => { saving = result.current.saveWord({ original: "juosta", base: "juosta", translations: ["to run"] }); });
    rerender({ uid: "user-2" });
    await waitFor(() => expect(result.current.loadingWords).toBe(false));

    await act(async () => {
      resolveSave({ ok: true, json: () => Promise.reject(new SyntaxError("Unexpected end of JSON input")) });
      expect(await saving).toBeNull();
    });
  });

  it("does not report a save that failed after the account changed", async () => {
    // The mirror of the test above. A failure reaching the new session would
    // roll back a popup belonging to the old one and raise its error in the
    // banner — page.jsx holds both across the switch, so its catch really runs.
    let rejectSave;
    vi.stubGlobal("fetch", vi.fn((_url, opts = {}) => {
      if (opts?.method === "POST") return new Promise((_r, rej) => { rejectSave = rej; });
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ words: [] }) });
    }));

    const { result, rerender } = renderHook(({ uid }) => useWords(uid), { initialProps: { uid: "user-1" } });
    await waitFor(() => expect(result.current.loadingWords).toBe(false));

    let saving;
    await act(async () => { saving = result.current.saveWord({ original: "juosta", base: "juosta", translations: ["to run"] }); });
    rerender({ uid: "user-2" });
    await waitFor(() => expect(result.current.loadingWords).toBe(false));

    await act(async () => {
      rejectSave(new Error("offline"));
      expect(await saving).toBeNull();
    });
    expect(result.current.wordsError).toBeNull();
  });

  it("does not undo a membership edit that landed while the save was in flight", async () => {
    // saved.bundle_ids is the route's snapshot from before its own membership
    // insert. Replacing the whole row with it would restore a tag a concurrent
    // PATCH had already removed.
    mockFetchJson({ words: [{ ...WORD_A, bundle_ids: [10, 20] }] });
    const { result } = renderHook(() => useWords("user-1"));
    await waitFor(() => expect(result.current.loadingWords).toBe(false));

    let resolveSave;
    vi.stubGlobal("fetch", vi.fn((_url, opts = {}) => {
      if (opts?.method === "POST") return new Promise((r) => { resolveSave = r; });
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ bundleIds: [10] }) });
    }));

    let saving;
    await act(async () => { saving = result.current.saveWord({ original: "juosta", base: "juosta", translations: ["to run"] }, 10); });
    // A tag goes while the save is out.
    await act(() => result.current.removeWordFromBundle(1, 20));
    expect(result.current.dbWords[0].bundle_ids).toEqual([10]);

    await act(async () => {
      resolveSave({ ok: true, json: () => Promise.resolve({ word: { ...WORD_A, bundle_ids: [10, 20] } }) });
      await saving;
    });
    expect(result.current.dbWords[0].bundle_ids).toEqual([10]);
  });

  it("adds the membership its own save settled", async () => {
    mockFetchJson({ words: [{ ...WORD_A, bundle_ids: [5] }] });
    const { result } = renderHook(() => useWords("user-1"));
    await waitFor(() => expect(result.current.loadingWords).toBe(false));

    mockFetchJson({ word: { ...WORD_A, bundle_ids: [3] } });
    await act(() => result.current.saveWord({ original: "juosta", base: "juosta", translations: ["to run"] }, 3));
    expect(result.current.dbWords[0].bundle_ids).toEqual([3, 5]);
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

  /** Queues a fetch per call and hands back the resolvers, so a test can
   *  answer requests out of the order they were made. */
  function pendingFetch(record) {
    const resolvers = [];
    vi.stubGlobal("fetch", vi.fn((_url, opts) => {
      record?.(JSON.parse(opts.body));
      return new Promise((r) => resolvers.push(r));
    }));
    return resolvers;
  }

  const ok = (bundleIds) => ({ ok: true, json: () => Promise.resolve({ bundleIds }) });

  /** Requests are chained per membership, so issuing one only reaches fetch on
   *  a later tick. Everything a test starts is settled before it ends. */
  const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });

  it("adds a membership optimistically and confirms it against the server", async () => {
    const result = await loaded([{ ...WORD_A, bundle_ids: [] }]);
    const resolvers = pendingFetch();

    let pending;
    await act(async () => { pending = result.current.addWordToBundle(1, 2); });
    // Optimistic: the tag is there before the request comes back.
    expect(result.current.dbWords[0].bundle_ids).toEqual([2]);

    await act(async () => { resolvers[0](ok([2])); await pending; });
    expect(result.current.dbWords[0].bundle_ids).toEqual([2]);
  });

  it("takes only the membership it asked about from the response", async () => {
    // The response is the word's whole list as the server saw it. Applying all
    // of it would let this answer speak for bundles other requests own.
    const result = await loaded([{ ...WORD_A, bundle_ids: [] }]);
    mockFetchJson({ bundleIds: [2, 5] });
    await act(() => result.current.addWordToBundle(1, 2));
    expect(result.current.dbWords[0].bundle_ids).toEqual([2]);
  });

  it("does not resurrect a membership a faster request already removed", async () => {
    // Remove 10 then 20. The server answers the first with [20] — a snapshot
    // taken before the second landed. Applying that whole array after the
    // second answer of [] would put bundle 20 back on screen despite both
    // deletes having succeeded.
    const result = await loaded([{ ...WORD_A, bundle_ids: [10, 20] }]);
    const resolvers = pendingFetch();

    let pending;
    await act(async () => {
      pending = Promise.all([
        result.current.removeWordFromBundle(1, 10),
        result.current.removeWordFromBundle(1, 20),
      ]);
    });
    expect(resolvers).toHaveLength(2);

    await act(async () => {
      resolvers[1](ok([]));      // the second request answers first
      resolvers[0](ok([20]));    // ...the first answers with its older view
      await pending;
    });
    expect(result.current.dbWords[0].bundle_ids).toEqual([]);
  });

  it("sends an add and a remove of the same membership one after the other", async () => {
    // Each PATCH is several statements with no transaction around them, so run
    // in parallel the DELETE could land before the INSERT and leave the word in
    // the bundle it was just taken out of.
    const result = await loaded([{ ...WORD_A, bundle_ids: [] }]);
    const sent = [];
    const resolvers = pendingFetch((body) => sent.push(body.action));

    let pending;
    await act(async () => {
      pending = Promise.all([
        result.current.addWordToBundle(1, 2),
        result.current.removeWordFromBundle(1, 2),
      ]);
    });
    // Only the add has gone; the remove waits its turn.
    expect(sent).toEqual(["add"]);
    // The screen, though, already shows the reader's last action.
    expect(result.current.dbWords[0].bundle_ids).toEqual([]);

    await act(async () => { resolvers[0](ok([2])); await new Promise((r) => setTimeout(r, 0)); });
    expect(sent).toEqual(["add", "remove"]);

    await act(async () => { resolvers[1](ok([])); await pending; });
    expect(result.current.dbWords[0].bundle_ids).toEqual([]);
  });

  it("lets edits to different memberships go in parallel", async () => {
    const result = await loaded([{ ...WORD_A, bundle_ids: [] }]);
    const sent = [];
    const resolvers = pendingFetch((body) => sent.push(body.bundleId));

    let pending;
    await act(async () => {
      pending = Promise.all([
        result.current.addWordToBundle(1, 2),
        result.current.addWordToBundle(1, 3),
      ]);
    });
    // Different memberships cannot race each other, so neither waits.
    expect(sent).toEqual([2, 3]);

    await act(async () => {
      resolvers[0](ok([2, 3]));
      resolvers[1](ok([2, 3]));
      await pending;
    });
    expect(result.current.dbWords[0].bundle_ids).toEqual([2, 3]);
  });

  it("removes a membership optimistically", async () => {
    const result = await loaded([inBundle]);
    mockFetchJson({ bundleIds: [] });
    await act(() => result.current.removeWordFromBundle(1, 2));
    expect(result.current.dbWords[0].bundle_ids).toEqual([]);
  });

  it("puts the membership back when the server refuses", async () => {
    const result = await loaded([inBundle]);
    mockFetch({ ok: false, status: 500, json: () => Promise.reject(new SyntaxError("not JSON")) });
    await expect(act(() => result.current.removeWordFromBundle(1, 2)))
      .rejects.toThrow(/Could not take that word out of the bundle \(500\)/);
    expect(result.current.dbWords[0].bundle_ids).toEqual([2]);
  });

  it("carries the server's own explanation when it sent one", async () => {
    // A route that says why — the schema guard's 503, say — is more use to the
    // reader than "(503)". The rollback happens either way.
    const result = await loaded([{ ...WORD_A, bundle_ids: [] }]);
    mockFetch({ ok: false, status: 503, json: () => Promise.resolve({ error: "Run db/schema.sql against it." }) });
    await expect(act(() => result.current.addWordToBundle(1, 2))).rejects.toThrow("Run db/schema.sql against it.");
    expect(result.current.dbWords[0].bundle_ids).toEqual([]);
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
    await settle();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does not let a second edit issued from the same render undo the first", async () => {
    // Both calls close over the same dbWords, so an update computed from that
    // snapshot would have the second write [10] back over the first's [20].
    const result = await loaded([{ ...WORD_A, bundle_ids: [10, 20] }]);
    const resolvers = pendingFetch();

    let pending;
    await act(async () => {
      pending = Promise.all([
        result.current.removeWordFromBundle(1, 10),
        result.current.removeWordFromBundle(1, 20),
      ]);
    });
    expect(result.current.dbWords[0].bundle_ids).toEqual([]);

    await act(async () => {
      resolvers.forEach((r) => r(ok([])));
      await pending;
    });
    expect(result.current.dbWords[0].bundle_ids).toEqual([]);
  });

  it("does not reconcile a membership edit that answered after the account changed", async () => {
    let resolvePatch;
    vi.stubGlobal("fetch", vi.fn((_url, opts = {}) => {
      if (opts?.method === "PATCH") return new Promise((r) => { resolvePatch = r; });
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ words: [{ ...WORD_A, bundle_ids: [] }] }) });
    }));

    const { result, rerender } = renderHook(({ uid }) => useWords(uid), { initialProps: { uid: "user-1" } });
    await waitFor(() => expect(result.current.loadingWords).toBe(false));

    let editing;
    await act(async () => { editing = result.current.addWordToBundle(1, 10); });
    rerender({ uid: "user-2" });
    await waitFor(() => expect(result.current.loadingWords).toBe(false));

    await act(async () => {
      resolvePatch({ ok: true, json: () => Promise.resolve({ bundleIds: [10] }) });
      await editing;
    });
    // user-2's list is whatever their own load returned; nothing from the
    // previous account's edit may appear in it.
    expect(result.current.dbWords.every((w) => (w.bundle_ids || []).length === 0)).toBe(true);
  });

  it("does not report a membership edit that failed after the account changed", async () => {
    let rejectPatch;
    vi.stubGlobal("fetch", vi.fn((_url, opts = {}) => {
      if (opts?.method === "PATCH") return new Promise((_r, rej) => { rejectPatch = rej; });
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ words: [{ ...WORD_A, bundle_ids: [] }] }) });
    }));

    const { result, rerender } = renderHook(({ uid }) => useWords(uid), { initialProps: { uid: "user-1" } });
    await waitFor(() => expect(result.current.loadingWords).toBe(false));

    let editing;
    await act(async () => { editing = result.current.addWordToBundle(1, 10); });
    rerender({ uid: "user-2" });
    await waitFor(() => expect(result.current.loadingWords).toBe(false));

    await act(async () => {
      rejectPatch(new Error("offline"));
      // Resolves rather than throwing: page.jsx would put this in the new
      // account's banner.
      expect(await editing).toBeUndefined();
    });
  });

  it("rolls back only the membership that failed, not the whole list", async () => {
    // A rollback restoring the snapshot would drop the concurrent add of 20
    // along with the failed add of 10.
    const result = await loaded([{ ...WORD_A, bundle_ids: [] }]);
    const resolvers = pendingFetch();

    let failing, succeeding;
    await act(async () => {
      failing = result.current.addWordToBundle(1, 10).catch(() => {});
      succeeding = result.current.addWordToBundle(1, 20);
    });
    expect(result.current.dbWords[0].bundle_ids).toEqual([10, 20]);

    await act(async () => {
      resolvers[0]({ ok: false, status: 500, json: () => Promise.reject(new SyntaxError("not JSON")) });
      resolvers[1](ok([20]));
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

  it("keeps the word's bundles when the fresher row does not carry them", async () => {
    // /api/reviews grades through `RETURNING *` on `words`, and membership is
    // not a column there — so the row that comes back after every grade has no
    // bundle_ids at all. Taking it literally dropped every tag on the word the
    // moment it was reviewed.
    mockFetchJson({ words: [{ ...WORD_A, bundle_ids: [10, 20] }] });
    const { result } = renderHook(() => useWords("user-1"));
    await waitFor(() => expect(result.current.dbWords).toHaveLength(1));

    const graded = { ...WORD_A, interval_days: 6 };
    delete graded.bundle_ids;
    act(() => result.current.updateWord(graded));

    expect(result.current.dbWords[0].bundle_ids).toEqual([10, 20]);
    expect(result.current.dbWords[0].interval_days).toBe(6);
  });

  it("still accepts an explicit empty list as 'no bundles'", async () => {
    // Absence is what means "unmentioned"; [] is an answer.
    mockFetchJson({ words: [{ ...WORD_A, bundle_ids: [10] }] });
    const { result } = renderHook(() => useWords("user-1"));
    await waitFor(() => expect(result.current.dbWords).toHaveLength(1));

    act(() => result.current.updateWord({ ...WORD_A, bundle_ids: [] }));
    expect(result.current.dbWords[0].bundle_ids).toEqual([]);
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
