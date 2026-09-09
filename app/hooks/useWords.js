import { useState, useEffect } from "react";
import { responseError, wordBundleIds } from "../lib/utils.js";

export function useWords(userId) {
  const [dbWords, setDbWords] = useState([]);
  const [loadingWords, setLoadingWords] = useState(true);
  const [wordsError, setWordsError] = useState(null);

  useEffect(() => {
    if (!userId) { setDbWords([]); setWordsError(null); setLoadingWords(false); return; }
    setDbWords([]);
    setWordsError(null);
    setLoadingWords(true);
    // A load that fails must not read as "you have saved no words yet". An
    // empty list is the app's normal, unremarkable state, so swallowing the
    // failure here hides it completely — which is how a deployment whose
    // database was missing a table looked like a working, empty account.
    (async () => {
      try {
        const r = await fetch("/api/words");
        if (!r.ok) throw await responseError(r, "Could not load your saved words");
        const { words } = await r.json();
        setDbWords(words || []);
      } catch (e) {
        console.error("load words failed", e);
        setWordsError(e.message || "Could not load your saved words");
      } finally {
        setLoadingWords(false);
      }
    })();
  }, [userId]);

  // bundleId is the bundle the reader is collecting into, or null. The server
  // attaches the word to it, so a word saved while a bundle is active never
  // needs a second request to land in the right group.
  const saveWord = async (entry, bundleId = null) => {
    const r = await fetch("/api/words", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ word: entry.original, base: entry.base, translations: entry.translations, pos: entry.pos, formTranslation: entry.formTranslation, example: entry.example ?? null, example_translation: entry.example_translation ?? null, bundleId: bundleId ?? null }),
    });
    if (!r.ok) throw await responseError(r, "Failed to save word");
    const { word: saved } = await r.json();
    if (saved) setDbWords((prev) => { const without = prev.filter((w) => w.id !== saved.id); return [...without, saved]; });
    return saved;
  };

  const updateWord = (updated) => {
    setDbWords((prev) => prev.map((w) => w.id === updated.id ? updated : w));
  };

  const removeWord = (id) => {
    setDbWords((prev) => prev.filter((w) => w.id !== id));
  };

  const restoreWord = (word) => {
    setDbWords((prev) => prev.some((w) => w.id === word.id) ? prev : [...prev, word]);
  };

  const setWordBundles = (id, bundleIds) => {
    setDbWords((prev) => prev.map((w) => w.id === id ? { ...w, bundle_ids: bundleIds } : w));
  };

  /** Applies one membership change to whatever the list holds at the time it
   *  runs, rather than to the copy the caller closed over. Idempotent, so
   *  re-applying an edit that already landed is a no-op. */
  const applyBundleChange = (id, bundleId, action) => {
    setDbWords((prev) => prev.map((w) => {
      if (w.id !== id) return w;
      const ids = wordBundleIds(w);
      if (action === "add") {
        return ids.includes(bundleId) ? w : { ...w, bundle_ids: [...ids, bundleId].sort((a, b) => a - b) };
      }
      return ids.includes(bundleId) ? { ...w, bundle_ids: ids.filter((b) => b !== bundleId) } : w;
    }));
  };

  /**
   * Add or drop one bundle membership for a saved word, optimistically.
   *
   * Both the update and its rollback name a single membership rather than a
   * whole `bundle_ids` array. Two edits to the same word issued before React
   * re-renders would otherwise compute from the same snapshot and the second
   * would undo the first, and a rollback restoring a snapshot would take any
   * edit made since along with it. The server answers with the word's whole
   * membership list, which wins over the guess made here.
   */
  const changeWordBundle = async (id, bundleId, action) => {
    // A guard, not the update: a word that is not on the list has nothing to
    // send, and a stale answer here only costs a request the server 404s.
    if (!dbWords.some((w) => w.id === id)) return;
    applyBundleChange(id, bundleId, action);
    try {
      const r = await fetch("/api/words", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id, bundleId, action }),
      });
      // Carries the server's own message when it sent one — a route that
      // explains itself is more use to the reader than the status alone.
      if (!r.ok) throw await responseError(r, action === "add"
        ? "Could not add that word to the bundle"
        : "Could not take that word out of the bundle");
      const { bundleIds } = await r.json();
      if (Array.isArray(bundleIds)) setWordBundles(id, bundleIds);
    } catch (e) {
      // The inverse of what was applied. The UI only offers "add" for a bundle
      // the word is not in and "remove" for one it is, so inverting restores
      // exactly the state this call changed — and nothing else.
      applyBundleChange(id, bundleId, action === "add" ? "remove" : "add");
      throw e;
    }
  };

  const addWordToBundle = (id, bundleId) => changeWordBundle(id, bundleId, "add");
  const removeWordFromBundle = (id, bundleId) => changeWordBundle(id, bundleId, "remove");

  // A deleted bundle takes its memberships with it server-side (ON DELETE
  // CASCADE); this is the same removal in the copy already on screen.
  const forgetBundle = (bundleId) => {
    setDbWords((prev) => prev.map((w) => wordBundleIds(w).includes(bundleId)
      ? { ...w, bundle_ids: wordBundleIds(w).filter((b) => b !== bundleId) }
      : w));
  };

  /** Undoes forgetBundle for the words it was applied to, when the delete the
   *  optimistic removal was betting on turns out to have failed. */
  const restoreBundle = (bundleId, wordIds) => {
    const ids = new Set(wordIds);
    setDbWords((prev) => prev.map((w) => ids.has(w.id) && !wordBundleIds(w).includes(bundleId)
      ? { ...w, bundle_ids: [...wordBundleIds(w), bundleId].sort((a, b) => a - b) }
      : w));
  };

  return {
    dbWords, loadingWords, wordsError, saveWord, updateWord, removeWord, restoreWord,
    addWordToBundle, removeWordFromBundle, forgetBundle, restoreBundle,
  };
}
