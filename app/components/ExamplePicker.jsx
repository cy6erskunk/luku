import { useState, useEffect, useRef, useCallback } from "react";
import { Bp, Bg } from "../lib/styles.js";

/**
 * Small popup under a review card's example: asks for a new example, then
 * lets the reader keep it, ask for another, or close. Lives only as long as
 * its card — ReviewStage keys it on the word id, so grading or moving on
 * unmounts it and any reply still in flight writes to nothing.
 *
 * `onFetch(avoid)` resolves to { example, example_translation }; `onAccept`
 * stores one. Both reject on failure, and the failure is told here rather
 * than in the page banner, which sits beneath the card the reader is looking
 * at — unless the popup is gone by the time a save fails. The reader can
 * still leave mid-save (the header switches stage or restarts the pass), and
 * then `onSaveLost` hands the failure to something that outlived the card.
 */
export default function ExamplePicker({ current, onFetch, onAccept, onClose, onSaveLost }) {
  const [suggestion, setSuggestion] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  // Every example the reader has already seen for this word, so "another"
  // asks for something new rather than the one just turned down.
  const seenRef = useRef(current ? [current] : []);
  const requestRef = useRef(0);
  const mountedRef = useRef(true);
  useEffect(() => {
    const mounted = mountedRef;
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
  // Read through a ref so a parent passing a fresh function each render does
  // not re-run the opening request.
  const onFetchRef = useRef(onFetch);
  useEffect(() => { onFetchRef.current = onFetch; });

  const fetchOne = useCallback(() => {
    const id = ++requestRef.current;
    setLoading(true);
    setError(null);
    onFetchRef.current([...seenRef.current])
      .then((s) => {
        if (requestRef.current !== id) return;
        seenRef.current.push(s.example);
        setSuggestion(s);
      })
      .catch(() => { if (requestRef.current === id) setError("Couldn't get a new example."); })
      .finally(() => { if (requestRef.current === id) setLoading(false); });
  }, []);

  // Asked for once on open: the button that opened it was the request. The
  // cleanup retires whatever is still in flight, so a reply arriving after
  // the card moved on is dropped. Started on a timer rather than directly:
  // development's Strict Mode mounts, unmounts and remounts at once, and only
  // a request not yet sent can be called off — a started one is already
  // billed.
  useEffect(() => {
    const requests = requestRef;
    const timer = setTimeout(fetchOne, 0);
    return () => { clearTimeout(timer); requests.current++; };
  }, [fetchOne]);

  // Not while saving, for the same reason Reject is disabled then: closed
  // mid-save, a refused save would have nowhere left to be told.
  useEffect(() => {
    if (saving) return;
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, saving]);

  const accept = async () => {
    if (!suggestion || saving) return;
    setSaving(true);
    setError(null);
    try {
      await onAccept(suggestion);
      onClose();
    } catch {
      if (!mountedRef.current) { onSaveLost?.(); return; }
      setError("Couldn't save that example.");
      setSaving(false);
    }
  };

  const busy = loading || saving;

  return (
    <div
      role="group"
      aria-label="Suggested example"
      style={{ marginTop: 10, width: "100%", textAlign: "left", background: "#161a22", border: "1px solid rgba(74,124,158,0.35)", borderRadius: 12, padding: "12px 14px", animation: "fadeUp 0.15s ease-out" }}
    >
      <div style={{ fontSize: 9, letterSpacing: "0.12em", textTransform: "uppercase", color: "#4a7c9e", fontFamily: "monospace", marginBottom: 8 }}>new example</div>
      <div aria-live="polite" style={{ minHeight: 36 }}>
        {loading
          ? <div style={{ fontSize: 13, color: "#6b645e" }}>Thinking…</div>
          : suggestion && (
            <>
              <div style={{ fontSize: 14, color: "#c8c0b5", fontStyle: "italic" }}>{suggestion.example}</div>
              {suggestion.example_translation && (
                <div style={{ marginTop: 4, fontSize: 12, color: "#6b645e", fontStyle: "italic" }}>{suggestion.example_translation}</div>
              )}
            </>
          )}
        {error && <div role="alert" style={{ marginTop: 6, fontSize: 12, color: "#c48a8a" }}>{error}</div>}
      </div>
      <div style={{ display: "flex", gap: 6, marginTop: 10, opacity: busy ? 0.5 : 1 }}>
        <button onClick={onClose} disabled={saving} title="Keep the current example" style={{ ...Bg, flex: 1, fontSize: 12, padding: "6px 8px" }}>Reject</button>
        <button onClick={fetchOne} disabled={busy} style={{ ...Bg, flex: 1, fontSize: 12, padding: "6px 8px" }}>↻ Another</button>
        <button onClick={accept} disabled={busy || !suggestion} style={{ ...Bp, flex: 1, fontSize: 12, padding: "6px 8px" }}>Accept</button>
      </div>
    </div>
  );
}
