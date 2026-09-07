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
    if (!r.ok) throw new Error(`Failed to save word (${r.status})`);
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

  /**
   * Add or drop one bundle membership for a saved word, optimistically. The
   * server answers with the word's whole membership list, which wins over the
   * guess made here; a failure puts back exactly what was there before.
   */
  const changeWordBundle = async (id, bundleId, action) => {
    const current = dbWords.find((w) => w.id === id);
    if (!current) return;
    const before = wordBundleIds(current);
    const after = action === "add"
      ? [...new Set([...before, bundleId])].sort((a, b) => a - b)
      : before.filter((b) => b !== bundleId);
    setWordBundles(id, after);
    try {
      const r = await fetch("/api/words", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id, bundleId, action }),
      });
      if (!r.ok) throw new Error(`Failed to update bundle (${r.status})`);
      const { bundleIds } = await r.json();
      if (Array.isArray(bundleIds)) setWordBundles(id, bundleIds);
    } catch (e) {
      setWordBundles(id, before);
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
