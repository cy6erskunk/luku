import { useState, useEffect, useCallback, useRef } from "react";
import { responseError } from "../lib/utils.js";
import { isValidBundleId } from "@/lib/shared/bundle.js";

/** The bundle words are being collected into, remembered across reloads so a
 *  reading session survives a refresh mid-page. */
const ACTIVE_KEY = "luku_bundle";

function readActiveId() {
  try {
    // Plain decimal digits, nothing else. parseInt would read "1junk" as 1 and
    // Number would read "0x1" as 1, so either would let a corrupted or
    // hand-edited entry silently activate a real bundle and start routing
    // words into it. Only ever written from String(id), so nothing legitimate
    // is turned away; the server's own bound then keeps a save from being a
    // 400.
    const raw = localStorage.getItem(ACTIVE_KEY) ?? "";
    const v = /^\d+$/.test(raw) ? Number(raw) : NaN;
    return isValidBundleId(v) ? v : null;
  } catch { return null; }
}

export function useBundles(userId) {
  const [bundles, setBundles] = useState([]);
  const [loadingBundles, setLoadingBundles] = useState(true);
  const [bundlesError, setBundlesError] = useState(null);
  const [activeBundleId, _setActiveBundleId] = useState(readActiveId);

  // The account and the selection as of the latest render. A request that
  // answers after either moved has to know, and a callback's closure cannot
  // tell it — the cancelled flag covers the loads, and these cover the writes.
  const accountRef = useRef(userId);
  accountRef.current = userId;
  // Seeded once and moved by the setter, not by rendering: a rollback runs in
  // the same tick as the clear it is undoing, so a render-time assignment
  // would still be reporting the value from before that clear.
  const activeRef = useRef(activeBundleId);

  const setActiveBundleId = useCallback((id) => {
    const value = id ?? null;
    activeRef.current = value;
    _setActiveBundleId(value);
    try {
      if (value == null) localStorage.removeItem(ACTIVE_KEY);
      else localStorage.setItem(ACTIVE_KEY, String(value));
    } catch {}
  }, []);

  useEffect(() => {
    if (!userId) { setBundles([]); setBundlesError(null); setLoadingBundles(false); return undefined; }
    // As in useWords: a load still in flight when the account changes must not
    // land under the new one.
    let cancelled = false;
    setBundles([]);
    setBundlesError(null);
    setLoadingBundles(true);
    // Reported rather than swallowed, for the same reason as the word list: an
    // empty list of bundles is a perfectly ordinary state, so a silent failure
    // is indistinguishable from having created none.
    (async () => {
      try {
        const r = await fetch("/api/bundles");
        if (!r.ok) throw await responseError(r, "Could not load your bundles");
        const { bundles: loaded } = await r.json();
        if (!cancelled) setBundles((prev) => {
          const rows = loaded || [];
          // The effect emptied the list before fetching, so anything sitting
          // in it now was created while this request was in flight — the
          // picker stays usable while the list loads. This snapshot was taken
          // before that bundle existed, so replacing the list wholesale would
          // erase one the server has, and the sweep below would then drop it
          // as the active selection too.
          const known = new Set(rows.map((b) => b.id));
          return [...prev.filter((b) => !known.has(b.id)), ...rows];
        });
      } catch (e) {
        console.error("load bundles failed", e);
        if (!cancelled) setBundlesError(e.message || "Could not load your bundles");
      } finally {
        if (!cancelled) setLoadingBundles(false);
      }
    })();
    return () => { cancelled = true; };
  }, [userId]);

  // The remembered id can name a bundle that is no longer there: deleted in
  // another tab, or belonging to the account that was signed in before this
  // one. Only once the list has actually loaded — a slow fetch, or a failed
  // one, leaves `bundles` empty for a reason that says nothing about whether
  // the remembered bundle exists, and forgetting it then would throw away a
  // good selection (and its localStorage entry) over a dropped connection.
  useEffect(() => {
    if (loadingBundles || bundlesError || activeBundleId == null) return;
    if (!bundles.some((b) => b.id === activeBundleId)) setActiveBundleId(null);
  }, [loadingBundles, bundlesError, bundles, activeBundleId, setActiveBundleId]);

  /** Create a bundle by name, or adopt the one that already has that name —
   *  which is what the server answers with, so both land here the same way. */
  const createBundle = async (name) => {
    const forAccount = userId;
    const r = await fetch("/api/bundles", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name }),
    });
    if (!r.ok) throw await responseError(r, "Could not create that bundle");
    const { bundle } = await r.json();
    // Guarded like the load: a create that answers after a sign-out would
    // otherwise drop one account's bundle into the next account's list, where
    // the picker would happily offer it.
    if (bundle && accountRef.current === forAccount) {
      setBundles((prev) => prev.some((b) => b.id === bundle.id)
        ? prev.map((b) => (b.id === bundle.id ? bundle : b))
        : [bundle, ...prev]);
    }
    return bundle;
  };

  /** Deletes the grouping only — the words themselves stay in the vocabulary. */
  const deleteBundle = async (id) => {
    const removed = bundles.find((b) => b.id === id);
    if (!removed) return;
    const forAccount = userId;
    const wasActive = activeBundleId === id;
    setBundles((prev) => prev.filter((b) => b.id !== id));
    if (wasActive) setActiveBundleId(null);
    try {
      const r = await fetch(`/api/bundles?id=${id}`, { method: "DELETE" });
      if (!r.ok) throw await responseError(r, "Could not delete that bundle");
    } catch (e) {
      // A rollback undoes its own optimistic change and nothing else: not
      // another account's list, and not a selection the reader made while this
      // request was in flight. The bundle comes back either way; the selection
      // only if nothing has claimed it since.
      if (accountRef.current === forAccount) {
        setBundles((prev) => prev.some((b) => b.id === id) ? prev : [removed, ...prev]);
        if (wasActive && activeRef.current == null) setActiveBundleId(id);
      }
      throw e;
    }
  };

  return { bundles, loadingBundles, bundlesError, activeBundleId, setActiveBundleId, createBundle, deleteBundle };
}
