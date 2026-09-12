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
  try {
    localStorage.removeItem(LEGACY_STORAGE_KEY);
    if (!userId) return "";
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
