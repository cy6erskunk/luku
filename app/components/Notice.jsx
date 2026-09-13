"use client";

/** One line of visible fallout from a write that did not land. */
export default function Notice({ message, onRetry, retryLabel = "Retry", onDismiss }) {
  if (!message) return null;

  // The page closes the translation popup on any click that reaches it.
  const contain = (fn) => (e) => { e.stopPropagation(); fn(); };

  return (
    <div
      role="alert"
      style={{ position: "fixed", left: 12, right: 12, bottom: 12, zIndex: 100, maxWidth: 520, margin: "0 auto", display: "flex", alignItems: "center", gap: 10, background: "#241a1a", border: "1px solid rgba(180,80,80,0.45)", borderRadius: 10, padding: "10px 12px", fontSize: 12, color: "#c48a8a", boxShadow: "0 6px 24px rgba(0,0,0,0.45)" }}
    >
      <span style={{ flex: 1, minWidth: 0 }}>⚠ {message}</span>
      {onRetry && (
        <button onClick={contain(onRetry)} style={{ flexShrink: 0, padding: "4px 11px", borderRadius: 8, fontSize: 11, cursor: "pointer", fontFamily: "Georgia,serif", background: "transparent", border: "1px solid rgba(180,80,80,0.4)", color: "#c48a8a" }}>
          {retryLabel}
        </button>
      )}
      {onDismiss && (
        <button onClick={contain(onDismiss)} aria-label="Dismiss" style={{ flexShrink: 0, padding: "2px 6px", borderRadius: 6, fontSize: 14, lineHeight: 1, cursor: "pointer", fontFamily: "Georgia,serif", background: "transparent", border: "none", color: "#c48a8a" }}>
          ×
        </button>
      )}
    </div>
  );
}
