import { useState, useCallback } from "react";

export function useSession() {
  const [session, _setSession] = useState(() => {
    try {
      const v = JSON.parse(localStorage.getItem("luku_session") || "{}");
      return v && typeof v === "object" && !Array.isArray(v) ? v : {};
    } catch { return {}; }
  });

  const setSession = useCallback((v) => {
    let next;
    _setSession((prev) => { next = typeof v === "function" ? v(prev) : v; return next; });
    try { localStorage.setItem("luku_session", JSON.stringify(next)); } catch {}
  }, []);

  return { session, setSession };
}
