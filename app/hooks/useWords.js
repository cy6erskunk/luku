import { useState, useEffect } from "react";

export function useWords(userId) {
  const [dbWords, setDbWords] = useState([]);
  const [loadingWords, setLoadingWords] = useState(true);

  useEffect(() => {
    if (!userId) { setDbWords([]); setLoadingWords(false); return; }
    setDbWords([]);
    setLoadingWords(true);
    fetch("/api/words")
      .then((r) => r.json())
      .then(({ words }) => setDbWords(words || []))
      .catch(() => {})
      .finally(() => setLoadingWords(false));
  }, [userId]);

  const saveWord = async (entry) => {
    const r = await fetch("/api/words", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ word: entry.original, base: entry.base, translations: entry.translations, pos: entry.pos }),
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
