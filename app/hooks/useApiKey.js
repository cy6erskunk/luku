import { useState, useCallback } from "react";

/**
 * The Anthropic key is a credential belonging to one account, so it is stored
 * under that account's own localStorage key: a single shared name would hand
 * one reader's key to whoever signed in next on the same browser, and every
 * translation would be billed to its owner with nothing on screen to say so.
 */
export const apiKeyStorageKey = (userId) => `luku_api_key:${userId}`;

function readKey(userId) {
  if (!userId) return "";
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
    } catch {
      // Storage refused (quota, private mode, blocked site data). The key still
      // works for this visit, and next time the reader is asked again; the
      // cause is in their browser, so there is nothing for an operator to fix.
    }
  }, [userId]);

  return { savedKey, setSavedKey };
}
