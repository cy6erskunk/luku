import { useState, useEffect, useCallback, useRef } from "react";
import { responseError } from "../lib/utils.js";
import { isValidBundleId } from "@/lib/shared/bundle.js";

/**
 * The bundle words are being collected into, remembered across reloads so a
 * reading session survives a refresh mid-page.
 *
 * Keyed by account. One shared key would carry a selection across a sign-out:
 * the next account's saves would quote a bundle id that is not theirs until
 * their own list loaded and the sweep below cleared it — and if that load
 * failed, never. A bundle is not a browser preference, it is one account's
 * row, so it is stored where only that account can read it.
 */
const keyFor = (userId) => `luku_bundle:${userId}`;

function readActiveId(userId) {
  if (!userId) return null;
  try {
    // Plain decimal digits, nothing else. parseInt would read "1junk" as 1 and
    // Number would read "0x1" as 1, so either would let a corrupted or
    // hand-edited entry silently activate a real bundle and start routing
    // words into it. Only ever written from String(id), so nothing legitimate
    // is turned away; the server's own bound then keeps a save from being a
    // 400.
    const raw = localStorage.getItem(keyFor(userId)) ?? "";
    const v = /^\d+$/.test(raw) ? Number(raw) : NaN;
    return isValidBundleId(v) ? v : null;
  } catch { return null; }
}

export function useBundles(userId) {
  const [bundles, setBundles] = useState([]);
  const [loadingBundles, setLoadingBundles] = useState(true);
  const [bundlesError, setBundlesError] = useState(null);
  const [activeBundleId, _setActiveBundleId] = useState(() => readActiveId(userId));

  // The account and the selection as of the latest render. A request that
  // answers after either moved has to know, and a callback's closure cannot
  // tell it — the cancelled flag covers the loads, and these cover the writes.
  const accountRef = useRef(userId);
  accountRef.current = userId;
  // Seeded once and moved by the setter, not by rendering: a rollback runs in
  // the same tick as the clear it is undoing, so a render-time assignment
  // would still be reporting the value from before that clear.
  const activeRef = useRef(activeBundleId);
  // Bundles this session has confirmed deleted since the current load began.
  // The snapshot that load is waiting on was taken before the delete, so
  // without this the merge below hands the row back as a ghost that every
  // later delete can only 404 on.
  const deletedSinceLoad = useRef(new Set());

  const setActiveBundleId = useCallback((id) => {
    const value = id ?? null;
    activeRef.current = value;
    _setActiveBundleId(value);
    const account = accountRef.current;
    if (!account) return;
    try {
      if (value == null) localStorage.removeItem(keyFor(account));
      else localStorage.setItem(keyFor(account), String(value));
    } catch {}
  }, []);

  // Swap to the new account's own remembered selection the moment the account
  // changes, rather than waiting for their bundle list to arrive and the sweep
  // to notice. Until this runs there is no window in which one account's id is
  // live under another's session.
  useEffect(() => {
    const mine = readActiveId(userId);
    activeRef.current = mine;
    _setActiveBundleId(mine);
  }, [userId]);

  useEffect(() => {
    if (!userId) { setBundles([]); setBundlesError(null); setLoadingBundles(false); return undefined; }
    // As in useWords: a load still in flight when the account changes must not
    // land under the new one.
    let cancelled = false;
    deletedSinceLoad.current = new Set();
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
          // A bundle deleted while this request was out is gone server-side,
          // whatever the snapshot still shows.
          const live = rows.filter((b) => !deletedSinceLoad.current.has(b.id));
          const known = new Set(live.map((b) => b.id));
          return [...prev.filter((b) => !known.has(b.id)), ...live];
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
    let bundle;
    try {
      const r = await fetch("/api/bundles", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (!r.ok) throw await responseError(r, "Could not create that bundle");
      ({ bundle } = await r.json());
    } catch (e) {
      // A failure is withheld on the same terms as a success, as saveWord and
      // deleteBundle already do. BundlePicker stays mounted across a switch,
      // so a throw reaching it would put the previous account's failure in
      // front of the next one — and clear the form they were typing into.
      if (accountRef.current !== forAccount) return null;
      throw e;
    }
    // Guarded like the load: a create that answers after a sign-out would
    // otherwise drop one account's bundle into the next account's list, where
    // the picker would happily offer it. Withheld from the caller too, not
    // just from the list — BundlePicker selects whatever comes back, and the
    // hook that would store that selection is still mounted after the switch.
    if (accountRef.current !== forAccount) return null;
    // A create whose insert ran before a delete of the same row answers with
    // the row that is now gone — the name was still taken when it looked. The
    // tombstone is what tells the two apart: a genuine re-create of that name
    // gets a new id, since the old one was deleted. Withheld from the caller
    // as well, or BundlePicker selects a bundle the server no longer has.
    if (bundle && deletedSinceLoad.current.has(bundle.id)) return null;
    if (bundle) {
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
      // The row is gone now, so say so against the list as it stands rather
      // than resting on the optimistic removal. Creating a bundle by the same
      // name while this request was in flight puts it back: until the delete
      // lands the name is still taken, so the idempotent insert answers with
      // this very row, and the client adds — and selects — an id the server is
      // about to drop.
      if (accountRef.current === forAccount) {
        deletedSinceLoad.current.add(id);
        setBundles((prev) => prev.filter((b) => b.id !== id));
        if (activeRef.current === id) setActiveBundleId(null);
      }
    } catch (e) {
      // A rollback undoes its own optimistic change and nothing else. The
      // failure is withheld from a changed account as the writes above are, or
      // the caller would raise it in the banner of a session that never asked;
      // the selection comes back only if nothing has claimed it since.
      if (accountRef.current !== forAccount) return;
      setBundles((prev) => prev.some((b) => b.id === id) ? prev : [removed, ...prev]);
      if (wasActive && activeRef.current == null) setActiveBundleId(id);
      throw e;
    }
  };

  return { bundles, loadingBundles, bundlesError, activeBundleId, setActiveBundleId, createBundle, deleteBundle };
}
