import { useState, useEffect, useRef } from "react";
import { responseError, wordBundleIds } from "../lib/utils.js";

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

  // bundleId is the bundle the reader is collecting into, or null. The server
  // attaches the word to it, so a word saved while a bundle is active never
  // needs a second request to land in the right group.
  const saveWord = async (entry, bundleId = null) => {
    const forAccount = userId;
    let r;
    try {
      r = await fetch("/api/words", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ word: entry.original, base: entry.base, translations: entry.translations, pos: entry.pos, formTranslation: entry.formTranslation, example: entry.example ?? null, example_translation: entry.example_translation ?? null, bundleId: bundleId ?? null }),
      });
      if (!r.ok) throw await responseError(r, "Failed to save word");
    } catch (e) {
      // A failure belongs to the account that asked for it just as a success
      // does. Reported to whoever is signed in now, it would roll back a popup
      // that is gone and raise the previous account's error in this one's
      // banner — page.jsx outlives the switch, so its catch really does run.
      if (accountRef.current !== forAccount) return null;
      throw e;
    }
    const { word: saved } = await r.json();
    // A save that answers after a sign-out belongs to the account that asked
    // for it. Withheld from the caller as well as the list: page.jsx files the
    // returned id under this session's new words.
    if (accountRef.current !== forAccount) return null;
    if (saved) {
      setDbWords((prev) => {
        const existing = prev.find((w) => w.id === saved.id);
        const without = prev.filter((w) => w.id !== saved.id);
        // The row is authoritative for the word, but its bundle_ids is a
        // snapshot the route took before its own membership insert. Taking all
        // of it would let this answer speak for memberships other requests
        // own — a tag removed while the save was in flight would come back. So
        // keep what is on screen and apply only the one this save settled.
        const confirmed = wordBundleIds(saved);
        const merged = existing
          ? {
            ...saved,
            bundle_ids: bundleId != null && confirmed.includes(bundleId)
              ? [...new Set([...wordBundleIds(existing), bundleId])].sort((a, b) => a - b)
              : wordBundleIds(existing),
          }
          : saved;
        return [...without, merged];
      });
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
   * One request at a time per membership.
   *
   * The optimistic update puts the inverse control on screen immediately, so
   * the same word and bundle can be added and then removed before the first
   * request has answered. A PATCH is several statements with no transaction
   * around them, so run in parallel the later DELETE can land before the
   * earlier INSERT and leave the row present after the reader removed it.
   * Chaining by membership makes the server apply them in the order they were
   * asked for; different memberships still go in parallel.
   */
  const inFlight = useRef(new Map());

  const serializePerMembership = (key, run) => {
    const previous = inFlight.current.get(key) ?? Promise.resolve();
    const next = previous.catch(() => {}).then(run);
    inFlight.current.set(key, next);
    next.catch(() => {}).finally(() => {
      if (inFlight.current.get(key) === next) inFlight.current.delete(key);
    });
    return next;
  };

  /**
   * Add or drop one bundle membership for a saved word, optimistically.
   *
   * Every step names a single membership rather than a whole `bundle_ids`
   * array — the optimistic update, the reconcile, and the rollback alike. Two
   * edits to the same word issued before React re-renders would otherwise
   * compute from the same snapshot and the second would undo the first.
   */
  const changeWordBundle = async (id, bundleId, action) => {
    // A guard, not the update: a word that is not on the list has nothing to
    // send, and a stale answer here only costs a request the server 404s.
    if (!dbWords.some((w) => w.id === id)) return;
    // Applied before the queue, so the UI answers the tap even while an
    // earlier request for the same membership is still outstanding.
    applyBundleChange(id, bundleId, action);
    await serializePerMembership(`${id}:${bundleId}`, async () => {
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
        // Only the membership this request settled, not the whole list it came
        // back with. That list is a snapshot taken at the server, so applying
        // all of it lets a slow answer about one bundle resurrect another that
        // a faster request had already removed.
        if (Array.isArray(bundleIds)) {
          applyBundleChange(id, bundleId, bundleIds.includes(bundleId) ? "add" : "remove");
        }
      } catch (e) {
        // The inverse of what was applied. The UI only offers "add" for a
        // bundle the word is not in and "remove" for one it is, so inverting
        // restores exactly the state this call changed — and nothing else.
        applyBundleChange(id, bundleId, action === "add" ? "remove" : "add");
        throw e;
      }
    });
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
