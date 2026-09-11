import { useState, useEffect, useRef } from "react";
import { findExistingWord, responseError, wordBundleIds } from "../lib/utils.js";

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
    // Attaching a bundle is a membership edit like any other, so it queues and
    // versions like one: the POST's CTE is atomic in itself but says nothing
    // about its order against a PATCH the reader issues while it is in flight,
    // and a word already in the active bundle can be re-added and then untagged
    // before the save answers.
    // Keyed by the word's id, which is what changeWordBundle keys on — the
    // base would be a separate key space and the two would never meet. A word
    // that is not on the list yet has no id and needs none: nothing can be
    // editing a membership of a word that does not exist.
    const existing = bundleId == null ? null : findExistingWord(dbWords, { base: entry.base });
    if (bundleId == null || !existing) return saveWordNow(entry, bundleId, null, null);
    const key = membershipKey(existing.id, bundleId);
    const version = claimIntent(key, "add");
    return serializePerMembership(key, () => saveWordNow(entry, bundleId, key, version));
  };

  const saveWordNow = async (entry, bundleId, key, version) => {
    const forAccount = userId;
    let saved;
    try {
      const r = await fetch("/api/words", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ word: entry.original, base: entry.base, translations: entry.translations, pos: entry.pos, formTranslation: entry.formTranslation, example: entry.example ?? null, example_translation: entry.example_translation ?? null, bundleId: bundleId ?? null }),
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
      // The row is authoritative for the word, but its bundle_ids is a snapshot
      // the route took before its own membership insert. Taking all of it would
      // let this answer speak for memberships other requests own — a tag
      // removed while the save was in flight would come back. So keep what is
      // on screen and apply only the one this save settled, and only while it
      // is still what the reader last asked for: they can untag the word while
      // this save is in flight, and attaching afterwards would put the tag back
      // against their final action.
      //
      // Decided out here rather than inside the updater: React may call that
      // twice, and settleIntent is a side effect.
      const attach = bundleId != null && wordBundleIds(saved).includes(bundleId)
        && (key == null || isLatestIntent(key, version));
      if (attach && key != null) settleIntent(key, "add");
      setDbWords((prev) => {
        const existing = prev.find((w) => w.id === saved.id);
        const without = prev.filter((w) => w.id !== saved.id);
        const merged = existing
          ? {
            ...saved,
            bundle_ids: attach
              ? [...new Set([...wordBundleIds(existing), bundleId])].sort((a, b) => a - b)
              : wordBundleIds(existing),
          }
          : saved;
        return [...without, merged];
      });
    }
    return saved;
  };

  /**
   * Replace a word with a fresher copy of the same row.
   *
   * `bundle_ids` is carried over when the incoming row does not mention it.
   * Membership lives in its own table, so a row selected straight out of
   * `words` — which is what `/api/reviews` answers a grade with — has no such
   * field, and taking it at face value would drop every tag the word has the
   * moment it is graded. An explicit `[]` still means "no bundles": the test
   * is absence, not emptiness.
   */
  const updateWord = (updated) => {
    setDbWords((prev) => prev.map((w) => w.id === updated.id
      ? (updated.bundle_ids === undefined ? { ...updated, bundle_ids: wordBundleIds(w) } : updated)
      : w));
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
   * One request at a time per membership, and one *intent* per membership.
   *
   * Two separate things go wrong without this, and the queue alone only fixes
   * the first. A PATCH is several statements with no transaction around them,
   * so run in parallel a later DELETE can land before an earlier INSERT and
   * leave the row present after the reader removed it — the queue orders the
   * requests. But ordering the requests does not make an older answer stop
   * speaking: an add and a remove in quick succession leave the screen correct
   * until the add's response arrives and reconciles the tag back on, where it
   * stays until the remove finally answers. The reader is shown the opposite
   * of what they last asked for, with the wrong control beside it.
   *
   * So every action claims a version for its membership before it touches the
   * screen, and a response reconciles or rolls back only while that version is
   * still the latest thing asked for. Different memberships stay parallel.
   *
   * A save carrying a bundle takes part in both. Its POST attaches membership
   * in the same statement as the word, which is atomic in itself but says
   * nothing about its order against a PATCH the reader issues meanwhile — so
   * the save queues on that membership like any other edit.
   */
  const inFlight = useRef(new Map());
  const intents = useRef(new Map());

  const membershipKey = (id, bundleId) => `${id}:${bundleId}`;

  /** Records what the reader last asked for, and stamps it. */
  const claimIntent = (key, want) => {
    const version = (intents.current.get(key)?.version ?? 0) + 1;
    intents.current.set(key, { version, want });
    return version;
  };

  const isLatestIntent = (key, version) => intents.current.get(key)?.version === version;

  /** What the membership is believed to be now, after the last settled edit. */
  const settleIntent = (key, want) => {
    const current = intents.current.get(key);
    if (current) intents.current.set(key, { ...current, want });
  };

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
    const forAccount = userId;
    // A guard, not the update: a word that is not on the list has nothing to
    // send, and a stale answer here only costs a request the server 404s.
    if (!dbWords.some((w) => w.id === id)) return;
    const key = membershipKey(id, bundleId);
    const version = claimIntent(key, action);
    // Applied before the queue, so the UI answers the tap even while an
    // earlier request for the same membership is still outstanding.
    applyBundleChange(id, bundleId, action);
    await serializePerMembership(key, async () => {
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
        // Nothing lands under an account that did not ask for it — the list
        // this would reconcile against is someone else's now, and the word id
        // it names means nothing there.
        if (accountRef.current !== forAccount) return;
        // Nor does an answer the reader has already overruled. The queue will
        // still send what they asked for next; reconciling to this one first
        // would put the opposite of their last action on screen until it does.
        if (!isLatestIntent(key, version)) return;
        // Only the membership this request settled, not the whole list it came
        // back with. That list is a snapshot taken at the server, so applying
        // all of it lets a slow answer about one bundle resurrect another that
        // a faster request had already removed.
        if (Array.isArray(bundleIds)) {
          const settled = bundleIds.includes(bundleId) ? "add" : "remove";
          applyBundleChange(id, bundleId, settled);
          settleIntent(key, settled);
        }
      } catch (e) {
        // Neither does a failure: rolled back against the wrong list it would
        // edit a stranger's word, and reported it would put the previous
        // account's error in this one's banner.
        if (accountRef.current !== forAccount) return;
        // A rollback is as stale as a reconcile: undoing this edit once the
        // reader has asked for something newer would undo theirs instead.
        if (!isLatestIntent(key, version)) throw e;
        // The inverse of what was applied. The UI only offers "add" for a
        // bundle the word is not in and "remove" for one it is, so inverting
        // restores exactly the state this call changed — and nothing else.
        const undone = action === "add" ? "remove" : "add";
        applyBundleChange(id, bundleId, undone);
        settleIntent(key, undone);
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
   *  optimistic removal was betting on turns out to have failed.
   *
   *  The ids it is given were read off the screen, so they can include a
   *  membership that was only ever optimistic — added while this bundle's
   *  delete was pending, then rolled back when its own PATCH failed. Restoring
   *  from that snapshot would put back a tag the server never had, so a
   *  membership whose last settled edit says it is gone is left alone. */
  const restoreBundle = (bundleId, wordIds) => {
    const ids = new Set(wordIds.filter(
      (id) => intents.current.get(membershipKey(id, bundleId))?.want !== "remove"));
    setDbWords((prev) => prev.map((w) => ids.has(w.id) && !wordBundleIds(w).includes(bundleId)
      ? { ...w, bundle_ids: [...wordBundleIds(w), bundleId].sort((a, b) => a - b) }
      : w));
  };

  return {
    dbWords, loadingWords, wordsError, saveWord, updateWord, removeWord, restoreWord,
    addWordToBundle, removeWordFromBundle, forgetBundle, restoreBundle,
  };
}
