import { Bg } from "../lib/styles.js";

const POS_CLR = { verb: "#7a9e7e", noun: "#9e8a7a", adjective: "#7a8a9e", adverb: "#9e7a9e" };

export default function TranslationPopup({ popup, containerRef, session, onAddWord, onAddApiKey }) {
  if (!popup) return null;
  const containerWidth = containerRef?.current?.offsetWidth ?? 360;
  const left = Math.max(Math.min((popup.x ?? 150) - 125, containerWidth - 258), 4);
  const top = Math.max((popup.y ?? 80) - 155, 8);

  const inListBadge = (
    <div
      aria-label="already in your list"
      title="Already in your list"
      style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 10, letterSpacing: "0.05em", color: "#7ab4d4", background: "rgba(74,124,158,0.12)", border: "1px solid rgba(74,124,158,0.3)", borderRadius: 10, padding: "2px 7px", fontFamily: "monospace" }}
    >
      <span aria-hidden="true">✓</span>in your list
    </div>
  );

  return (
    <div
      onClick={(e) => e.stopPropagation()}
      style={{ position: "absolute", left, top, width: 250, background: "#181d2a", border: "1px solid rgba(74,124,158,0.45)", borderRadius: 12, padding: 14, boxShadow: "0 12px 40px rgba(0,0,0,0.7)", zIndex: 200, animation: "fadeUp 0.12s ease" }}
    >
      {popup.noKey
        ? (
          <div style={{ textAlign: "center", padding: "12px 0", color: "#6b645e", fontSize: 12 }}>
            <div style={{ fontSize: 19, color: "#e8e0d5", fontWeight: 600, marginBottom: 8 }}>{popup.word}</div>
            Add your API key to translate words.
            <button onClick={onAddApiKey} style={{ ...Bg, marginTop: 10, padding: "5px 12px", fontSize: 11, display: "block", width: "100%" }}>Add API key</button>
          </div>
        )
        : popup.loading
        ? (
          <div style={{ textAlign: "center", padding: "18px 0", color: "#4a7c9e" }}>
            <div style={{ fontSize: 22, animation: "spin 1s linear infinite", marginBottom: 6 }}>⟳</div>
            <div style={{ fontSize: 12 }}>Analysing "{popup.word}"…</div>
            {popup.existsInDb && <div style={{ marginTop: 8, display: "flex", justifyContent: "center" }}>{inListBadge}</div>}
          </div>
        )
        : (
          <>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
              <div>
                <div style={{ fontSize: 19, color: "#e8e0d5", fontWeight: 600 }}>{popup.base || popup.word}</div>
                {popup.existsInDb && <div style={{ marginTop: 6 }}>{inListBadge}</div>}
              </div>
              {popup.pos && (
                <div style={{ fontSize: 9, padding: "2px 6px", borderRadius: 8, marginTop: 2, fontFamily: "monospace", color: POS_CLR[popup.pos] ?? "#666", background: "rgba(255,255,255,0.05)", border: `1px solid ${(POS_CLR[popup.pos] ?? "#666")}44` }}>
                  {popup.pos}
                </div>
              )}
            </div>
            <div style={{ marginBottom: 12 }}>
              {(popup.translations || []).map((t, i) => (
                <div key={i} style={{ fontSize: i === 0 ? 14 : 12, color: i === 0 ? "#c8c0b5" : "#6b645e", paddingBottom: 2 }}>
                  {i === 0 ? "→ " : "   "}{t}
                </div>
              ))}
            </div>
            {popup.base && popup.base !== popup.word?.toLowerCase() && (
              <div style={{ marginBottom: 12, paddingTop: 8, borderTop: "1px solid rgba(255,255,255,0.06)" }}>
                <div style={{ fontSize: 9, letterSpacing: "0.12em", textTransform: "uppercase", color: "#4a7c9e", fontFamily: "monospace", marginBottom: 3 }}>in text</div>
                <div style={{ fontSize: 12, color: "#c8c0b5" }}>
                  {popup.word}
                  {popup.formTranslation && <span style={{ color: "#6b645e" }}> — {popup.formTranslation}</span>}
                </div>
              </div>
            )}
            {session[popup.k] && (
              (popup.added || session[popup.k]?.added)
                ? <div style={{ fontSize: 11, color: "#4a7c9e", textAlign: "center", padding: 5, background: "rgba(74,124,158,0.1)", borderRadius: 6 }}>✓ Added to review</div>
                : <button onClick={onAddWord} style={{ width: "100%", padding: 7, fontSize: 12, cursor: "pointer", background: "rgba(74,124,158,0.18)", border: "1px solid rgba(74,124,158,0.38)", color: "#7ab4d4", borderRadius: 7, fontFamily: "inherit" }}>+ Add to review list</button>
            )}
          </>
        )
      }
    </div>
  );
}
