import { useState, useEffect, useCallback, useRef } from "react";
import { reportClientError } from "../lib/report.js";

export function useWords(userId) {
  const [dbWords, setDbWords] = useState([]);
  const [loadingWords, setLoadingWords] = useState(true);
  const [loadError, setLoadError] = useState(false);

  // Only the newest load may write. A sign-out and a sign-in as somebody else
  // leave the earlier account's request outstanding; Retry leaves the load it
  // supersedes outstanding. A counter covers both — a flag closed over by the
  // effect cannot see the retry.
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
        // A route handler that threw answers with a bare 500 carrying no JSON,
        // so parsing first would replace the real failure with a syntax error.
        if (!r.ok) throw new Error(`Failed to load words (${r.status})`);
        return r.json();
      })
      .then(({ words }) => { if (newest()) setDbWords(words || []); })
      .catch((e) => {
        // Swallowed, this looked like a brand-new account: an empty list, no
        // review offered, and nothing to say the list had failed to arrive.
        reportClientError("load words", e);
        if (newest()) setLoadError(true);
      })
      .finally(() => { if (newest()) setLoadingWords(false); });
  }, [userId]);

  // No cleanup: starting a load retires the one before it, and an unmount
  // leaves a request whose resolution writes to nothing.
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
