import { useState, useEffect, useCallback } from "react";
import { responseError } from "../lib/utils.js";

/** The bundle words are being collected into, remembered across reloads so a
 *  reading session survives a refresh mid-page. */
const ACTIVE_KEY = "luku_bundle";

function readActiveId() {
  try {
    const v = Number.parseInt(localStorage.getItem(ACTIVE_KEY) ?? "", 10);
    return Number.isSafeInteger(v) && v > 0 ? v : null;
  } catch { return null; }
}

export function useBundles(userId) {
  const [bundles, setBundles] = useState([]);
  const [loadingBundles, setLoadingBundles] = useState(true);
  const [bundlesError, setBundlesError] = useState(null);
  const [activeBundleId, _setActiveBundleId] = useState(readActiveId);

  const setActiveBundleId = useCallback((id) => {
    _setActiveBundleId(id ?? null);
    try {
      if (id == null) localStorage.removeItem(ACTIVE_KEY);
      else localStorage.setItem(ACTIVE_KEY, String(id));
    } catch {}
  }, []);

  useEffect(() => {
    if (!userId) { setBundles([]); setBundlesError(null); setLoadingBundles(false); return; }
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
        const { bundles: rows } = await r.json();
        setBundles(rows || []);
      } catch (e) {
        console.error("load bundles failed", e);
        setBundlesError(e.message || "Could not load your bundles");
      } finally {
        setLoadingBundles(false);
      }
    })();
  }, [userId]);

  // The remembered id can name a bundle that is no longer there: deleted in
  // another tab, or belonging to the account that was signed in before this
  // one. Only once the list has actually loaded, or a slow fetch would clear a
  // perfectly good selection.
  useEffect(() => {
    if (loadingBundles || activeBundleId == null) return;
    if (!bundles.some((b) => b.id === activeBundleId)) setActiveBundleId(null);
  }, [loadingBundles, bundles, activeBundleId, setActiveBundleId]);

  /** Create a bundle by name, or adopt the one that already has that name —
   *  which is what the server answers with, so both land here the same way. */
  const createBundle = async (name) => {
    const r = await fetch("/api/bundles", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name }),
    });
    if (!r.ok) throw new Error(`Failed to create bundle (${r.status})`);
    const { bundle } = await r.json();
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
    setBundles((prev) => prev.filter((b) => b.id !== id));
    if (activeBundleId === id) setActiveBundleId(null);
    try {
      const r = await fetch(`/api/bundles?id=${id}`, { method: "DELETE" });
      if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
    } catch (e) {
      setBundles((prev) => prev.some((b) => b.id === id) ? prev : [removed, ...prev]);
      throw e;
    }
  };

  return { bundles, loadingBundles, bundlesError, activeBundleId, setActiveBundleId, createBundle, deleteBundle };
}
