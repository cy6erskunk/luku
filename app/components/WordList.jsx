"use client";
import { useState } from "react";
import * as stylex from "@stylexjs/stylex";
import { wordForms } from "../lib/utils.js";
import { POS_CLR } from "../lib/tokens.js";

const fadeUp = stylex.keyframes({
  from: { opacity: 0, transform: "translateY(5px)" },
  to: { opacity: 1, transform: "translateY(0)" },
});

const s = stylex.create({
  backdrop: {
    position: "fixed",
    inset: 0,
    background: "rgba(0,0,0,0.6)",
    zIndex: 300,
    display: "flex",
    alignItems: "flex-end",
    justifyContent: "center",
  },
  dialog: {
    background: "#181d2a",
    borderRadius: 18,
    width: "100%",
    maxWidth: 520,
    maxHeight: "90vh",
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
    alignSelf: "center",
    animationName: fadeUp,
    animationDuration: "0.15s",
    animationTimingFunction: "ease",
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "18px 20px 14px",
    borderBottom: "1px solid rgba(255,255,255,0.07)",
  },
  heading: {
    fontSize: 14,
    fontWeight: 600,
  },
  closeBtn: {
    background: "none",
    border: "none",
    color: "#555",
    fontSize: 18,
    cursor: "pointer",
    lineHeight: 1,
    padding: "0 4px",
  },
  list: {
    overflowY: "auto",
    flex: 1,
    minHeight: 0,
    padding: "8px 0",
  },
  emptyMsg: {
    padding: "32px 20px",
    textAlign: "center",
    color: "#555",
    fontSize: 13,
  },
  row: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    padding: "10px 20px",
    borderBottom: "1px solid rgba(255,255,255,0.04)",
  },
  rowContent: {
    flex: 1,
    minWidth: 0,
  },
  baseLine: {
    display: "flex",
    alignItems: "baseline",
    gap: 8,
  },
  baseText: {
    fontSize: 15,
    color: "#e8e0d5",
  },
  posLabel: {
    fontSize: 9,
    fontFamily: "monospace",
  },
  translations: {
    fontSize: 12,
    color: "#6b645e",
    marginTop: 2,
  },
  forms: {
    fontSize: 11,
    color: "#4a7c9e",
    fontFamily: "monospace",
    marginTop: 2,
  },
  actionRow: {
    display: "flex",
    gap: 5,
    flexShrink: 0,
  },
  confirmBtn: {
    background: "rgba(180,80,80,0.15)",
    border: "1px solid rgba(180,80,80,0.45)",
    color: "#c48a8a",
    borderRadius: 6,
    padding: "4px 9px",
    fontSize: 11,
    cursor: "pointer",
    fontFamily: "Georgia,serif",
  },
  cancelBtn: {
    background: "none",
    border: "1px solid rgba(255,255,255,0.1)",
    color: "#555",
    borderRadius: 6,
    padding: "4px 9px",
    fontSize: 11,
    cursor: "pointer",
    fontFamily: "Georgia,serif",
  },
  deleteBtn: {
    background: "none",
    border: "1px solid rgba(180,80,80,0.25)",
    color: "#c48a8a",
    borderRadius: 6,
    padding: "4px 9px",
    fontSize: 11,
    cursor: "pointer",
    fontFamily: "Georgia,serif",
    flexShrink: 0,
  },
});

export default function WordList({ words, onClose, onDelete }) {
  const [pendingId, setPendingId] = useState(null);

  const handleBackdropClick = () => { setPendingId(null); onClose(); };
  const handlePanelClick = () => setPendingId(null);

  return (
    <div
      data-testid="wordlist-backdrop"
      onClick={handleBackdropClick}
      {...stylex.props(s.backdrop)}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="wordlist-heading"
        onClick={(e) => { e.stopPropagation(); handlePanelClick(); }}
        {...stylex.props(s.dialog)}
      >
        <div {...stylex.props(s.header)}>
          <div id="wordlist-heading" {...stylex.props(s.heading)}>Vocabulary ({words.length})</div>
          <button onClick={onClose} aria-label="Close" {...stylex.props(s.closeBtn)}>✕</button>
        </div>
        <div {...stylex.props(s.list)}>
          {words.length === 0
            ? <div {...stylex.props(s.emptyMsg)}>No words saved yet.</div>
            : words.map((w) => (
              <div key={w.id} {...stylex.props(s.row)}>
                <div {...stylex.props(s.rowContent)}>
                  <div {...stylex.props(s.baseLine)}>
                    <span {...stylex.props(s.baseText)}>{w.base}</span>
                    {w.pos && (
                      <span {...stylex.props(s.posLabel)} style={{ color: POS_CLR[w.pos] ?? "#666" }}>{w.pos}</span>
                    )}
                  </div>
                  <div {...stylex.props(s.translations)}>
                    {(w.translations || []).slice(0, 2).join(", ")}
                  </div>
                  {wordForms(w).length > 0 && (
                    <div {...stylex.props(s.forms)}>
                      {wordForms(w).map((f) => f.translation ? `${f.word} — ${f.translation}` : f.word).join(" · ")}
                    </div>
                  )}
                </div>
                {pendingId === w.id
                  ? <div onClick={(e) => e.stopPropagation()} {...stylex.props(s.actionRow)}>
                      <button
                        onClick={() => { onDelete(w.id); setPendingId(null); }}
                        {...stylex.props(s.confirmBtn)}
                      >
                        Sure?
                      </button>
                      <button
                        onClick={() => setPendingId(null)}
                        {...stylex.props(s.cancelBtn)}
                      >
                        Cancel
                      </button>
                    </div>
                  : <button
                      onClick={(e) => { e.stopPropagation(); setPendingId(w.id); }}
                      {...stylex.props(s.deleteBtn)}
                    >
                      Delete
                    </button>}
              </div>
            ))}
        </div>
      </div>
    </div>
  );
}
