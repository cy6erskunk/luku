import { useRef } from "react";
import * as stylex from "@stylexjs/stylex";
import TranslationPopup from "./TranslationPopup.jsx";
import { buttonStyles, shared } from "../lib/styles.js";

const s = stylex.create({
  container: {
    position: "relative",
    padding: "24px 18px 100px",
  },
  topBar: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  xlatingLabel: {
    fontSize: 11,
    color: "#4a7c9e",
    display: "flex",
    alignItems: "center",
    gap: 4,
  },
  hintLabel: {
    display: "flex",
    alignItems: "center",
    gap: 8,
  },
  tapHint: {
    fontSize: 11,
    color: "#555",
    background: "rgba(74,124,158,0.08)",
    padding: "2px 9px",
    borderRadius: 20,
  },
  legendRow: {
    display: "flex",
    gap: 12,
    marginBottom: 14,
    fontSize: 10,
    color: "#555",
  },
  legendItem: {
    display: "flex",
    alignItems: "center",
    gap: 4,
  },
  localBanner: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "8px 13px",
    marginBottom: 14,
    fontSize: 12,
  },
  localLabel: {
    color: "#6b645e",
  },
  rescanBtn: {
    padding: "5px 12px",
    fontSize: 11,
  },
  aiBanner: {
    background: "rgba(74,124,158,0.08)",
    border: "1px solid rgba(74,124,158,0.15)",
    borderRadius: 9,
    padding: "8px 13px",
    marginBottom: 14,
    fontSize: 11,
    color: "#4a7c9e",
  },
  errBox: {
    marginBottom: 14,
  },
  textBox: {
    background: "rgba(255,255,255,0.015)",
    border: "1px solid rgba(255,255,255,0.06)",
    borderRadius: 14,
    padding: "20px 16px",
    lineHeight: 2.1,
    fontSize: 17,
  },
  punctuation: {
    color: "#333",
  },
  word: {
    cursor: "pointer",
    borderRadius: 3,
    padding: "1px 2px",
    transition: "all 0.12s",
  },
  wordDefault: {
    background: "transparent",
    color: "#e0d8cf",
    borderBottom: "1px dotted rgba(232,224,213,0.12)",
  },
  wordLoading: {
    background: "rgba(74,124,158,0.3)",
    color: "#e0d8cf",
    borderBottom: "none",
  },
  wordAdded: {
    background: "rgba(74,124,158,0.15)",
    color: "#7ab4d4",
    borderBottom: "none",
  },
  wordSeen: {
    background: "rgba(122,158,126,0.1)",
    color: "#8eba92",
    borderBottom: "none",
  },
  statsRow: {
    display: "flex",
    gap: 8,
    marginTop: 14,
  },
  statCard: {
    padding: "7px 13px",
  },
  statNum: {
    fontSize: 18,
    fontWeight: 600,
    color: "#4a7c9e",
  },
  statLabel: {
    fontSize: 10,
    color: "#555",
  },
  bottomBar: {
    position: "fixed",
    bottom: 0,
    left: 0,
    right: 0,
    padding: "12px 18px",
    background: "linear-gradient(to top,#0f1117 60%,transparent)",
    zIndex: 50,
    display: "flex",
    flexDirection: "column",
    gap: 8,
    alignItems: "center",
  },
  doneBtn: {
    maxWidth: 480,
    display: "block",
  },
});

export default function ReadStage({
  tokens, session, savedBases, xlating,
  popup,
  ocrSource, busy, err,
  loadingWords, dueWords, newWords = [],
  onWord, onAddWord, onRescanWithAI, onStartReview, onStartNewReview, onAddApiKey,
}) {
  const containerRef = useRef();

  return (
    <div ref={containerRef} {...stylex.props(s.container)}>
      <div {...stylex.props(s.topBar)}>
        <div {...stylex.props(shared.stepLabel)}>Step 2 — Read</div>
        <div {...stylex.props(s.hintLabel)}>
          {xlating && (
            <span {...stylex.props(s.xlatingLabel)}>
              <span {...stylex.props(shared.spinner)}>⟳</span>translating…
            </span>
          )}
          <span {...stylex.props(s.tapHint)}>tap any word</span>
        </div>
      </div>

      <div {...stylex.props(s.legendRow)}>
        {[["#4a7c9e", "rgba(74,124,158,0.15)", "added"], ["#7a9e7e", "rgba(122,158,126,0.1)", "seen"]].map(([c, bg, l]) => (
          <div key={l} {...stylex.props(s.legendItem)}>
            <div style={{ width: 7, height: 7, background: bg, border: `1.5px solid ${c}`, borderRadius: 2 }} />{l}
          </div>
        ))}
      </div>

      {ocrSource === "local" && (
        <div {...stylex.props(shared.surface, s.localBanner)}>
          <span {...stylex.props(s.localLabel)}>Scanned locally with Tesseract</span>
          <button onClick={onRescanWithAI} disabled={busy} {...stylex.props(buttonStyles.ghost, s.rescanBtn)} style={{ opacity: busy ? 0.5 : 1 }}>
            {busy ? "Scanning…" : "Re-scan with AI"}
          </button>
        </div>
      )}
      {ocrSource === "ai" && (
        <div {...stylex.props(s.aiBanner)}>
          Scanned with AI (Claude Vision)
        </div>
      )}
      {err && (
        <div {...stylex.props(shared.errorBox, s.errBox)}>
          ⚠ {err}
        </div>
      )}

      <div {...stylex.props(s.textBox)}>
        {tokens.map((tok, i) => {
          if (tok.t === "br") return <br key={i} />;
          if (tok.t === "sp") return <span key={i}> </span>;
          if (tok.t === "pu") return <span key={i} {...stylex.props(s.punctuation)}>{tok.v}</span>;
          const added = session[tok.k]?.added || savedBases.has(session[tok.k]?.base);
          const seen = !!session[tok.k] && !added;
          const loading = xlating === tok.k;
          return (
            <span
              key={i}
              onClick={(e) => onWord(e, tok, containerRef)}
              {...stylex.props(
                s.word,
                loading ? s.wordLoading : added ? s.wordAdded : seen ? s.wordSeen : s.wordDefault,
              )}
            >
              {tok.v}
            </span>
          );
        })}
      </div>

      <div {...stylex.props(s.statsRow)}>
        {[{ n: Object.keys(session).length, l: "looked up" }, { n: Object.values(session).filter((w) => w.added).length, l: "added" }].map(({ n, l }) => (
          <div key={l} {...stylex.props(shared.surface, s.statCard)}>
            <div {...stylex.props(s.statNum)}>{n}</div>
            <div {...stylex.props(s.statLabel)}>{l}</div>
          </div>
        ))}
      </div>

      <div {...stylex.props(s.bottomBar)}>
        {newWords.length > 0 && (
          <button onClick={onStartNewReview} disabled={loadingWords} {...stylex.props(buttonStyles.primary, shared.fullWidth, s.doneBtn)} style={{ opacity: loadingWords ? 0.5 : 1 }}>
            Done Reading → Review {newWords.length} new word{newWords.length !== 1 ? "s" : ""}
          </button>
        )}
        {(newWords.length === 0 || dueWords.length > 0) && (
          <button onClick={onStartReview} disabled={loadingWords} {...stylex.props(newWords.length > 0 ? buttonStyles.ghost : buttonStyles.primary, shared.fullWidth, s.doneBtn)} style={{ opacity: loadingWords ? 0.5 : 1 }}>
            {newWords.length > 0
              ? `Skip to due review (${dueWords.length} due)`
              : `Done Reading → Review${loadingWords ? "…" : dueWords.length > 0 ? ` (${dueWords.length} due)` : ""}`}
          </button>
        )}
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
