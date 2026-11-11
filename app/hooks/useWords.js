import { useState, useEffect, useCallback, useRef } from "react";
import { reportClientError } from "../lib/report.js";
import { pickSchedule } from "../../lib/shared/schedule.js";

/**
 * The least time between two background refreshes. Switching tabs back and
 * forth should not cost a request each time; a tab away for half a minute is
 * worth one, since the bot or another device may have graded cards meanwhile.
 */
export const REFRESH_MIN_INTERVAL_MS = 30_000;

export function useWords(userId) {
  const [dbWords, setDbWordsState] = useState([]);
  const [loadingWords, setLoadingWords] = useState(true);
  const [loadError, setLoadError] = useState(false);

  // Only the newest load may write. A sign-out and a sign-in as somebody else
  // leave the earlier account's request outstanding; Retry leaves the load it
  // supersedes outstanding. A counter covers both — a flag closed over by the
  // effect cannot see the retry.
  const loadIdRef = useRef(0);
  // Bumped by every local change to the list, so a background refresh can tell
  // that its reply was sent before a grade, save or delete it would undo.
  const changeSeqRef = useRef(0);
  const setDbWords = useCallback((update) => {
    changeSeqRef.current++;
    setDbWordsState(update);
  }, []);
  // When the list last arrived and was taken; 0 until the first load lands,
  // which is also what stops a refresh starting while a load is still out.
  // Only a reply that was used moves it, so a refresh whose reply was dropped
  // leaves the next return free to try again.
  const loadedAtRef = useRef(0);
  const refreshingRef = useRef(false);

  const loadWords = useCallback(() => {
    const id = ++loadIdRef.current;
    const newest = () => loadIdRef.current === id;

    loadedAtRef.current = 0;
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
      .then(({ words }) => {
        if (!newest()) return;
        setDbWords(words || []);
        loadedAtRef.current = Date.now();
      })
      .catch((e) => {
        // Swallowed, this looked like a brand-new account: an empty list, no
        // review offered, and nothing to say the list had failed to arrive.
        reportClientError("load words", e);
        if (newest()) setLoadError(true);
      })
      .finally(() => { if (newest()) setLoadingWords(false); });
  }, [userId, setDbWords]);

  // No cleanup: starting a load retires the one before it, and an unmount
  // leaves a request whose resolution writes to nothing.
  useEffect(() => { loadWords(); }, [loadWords]);

  /**
   * Fetches the list again without blanking it, so a tab left open catches up
   * with grades made on the bot or another device. Without it the due count
   * only ever grew, and a card already reviewed elsewhere stayed due here.
   *
   * Quiet on purpose: no loading state and no Notice. The list on screen
   * stays usable, and a failed refresh leaves it exactly as it was. The reply
   * is dropped if a load started since, or if anything changed the list while
   * it was out — a reply sent before a grade landed would otherwise put the
   * old schedule back.
   */
  const refreshWords = useCallback(() => {
    if (!userId || loadedAtRef.current === 0 || refreshingRef.current) return;
    if (Date.now() - loadedAtRef.current < REFRESH_MIN_INTERVAL_MS) return;
    const loadId = loadIdRef.current;
    const changeSeq = changeSeqRef.current;
    refreshingRef.current = true;

    fetch("/api/words")
      .then((r) => {
        if (!r.ok) throw new Error(`Failed to refresh words (${r.status})`);
        return r.json();
      })
      .then(({ words }) => {
        if (loadIdRef.current !== loadId || changeSeqRef.current !== changeSeq) return;
        if (!Array.isArray(words)) return;
        setDbWords(words);
        loadedAtRef.current = Date.now();
      })
      .catch((e) => {
        // A failure waits out the interval like a success, so a server that
        // is down is not asked again on every tab switch.
        loadedAtRef.current = Date.now();
        reportClientError("refresh words", e);
      })
      .finally(() => { refreshingRef.current = false; });
  }, [userId, setDbWords]);

  useEffect(() => {
    const onVisible = () => { if (document.visibilityState === "visible") refreshWords(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [refreshWords]);

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

  /**
   * Applies a grade's result. Only the columns a grade writes are taken from
   * the reply — the route already sends no others, and this holds the line
   * for any reply that does: swapping a whole row in once let a grade that
   * answered late put back an example the reader had replaced in the
   * meantime. A column the reply lacks keeps its local value.
   */
  const applySchedule = (reply) => {
    const { id, ...schedule } = pickSchedule(reply);
    setDbWords((prev) => prev.map((w) => w.id === id ? { ...w, ...schedule } : w));
  };

  /**
   * Stores a new example for a saved word. Only the example fields are merged
   * into the local copy: the row may have been graded while the request was
   * out, and the reply carries nothing else.
   */
  const saveExample = async (id, example, example_translation) => {
    const r = await fetch("/api/words", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id, example, example_translation }),
    });
    if (!r.ok) throw new Error(`Failed to save example (${r.status})`);
    const { word: saved } = await r.json();
    setDbWords((prev) => prev.map((w) => w.id === id
      ? { ...w, example: saved.example, example_translation: saved.example_translation }
      : w));
    return saved;
  };

  const removeWord = (id) => {
    setDbWords((prev) => prev.filter((w) => w.id !== id));
  };

  const restoreWord = (word) => {
    setDbWords((prev) => prev.some((w) => w.id === word.id) ? prev : [...prev, word]);
  };

  return { dbWords, loadingWords, loadError, reloadWords: loadWords, saveWord, saveExample, applySchedule, removeWord, restoreWord };
}
