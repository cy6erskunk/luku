import { useState, useCallback } from "react";

/**
 * The Anthropic key is a credential belonging to one account, so it is stored
 * under that account's own localStorage key.
 *
 * It used to live under a single shared name, which meant a browser that had
 * been signed in as somebody else handed their key to whoever signed in next —
 * and every translation was billed to its owner with nothing on screen to say
 * so. That name is now cleared rather than adopted: on a shared browser the
 * next person to sign in is not necessarily the key's owner.
 */
const LEGACY_STORAGE_KEY = "luku_api_key";

export const apiKeyStorageKey = (userId) => `${LEGACY_STORAGE_KEY}:${userId}`;

function readKey(userId) {
  // The cleanup is the security-relevant line here, so it gets its own try:
  // its failure must not decide whether the read runs, nor the read's its.
  // Swallowed because there is nothing to report to — storage that refuses a
  // removeItem cannot be holding a readable copy for the next caller either.
  try { localStorage.removeItem(LEGACY_STORAGE_KEY); } catch {}

  if (!userId) return "";
  // Unavailable storage (private mode, blocked site data) reads as no key,
  // which sends the reader to the key screen rather than breaking the app.
  try {
    return localStorage.getItem(apiKeyStorageKey(userId)) || "";
  } catch { return ""; }
}

export function useApiKey(userId) {
  const [savedKey, _setSavedKey] = useState(() => readKey(userId));

  const setSavedKey = useCallback((v) => {
    _setSavedKey(v);
    if (!userId) return;
    try {
      const name = apiKeyStorageKey(userId);
      if (v) localStorage.setItem(name, v); else localStorage.removeItem(name);
    } catch {}
  }, [userId]);

  return { savedKey, setSavedKey };
}
