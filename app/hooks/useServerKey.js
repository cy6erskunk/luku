import { useState, useEffect } from "react";

/**
 * Whether this deployment carries its own Anthropic key, which lets the key
 * screen be skipped entirely.
 *
 * Deliberately not persisted: the answer belongs to the deployment, not the
 * browser, so a cached "yes" would survive the env var being removed and
 * leave the user staring at 400s with no way to enter a key.
 */
export function useServerKey(userId) {
  const [serverKey, setServerKey] = useState(false);
  const [checking, setChecking] = useState(Boolean(userId));

  useEffect(() => {
    if (!userId) {
      setServerKey(false);
      setChecking(false);
      return undefined;
    }

    let cancelled = false;
    setChecking(true);

    fetch("/api/claude")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (!cancelled) setServerKey(Boolean(d?.serverKey)); })
      // A failed probe just means the key screen shows, which is the same
      // place the user would have started anyway.
      .catch(() => {})
      .finally(() => { if (!cancelled) setChecking(false); });

    return () => { cancelled = true; };
  }, [userId]);

  return { serverKey, checking };
}
