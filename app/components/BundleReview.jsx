/**
 * Pick a bundle by name and review just its words.
 *
 * A bundle with cards due reviews them on the normal SRS schedule; one with
 * nothing due offers a practice pass instead, which is the same distinction
 * the whole-vocabulary buttons make and is labelled the same way.
 */
export default function BundleReview({ bundles, onStartBundleReview, title = "Review a bundle" }) {
  const withWords = bundles.filter((b) => b.wordCount > 0);
  if (withWords.length === 0) return null;

  return (
    <div style={{ width: "100%", maxWidth: 400, marginTop: 20 }}>
      <div style={{ fontSize: 9, letterSpacing: "0.14em", textTransform: "uppercase", color: "#4a6070", fontFamily: "monospace", marginBottom: 8 }}>
        {title}
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        {withWords.map((b) => (
          <button
            key={b.id}
            onClick={(e) => { e.stopPropagation(); onStartBundleReview(b.id); }}
            style={{ display: "flex", alignItems: "center", gap: 6, background: b.dueCount > 0 ? "rgba(74,124,158,0.12)" : "rgba(255,255,255,0.02)", border: `1px solid ${b.dueCount > 0 ? "rgba(74,124,158,0.35)" : "rgba(255,255,255,0.1)"}`, borderRadius: 20, padding: "6px 12px", color: b.dueCount > 0 ? "#7ab4d4" : "#6b645e", fontSize: 12, cursor: "pointer", fontFamily: "Georgia,serif" }}
          >
            <span>{b.name}</span>
            <span style={{ fontSize: 10, fontFamily: "monospace", opacity: 0.8 }}>
              {b.dueCount > 0 ? `${b.dueCount} due` : `${b.wordCount} word${b.wordCount !== 1 ? "s" : ""}`}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
