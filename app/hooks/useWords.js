import { useState, useEffect } from "react";

export function useWords(userId) {
  const [dbWords, setDbWords] = useState([]);
  const [loadingWords, setLoadingWords] = useState(true);

  useEffect(() => {
    if (!userId) { setDbWords([]); setLoadingWords(false); return undefined; }
    setDbWords([]);
    setLoadingWords(true);

    // The list belongs to the account that asked for it. A sign-out and a
    // sign-in as somebody else leave this hook mounted with the earlier
    // request still outstanding, and its response carries the earlier
    // account's words — so a late arrival is dropped rather than rendered
    // under the new account's name.
    let cancelled = false;

    fetch("/api/words")
      .then((r) => r.json())
      .then(({ words }) => { if (!cancelled) setDbWords(words || []); })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoadingWords(false); });

    return () => { cancelled = true; };
  }, [userId]);

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

  return { dbWords, loadingWords, saveWord, updateWord, removeWord, restoreWord };
}
