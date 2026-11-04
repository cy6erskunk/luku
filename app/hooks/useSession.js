import { useState, useEffect } from "react";

/**
 * The per-scan translation cache holds the text the reader scanned and what
 * each tapped word means, so it is scoped to the account that built it for the
 * same reason the API key is: one shared name showed one reader's page to the
 * next person to sign in on the browser.
 */
export const sessionStorageKey = (userId) => `luku_session:${userId}`;

function readSession(userId) {
  if (!userId) return {};
  try {
    const v = JSON.parse(localStorage.getItem(sessionStorageKey(userId)) || "{}");
    return v && typeof v === "object" && !Array.isArray(v) ? v : {};
  } catch { return {}; }
}

export function useSession(userId) {
  const [session, setSession] = useState(() => readSession(userId));

  // Persisting follows the rendered state rather than the call that asked for
  // it. React runs a state updater only when it processes the update, so
  // reading the next value out of the updater in order to write it here left
  // the string "undefined" in storage whenever another update was already
  // pending on this component — and the whole scan's cache with it.
  //
  // A refused write (quota, private mode, blocked site data) is ignored: the
  // cache still serves this visit, a reload just means scanning the page
  // again, and the cause is in the reader's browser, not the deployment.
  useEffect(() => {
    if (!userId) return;
    try { localStorage.setItem(sessionStorageKey(userId), JSON.stringify(session)); } catch {}
  }, [userId, session]);

  return { session, setSession };
}
