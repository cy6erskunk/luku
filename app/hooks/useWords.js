import { useState, useEffect, useCallback, useRef } from "react";

export function useWords(userId) {
  const [dbWords, setDbWords] = useState([]);
  const [loadingWords, setLoadingWords] = useState(true);
  const [loadError, setLoadError] = useState(false);

  // The list belongs to the account that asked for it, and to the newest
  // attempt made for that account. A sign-out and a sign-in as somebody else
  // leave this hook mounted with the earlier request still outstanding, and
  // its response carries the earlier account's words — so a superseded load is
  // dropped rather than rendered under the new account's name. A counter
  // rather than a flag closed over by the effect, because a retry starts a
  // load from outside the effect and must supersede the one it retries.
  const loadIdRef = useRef(0);

  const loadWords = useCallback(() => {
    const id = ++loadIdRef.current;
    const newest = () => loadIdRef.current === id;

    if (!userId) { setDbWords([]); setLoadingWords(false); setLoadError(false); return; }
    setDbWords([]);
    setLoadingWords(true);
    setLoadError(false);

    fetch("/api/words")
      .then((r) => {
        // A route handler that threw — the shape a forgotten migration takes —
        // answers with a bare 500 whose body is not JSON. Checking the status
        // first keeps that from surfacing as a parse error about a "<", which
        // says nothing about what actually failed.
        if (!r.ok) throw new Error(`Failed to load words (${r.status})`);
        return r.json();
      })
      .then(({ words }) => { if (newest()) setDbWords(words || []); })
      .catch((e) => {
        // This used to be swallowed whole, which left the page looking like a
        // brand-new account: an empty list, no review offered, and nothing on
        // screen to say the list had simply failed to arrive. The caller shows
        // a banner; the console keeps the cause.
        console.error("load words failed", e);
        if (newest()) setLoadError(true);
      })
      .finally(() => { if (newest()) setLoadingWords(false); });
  }, [userId]);

  // No cleanup: starting a load is what retires the one before it, so a change
  // of account is already covered, and an unmount leaves a request whose
  // resolution writes to nothing.
  useEffect(() => { loadWords(); }, [loadWords]);

  const saveWord = async (entry) => {
    const r = await fetch("/api/words", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ word: entry.original, base: entry.base, translations: entry.translations, pos: entry.pos, formTranslation: entry.formTranslation, example: entry.example ?? null, example_translation: entry.example_translation ?? null }),
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

  return { dbWords, loadingWords, loadError, reloadWords: loadWords, saveWord, updateWord, removeWord, restoreWord };
}
