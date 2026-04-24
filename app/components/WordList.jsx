"use client";
import { useState } from "react";

const POS_CLR = { verb: "#7a9e7e", noun: "#9e8a7a", adjective: "#7a8a9e", adverb: "#9e7a9e" };

export default function WordList({ words, onClose, onDelete }) {
  const [pendingId, setPendingId] = useState(null);

  const handleBackdropClick = () => { setPendingId(null); onClose(); };
  const handlePanelClick = () => setPendingId(null);

  return (
    <>
    <style>{`@keyframes wl-fadeUp { from { opacity:0; transform:translateY(5px); } to { opacity:1; transform:translateY(0); } }`}</style>
    <div
      data-testid="wordlist-backdrop"
      onClick={handleBackdropClick}
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 300, display: "flex", alignItems: "flex-end", justifyContent: "center" }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="wordlist-heading"
        onClick={(e) => { e.stopPropagation(); handlePanelClick(); }}
        style={{ background: "#181d2a", borderRadius: "18px 18px 0 0", width: "100%", maxWidth: 520, maxHeight: "90vh", display: "flex", flexDirection: "column", animation: "wl-fadeUp 0.15s ease" }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "18px 20px 14px", borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
          <div id="wordlist-heading" style={{ fontSize: 14, fontWeight: 600 }}>Vocabulary ({words.length})</div>
          <button onClick={onClose} aria-label="Close" style={{ background: "none", border: "none", color: "#555", fontSize: 18, cursor: "pointer", lineHeight: 1, padding: "0 4px" }}>✕</button>
        </div>
        <div style={{ overflowY: "auto", padding: "8px 0" }}>
          {words.length === 0
            ? <div style={{ padding: "32px 20px", textAlign: "center", color: "#555", fontSize: 13 }}>No words saved yet.</div>
            : words.map((w) => (
              <div key={w.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 20px", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                    <span style={{ fontSize: 15, color: "#e8e0d5" }}>{w.word}</span>
                    {w.base && w.base.toLowerCase() !== w.word?.toLowerCase() && (
                      <span style={{ fontSize: 11, color: "#4a7c9e", fontFamily: "monospace" }}>{w.base}</span>
                    )}
                    {w.pos && (
                      <span style={{ fontSize: 9, color: POS_CLR[w.pos] ?? "#666", fontFamily: "monospace" }}>{w.pos}</span>
                    )}
                  </div>
                  <div style={{ fontSize: 12, color: "#6b645e", marginTop: 2 }}>
                    {(w.translations || []).slice(0, 2).join(", ")}
                  </div>
                </div>
                {pendingId === w.id
                  ? <div onClick={(e) => e.stopPropagation()} style={{ display: "flex", gap: 5, flexShrink: 0 }}>
                      <button
                        onClick={() => { onDelete(w.id); setPendingId(null); }}
                        style={{ background: "rgba(180,80,80,0.15)", border: "1px solid rgba(180,80,80,0.45)", color: "#c48a8a", borderRadius: 6, padding: "4px 9px", fontSize: 11, cursor: "pointer", fontFamily: "Georgia,serif" }}
                      >
                        Sure?
                      </button>
                      <button
                        onClick={() => setPendingId(null)}
                        style={{ background: "none", border: "1px solid rgba(255,255,255,0.1)", color: "#555", borderRadius: 6, padding: "4px 9px", fontSize: 11, cursor: "pointer", fontFamily: "Georgia,serif" }}
                      >
                        Cancel
                      </button>
                    </div>
                  : <button
                      onClick={(e) => { e.stopPropagation(); setPendingId(w.id); }}
                      style={{ background: "none", border: "1px solid rgba(180,80,80,0.25)", color: "#c48a8a", borderRadius: 6, padding: "4px 9px", fontSize: 11, cursor: "pointer", fontFamily: "Georgia,serif", flexShrink: 0 }}
                    >
                      Delete
                    </button>}
              </div>
            ))}
        </div>
      </div>
    </div>
    </>
  );
}
