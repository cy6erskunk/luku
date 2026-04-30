import { useRef } from "react";
import TranslationPopup from "./TranslationPopup.jsx";

const Bp = { padding: "13px 18px", borderRadius: 12, fontSize: 14, cursor: "pointer", border: "none", fontFamily: "Georgia,serif", background: "linear-gradient(135deg,#4a7c9e,#2d5a7a)", color: "#fff" };
const Bg = { ...Bp, background: "transparent", border: "1px solid rgba(255,255,255,0.12)", color: "#6b645e" };

export default function ReadStage({
  tokens, session, savedBases, xlating,
  popup,
  ocrSource, busy, err,
  loadingWords, dueWords,
  onWord, onAddWord, onRescanWithAI, onStartReview, onAddApiKey,
}) {
  const containerRef = useRef();

  return (
    <div ref={containerRef} style={{ position: "relative", padding: "24px 18px 100px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <div style={{ fontSize: 10, letterSpacing: "0.15em", textTransform: "uppercase", color: "#4a7c9e", fontFamily: "monospace" }}>Step 2 — Read</div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {xlating && (
            <span style={{ fontSize: 11, color: "#4a7c9e", display: "flex", alignItems: "center", gap: 4 }}>
              <span style={{ animation: "spin 1s linear infinite", display: "inline-block" }}>⟳</span>translating…
            </span>
          )}
          <span style={{ fontSize: 11, color: "#555", background: "rgba(74,124,158,0.08)", padding: "2px 9px", borderRadius: 20 }}>tap any word</span>
        </div>
      </div>

      <div style={{ display: "flex", gap: 12, marginBottom: 14, fontSize: 10, color: "#555" }}>
        {[["#4a7c9e", "rgba(74,124,158,0.15)", "added"], ["#7a9e7e", "rgba(122,158,126,0.1)", "seen"]].map(([c, bg, l]) => (
          <div key={l} style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <div style={{ width: 7, height: 7, background: bg, border: `1.5px solid ${c}`, borderRadius: 2 }} />{l}
          </div>
        ))}
      </div>

      {ocrSource === "local" && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 9, padding: "8px 13px", marginBottom: 14, fontSize: 12 }}>
          <span style={{ color: "#6b645e" }}>Scanned locally with Tesseract</span>
          <button onClick={onRescanWithAI} disabled={busy} style={{ ...Bg, padding: "5px 12px", fontSize: 11, opacity: busy ? 0.5 : 1 }}>
            {busy ? "Scanning…" : "Re-scan with AI"}
          </button>
        </div>
      )}
      {ocrSource === "ai" && (
        <div style={{ background: "rgba(74,124,158,0.08)", border: "1px solid rgba(74,124,158,0.15)", borderRadius: 9, padding: "8px 13px", marginBottom: 14, fontSize: 11, color: "#4a7c9e" }}>
          Scanned with AI (Claude Vision)
        </div>
      )}
      {err && (
        <div style={{ marginBottom: 14, background: "rgba(180,80,80,0.1)", border: "1px solid rgba(180,80,80,0.3)", borderRadius: 10, padding: "11px 14px", fontSize: 12, color: "#c48a8a" }}>
          ⚠ {err}
        </div>
      )}

      <div style={{ background: "rgba(255,255,255,0.015)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 14, padding: "20px 16px", lineHeight: 2.1, fontSize: 17 }}>
        {tokens.map((tok, i) => {
          if (tok.t === "br") return <br key={i} />;
          if (tok.t === "sp") return <span key={i}> </span>;
          if (tok.t === "pu") return <span key={i} style={{ color: "#333" }}>{tok.v}</span>;
          const added = session[tok.k]?.added || savedBases.has(session[tok.k]?.base);
          const seen = !!session[tok.k] && !added;
          const loading = xlating === tok.k;
          return (
            <span
              key={i}
              onClick={(e) => onWord(e, tok, containerRef)}
              style={{ cursor: "pointer", borderRadius: 3, padding: "1px 2px", background: loading ? "rgba(74,124,158,0.3)" : added ? "rgba(74,124,158,0.15)" : seen ? "rgba(122,158,126,0.1)" : "transparent", color: added ? "#7ab4d4" : seen ? "#8eba92" : "#e0d8cf", borderBottom: !added && !seen && !loading ? "1px dotted rgba(232,224,213,0.12)" : "none", transition: "all 0.12s" }}
            >
              {tok.v}
            </span>
          );
        })}
      </div>

      <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
        {[{ n: Object.keys(session).length, l: "looked up" }, { n: Object.values(session).filter((w) => w.added).length, l: "added" }].map(({ n, l }) => (
          <div key={l} style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 9, padding: "7px 13px" }}>
            <div style={{ fontSize: 18, fontWeight: 600, color: "#4a7c9e" }}>{n}</div>
            <div style={{ fontSize: 10, color: "#555" }}>{l}</div>
          </div>
        ))}
      </div>

      <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, padding: "12px 18px", background: "linear-gradient(to top,#0f1117 60%,transparent)", zIndex: 50 }}>
        <button onClick={onStartReview} disabled={loadingWords} style={{ ...Bp, width: "100%", maxWidth: 480, margin: "0 auto", display: "block", opacity: loadingWords ? 0.5 : 1 }}>
          Done Reading → Review{loadingWords ? "…" : dueWords.length > 0 ? ` (${dueWords.length} due)` : ""}
        </button>
      </div>

      <TranslationPopup
        popup={popup}
        containerRef={containerRef}
        session={session}
        onAddWord={onAddWord}
        onAddApiKey={onAddApiKey}
      />
    </div>
  );
}
