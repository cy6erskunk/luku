import { useState, useCallback } from "react";

/**
 * The per-scan translation cache holds the text the reader scanned and what
 * each tapped word means, so it is scoped to the account that built it for the
 * same reason the API key is: one shared name showed one reader's page to the
 * next person to sign in on the browser.
 */
const LEGACY_STORAGE_KEY = "luku_session";

export const sessionStorageKey = (userId) => `${LEGACY_STORAGE_KEY}:${userId}`;

function readSession(userId) {
  try {
    localStorage.removeItem(LEGACY_STORAGE_KEY);
    if (!userId) return {};
    const v = JSON.parse(localStorage.getItem(sessionStorageKey(userId)) || "{}");
    return v && typeof v === "object" && !Array.isArray(v) ? v : {};
  } catch { return {}; }
}

export function useSession(userId) {
  const [session, _setSession] = useState(() => readSession(userId));

  const setSession = useCallback((v) => {
    let next;
    _setSession((prev) => { next = typeof v === "function" ? v(prev) : v; return next; });
    if (!userId) return;
    try { localStorage.setItem(sessionStorageKey(userId), JSON.stringify(next)); } catch {}
  }, [userId]);

  return { session, setSession };
}
