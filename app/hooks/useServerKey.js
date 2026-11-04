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
      // The reader: a failed probe just shows the key screen, where they would
      // have started anyway. The operator: in production the answer is always
      // "no" (`developmentKey()`), and a route that throws is already reported
      // by `onRequestError`. A non-2xx never gets here: it resolved to null
      // above. See #110.
      .catch(() => {})
      .finally(() => { if (!cancelled) setChecking(false); });

    return () => { cancelled = true; };
  }, [userId]);

  return { serverKey, checking };
}
