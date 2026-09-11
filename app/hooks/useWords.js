import { useState, useEffect, useRef } from "react";
import { responseError } from "../lib/utils.js";

export function useWords(userId) {
  const [dbWords, setDbWords] = useState([]);
  // The account as of the latest render. The cancelled flag below covers the
  // load, which belongs to an effect; a write does not, and needs this.
  const accountRef = useRef(userId);
  accountRef.current = userId;
  const [loadingWords, setLoadingWords] = useState(true);
  const [wordsError, setWordsError] = useState(null);

  useEffect(() => {
    if (!userId) { setDbWords([]); setWordsError(null); setLoadingWords(false); return undefined; }
    // Sign out and back in as someone else and two loads are in flight at
    // once. Whichever answers last would otherwise win, so the first account's
    // vocabulary can land under the second account's session.
    let cancelled = false;
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
        if (!cancelled) setDbWords(words || []);
      } catch (e) {
        console.error("load words failed", e);
        if (!cancelled) setWordsError(e.message || "Could not load your saved words");
      } finally {
        if (!cancelled) setLoadingWords(false);
      }
    })();
    return () => { cancelled = true; };
  }, [userId]);

  const saveWord = async (entry) => {
    const forAccount = userId;
    let saved;
    try {
      const r = await fetch("/api/words", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ word: entry.original, base: entry.base, translations: entry.translations, pos: entry.pos, formTranslation: entry.formTranslation, example: entry.example ?? null, example_translation: entry.example_translation ?? null }),
      });
      if (!r.ok) throw await responseError(r, "Failed to save word");
      // Inside the guarded region with the rest: a 2xx whose body is truncated
      // rejects here, and a rejection reaching the caller after a sign-out does
      // the same damage as any other.
      ({ word: saved } = await r.json());
    } catch (e) {
      // A failure belongs to the account that asked for it just as a success
      // does. Reported to whoever is signed in now, it would roll back a popup
      // that is gone and raise the previous account's error in this one's
      // banner — page.jsx outlives the switch, so its catch really does run.
      if (accountRef.current !== forAccount) return null;
      throw e;
    }
    // Withheld from the caller as well as the list: page.jsx files the
    // returned id under this session's new words.
    if (accountRef.current !== forAccount) return null;
    if (saved) {
      setDbWords((prev) => [...prev.filter((w) => w.id !== saved.id), saved]);
    }
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

  return {
    dbWords, loadingWords, wordsError, saveWord, updateWord, removeWord, restoreWord,
  };
}
