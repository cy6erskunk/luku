import { useState, useEffect, useCallback, useRef } from "react";

/**
 * The per-scan translation cache: what each tapped token resolved to, and
 * whether it has been added to the review list.
 *
 * Keyed by account, for the reason the word list is: this browser can hold two
 * accounts one after the other, and the cache carries an `added` flag that
 * claims a word is on *the reader's* list. Under a shared key the next account
 * inherits both the translations someone else paid for and a tick against
 * words they never saved.
 */
const keyFor = (userId) => `luku_session:${userId}`;

function read(userId) {
  if (!userId) return {};
  try {
    const v = JSON.parse(localStorage.getItem(keyFor(userId)) || "{}");
    return v && typeof v === "object" && !Array.isArray(v) ? v : {};
  } catch { return {}; }
}

export function useSession(userId) {
  const [session, _setSession] = useState(() => read(userId));
  // Both follow the latest *call* rather than the latest render: setSession is
  // reached from handlers that closed over an older account, and it has to
  // write what it just computed without waiting for React to re-render.
  const accountRef = useRef(userId);
  accountRef.current = userId;
  const sessionRef = useRef(session);

  // Swap to the new account's own cache the moment the account changes, rather
  // than leaving the previous one's on screen until something overwrites it.
  useEffect(() => {
    const mine = read(userId);
    sessionRef.current = mine;
    _setSession(mine);
  }, [userId]);

  const setSession = useCallback((v) => {
    const next = typeof v === "function" ? v(sessionRef.current) : v;
    sessionRef.current = next;
    _setSession(next);
    const account = accountRef.current;
    if (!account) return;
    try { localStorage.setItem(keyFor(account), JSON.stringify(next)); } catch {}
  }, []);

  return { session, setSession };
}
