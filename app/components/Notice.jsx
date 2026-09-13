"use client";

/**
 * The one place a background failure becomes visible to the reader.
 *
 * Every write this app makes is optimistic, and until this banner existed
 * every one of them failed silently: a word list that never arrived looked
 * like a brand-new account, and a save the server rejected still showed
 * "✓ Added to review". The commonest cause is a deployment running against a
 * database that never had `db/schema.sql` re-run, which no amount of client
 * retrying fixes — so the message says what the reader lost, not why. The
 * cause goes to the console and to Sentry, where whoever forgot the migration
 * will look.
 *
 * Fixed, and above the overlays at zIndex 300, because a delete refused from
 * inside the word list has to be readable from inside it rather than reported
 * onto the page hidden behind. Anchored to the bottom so it displaces neither
 * the header nor the word the reader just tapped.
 */
export default function Notice({ message, onRetry, retryLabel = "Retry", onDismiss }) {
  if (!message) return null;

  // The page closes the translation popup on any click that reaches it.
  // Dismissing a banner is not a click on the page behind it.
  const contain = (fn) => (e) => { e.stopPropagation(); fn(); };

  return (
    <div
      role="alert"
      style={{ position: "fixed", left: 12, right: 12, bottom: 12, zIndex: 400, maxWidth: 520, margin: "0 auto", display: "flex", alignItems: "center", gap: 10, background: "#241a1a", border: "1px solid rgba(180,80,80,0.45)", borderRadius: 10, padding: "10px 12px", fontSize: 12, color: "#c48a8a", boxShadow: "0 6px 24px rgba(0,0,0,0.45)" }}
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
