import { useState, useCallback } from "react";

export function useApiKey() {
  const [savedKey, _setSavedKey] = useState(() => {
    try { return localStorage.getItem("luku_api_key") || ""; } catch { return ""; }
  });

  const setSavedKey = useCallback((v) => {
    _setSavedKey(v);
    try { if (v) localStorage.setItem("luku_api_key", v); else localStorage.removeItem("luku_api_key"); } catch {}
  }, []);

  return { savedKey, setSavedKey };
}
