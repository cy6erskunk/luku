"use client";
import { useState } from "react";
import { wordForms, wordBundleIds } from "../lib/utils.js";
import { useDialog } from "../hooks/useDialog.js";

const POS_CLR = { verb: "#7a9e7e", noun: "#9e8a7a", adjective: "#7a8a9e", adverb: "#9e7a9e" };

/** Filter values that are not a bundle id. */
const ALL = "all";
const UNBUNDLED = "none";

/**
 * `bundles` is `bundleStats` — each bundle with the `wordCount` page.jsx
 * already derived from this same word list. The chips read that rather than
 * re-scanning `words` per bundle, so one definition of "how many words are in
 * this bundle" serves the chip and the list it filters to.
 */
export default function WordList({ words, bundles = [], onClose, onDelete, onAddToBundle, onRemoveFromBundle, onDeleteBundle, error, onDismissError }) {
  const [pendingId, setPendingId] = useState(null);
  const [filter, setFilter] = useState(ALL);
  // The word whose "add to bundle" list is expanded, if any.
  const [assigningId, setAssigningId] = useState(null);
  const [pendingBundleDelete, setPendingBundleDelete] = useState(false);

  const clearTransient = () => { setPendingId(null); setAssigningId(null); setPendingBundleDelete(false); };
  const handleBackdropClick = () => { clearTransient(); onClose(); };
  const panelRef = useDialog(handleBackdropClick);

  const byId = new Map(bundles.map((b) => [b.id, b]));
  // Only bundles this list knows about count. A word can hold an id for a
  // bundle that is gone — deleted here while a save carrying it was in flight,
  // or in another tab — and its tag is already invisible, so counting it as
  // bundled would drop the word out of Unbundled with nothing on screen
  // explaining why.
  const knownOf = (w) => wordBundleIds(w).filter((id) => byId.has(id));
  const unbundledCount = words.filter((w) => knownOf(w).length === 0).length;
  const shown = filter === ALL ? words
    : filter === UNBUNDLED ? words.filter((w) => knownOf(w).length === 0)
    : words.filter((w) => wordBundleIds(w).includes(filter));
  const filteredBundle = filter !== ALL && filter !== UNBUNDLED ? byId.get(filter) : null;

  const chip = (active) => ({
    background: active ? "rgba(74,124,158,0.15)" : "rgba(255,255,255,0.02)",
    border: `1px solid ${active ? "rgba(74,124,158,0.4)" : "rgba(255,255,255,0.08)"}`,
    color: active ? "#7ab4d4" : "#6b645e",
    borderRadius: 20, padding: "4px 11px", fontSize: 11, cursor: "pointer", fontFamily: "Georgia,serif", whiteSpace: "nowrap",
  });

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
        ref={panelRef}
        tabIndex={-1}
        aria-labelledby="wordlist-heading"
        onClick={(e) => { e.stopPropagation(); clearTransient(); }}
        style={{ background: "#181d2a", borderRadius: 18, width: "100%", maxWidth: 520, maxHeight: "90vh", display: "flex", flexDirection: "column", overflow: "hidden", alignSelf: "center", animation: "wl-fadeUp 0.15s ease" }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "18px 20px 14px", borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
          <div id="wordlist-heading" style={{ fontSize: 14, fontWeight: 600 }}>Vocabulary ({words.length})</div>
          <button onClick={onClose} aria-label="Close" style={{ background: "none", border: "none", color: "#555", fontSize: 18, cursor: "pointer", lineHeight: 1, padding: "0 4px" }}>✕</button>
        </div>

        {error && (
          // Rendered here, not by page.jsx: every action that can fail from
          // this overlay is taken inside it, and the page's banner sits behind
          // a backdrop this dialog declares aria-modal over — visible to
          // nobody and reachable by no one.
          <div
            role="alert"
            onClick={(e) => e.stopPropagation()}
            style={{ margin: "10px 20px 0", background: "rgba(180,80,80,0.1)", border: "1px solid rgba(180,80,80,0.3)", borderRadius: 10, padding: "9px 12px", fontSize: 12, color: "#c48a8a", display: "flex", alignItems: "flex-start", gap: 10 }}
          >
            <span style={{ flex: 1, lineHeight: 1.5 }}>⚠ {error}</span>
            {onDismissError && (
              <button onClick={onDismissError} aria-label="Dismiss" style={{ background: "none", border: "none", color: "#c48a8a", fontSize: 14, cursor: "pointer", lineHeight: 1, padding: "0 2px" }}>✕</button>
            )}
          </div>
        )}

        {bundles.length > 0 && (
          <div style={{ padding: "10px 20px", borderBottom: "1px solid rgba(255,255,255,0.05)", display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
            <button onClick={() => setFilter(ALL)} aria-pressed={filter === ALL} style={chip(filter === ALL)}>All ({words.length})</button>
            {bundles.map((b) => (
              <button key={b.id} onClick={() => setFilter(b.id)} aria-pressed={filter === b.id} style={chip(filter === b.id)}>
                {b.name} ({b.wordCount})
              </button>
            ))}
            {unbundledCount > 0 && (
              <button onClick={() => setFilter(UNBUNDLED)} aria-pressed={filter === UNBUNDLED} style={chip(filter === UNBUNDLED)}>Unbundled ({unbundledCount})</button>
            )}
            {filteredBundle && onDeleteBundle && (
              // Deletes the grouping only. Saying so on the button matters:
              // "delete" next to a list of words reads as deleting the words.
              pendingBundleDelete
                ? <div onClick={(e) => e.stopPropagation()} style={{ display: "flex", gap: 5, marginLeft: "auto" }}>
                    <button
                      onClick={() => { onDeleteBundle(filteredBundle.id); setFilter(ALL); setPendingBundleDelete(false); }}
                      style={{ background: "rgba(180,80,80,0.15)", border: "1px solid rgba(180,80,80,0.45)", color: "#c48a8a", borderRadius: 6, padding: "4px 9px", fontSize: 11, cursor: "pointer", fontFamily: "Georgia,serif" }}
                    >
                      Delete bundle, keep words?
                    </button>
                  </div>
                : <button
                    onClick={(e) => { e.stopPropagation(); setPendingBundleDelete(true); }}
                    style={{ ...chip(false), marginLeft: "auto", borderColor: "rgba(180,80,80,0.25)", color: "#c48a8a" }}
                  >
                    Delete bundle
                  </button>
            )}
          </div>
        )}

        <div style={{ overflowY: "auto", flex: 1, minHeight: 0, padding: "8px 0" }}>
          {words.length === 0
            ? <div style={{ padding: "32px 20px", textAlign: "center", color: "#555", fontSize: 13 }}>No words saved yet.</div>
            : shown.length === 0
            ? <div style={{ padding: "32px 20px", textAlign: "center", color: "#555", fontSize: 13 }}>
              {/* Unbundled is a filter, not a bundle — tagging its last word
                  empties it, and calling that "this bundle" names something
                  the reader never made. */}
              {filter === UNBUNDLED ? "Every word is in a bundle." : "No words in this bundle yet."}
            </div>
            : shown.map((w) => {
              const ids = wordBundleIds(w);
              const unjoined = bundles.filter((b) => !ids.includes(b.id));
              return (
              <div key={w.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 20px", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                    <span style={{ fontSize: 15, color: "#e8e0d5" }}>{w.base}</span>
                    {w.pos && (
                      <span style={{ fontSize: 9, color: POS_CLR[w.pos] ?? "#666", fontFamily: "monospace" }}>{w.pos}</span>
                    )}
                  </div>
                  <div style={{ fontSize: 12, color: "#6b645e", marginTop: 2 }}>
                    {(w.translations || []).slice(0, 2).join(", ")}
                  </div>
                  {wordForms(w).length > 0 && (
                    <div style={{ fontSize: 11, color: "#4a7c9e", fontFamily: "monospace", marginTop: 2 }}>
                      {wordForms(w).map((f) => f.translation ? `${f.word} — ${f.translation}` : f.word).join(" · ")}
                    </div>
                  )}
                  {bundles.length > 0 && (
                    <div onClick={(e) => e.stopPropagation()} style={{ display: "flex", flexWrap: "wrap", gap: 5, marginTop: 5 }}>
                      {ids.map((id) => byId.get(id)).filter(Boolean).map((b) => (
                        <span key={b.id} style={{ display: "inline-flex", alignItems: "center", gap: 4, background: "rgba(74,124,158,0.1)", border: "1px solid rgba(74,124,158,0.25)", borderRadius: 10, padding: "1px 4px 1px 8px", fontSize: 10, color: "#7ab4d4" }}>
                          {b.name}
                          {onRemoveFromBundle && (
                            <button
                              onClick={() => onRemoveFromBundle(w.id, b.id)}
                              aria-label={`Remove ${w.base} from ${b.name}`}
                              style={{ background: "none", border: "none", color: "#7ab4d4", cursor: "pointer", fontSize: 11, lineHeight: 1, padding: "0 3px" }}
                            >
                              ✕
                            </button>
                          )}
                        </span>
                      ))}
                      {onAddToBundle && unjoined.length > 0 && (
                        assigningId === w.id
                          ? unjoined.map((b) => (
                            <button
                              key={b.id}
                              onClick={() => { onAddToBundle(w.id, b.id); setAssigningId(null); }}
                              style={{ background: "rgba(255,255,255,0.03)", border: "1px dashed rgba(74,124,158,0.4)", borderRadius: 10, padding: "1px 8px", fontSize: 10, color: "#6a9ebe", cursor: "pointer", fontFamily: "Georgia,serif" }}
                            >
                              + {b.name}
                            </button>
                          ))
                          : <button
                              onClick={() => setAssigningId(w.id)}
                              aria-label={`Add ${w.base} to a bundle`}
                              style={{ background: "none", border: "1px dashed rgba(255,255,255,0.15)", borderRadius: 10, padding: "1px 8px", fontSize: 10, color: "#555", cursor: "pointer", fontFamily: "Georgia,serif" }}
                            >
                              + bundle
                            </button>
                      )}
                    </div>
                  )}
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
              );
            })}
        </div>
      </div>
    </div>
    </>
  );
}
