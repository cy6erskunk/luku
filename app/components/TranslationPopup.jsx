import * as stylex from "@stylexjs/stylex";
import { buttonStyles, shared } from "../lib/styles.js";
import { POS_CLR } from "../lib/tokens.js";

const fadeUp = stylex.keyframes({
  from: { opacity: 0, transform: "translateY(5px)" },
  to: { opacity: 1, transform: "translateY(0)" },
});

const s = stylex.create({
  popup: {
    position: "absolute",
    width: 250,
    background: "#181d2a",
    border: "1px solid rgba(74,124,158,0.45)",
    borderRadius: 12,
    padding: 14,
    boxShadow: "0 12px 40px rgba(0,0,0,0.7)",
    zIndex: 200,
    animationName: fadeUp,
    animationDuration: "0.12s",
    animationTimingFunction: "ease",
  },
  noKeyWrap: {
    textAlign: "center",
    padding: "12px 0",
    color: "#6b645e",
    fontSize: 12,
  },
  wordTitle: {
    fontSize: 19,
    color: "#e8e0d5",
    fontWeight: 600,
  },
  wordTitleMb: {
    marginBottom: 8,
  },
  addKeyBtn: {
    marginTop: 10,
    padding: "5px 12px",
    fontSize: 11,
    display: "block",
    width: "100%",
  },
  loadingWrap: {
    textAlign: "center",
    padding: "18px 0",
    color: "#4a7c9e",
  },
  loadingIcon: {
    fontSize: 22,
    marginBottom: 6,
  },
  loadingText: {
    fontSize: 12,
  },
  badgeCenter: {
    marginTop: 8,
    display: "flex",
    justifyContent: "center",
  },
  headerRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 10,
  },
  badgeMargin: {
    marginTop: 6,
  },
  posTag: {
    fontSize: 9,
    padding: "2px 6px",
    borderRadius: 8,
    marginTop: 2,
    fontFamily: "monospace",
    background: "rgba(255,255,255,0.05)",
  },
  translations: {
    marginBottom: 12,
  },
  translationPrimary: {
    fontSize: 14,
    color: "#c8c0b5",
    paddingBottom: 2,
  },
  translationSecondary: {
    fontSize: 12,
    color: "#6b645e",
    paddingBottom: 2,
  },
  formSection: {
    marginBottom: 12,
    paddingTop: 8,
    borderTop: "1px solid rgba(255,255,255,0.06)",
  },
  inTextLabelMb: {
    marginBottom: 3,
  },
  formText: {
    fontSize: 12,
    color: "#c8c0b5",
  },
  formTrans: {
    color: "#6b645e",
  },
  addedMsg: {
    fontSize: 11,
    color: "#4a7c9e",
    textAlign: "center",
    padding: 5,
    background: "rgba(74,124,158,0.1)",
    borderRadius: 6,
  },
  addBtn: {
    width: "100%",
    padding: 7,
    fontSize: 12,
    cursor: "pointer",
    background: "rgba(74,124,158,0.18)",
    border: "1px solid rgba(74,124,158,0.38)",
    color: "#7ab4d4",
    borderRadius: 7,
    fontFamily: "inherit",
  },
  badgeLocal: {
    fontSize: 10,
    letterSpacing: "0.05em",
    color: "#7ab4d4",
    border: "1px solid rgba(74,124,158,0.3)",
  },
});

export default function TranslationPopup({ popup, containerRef, session, onAddWord, onAddApiKey }) {
  if (!popup) return null;
  const containerWidth = containerRef?.current?.offsetWidth ?? 360;
  const left = Math.max(Math.min((popup.x ?? 150) - 125, containerWidth - 258), 4);
  const top = Math.max((popup.y ?? 80) - 155, 8);

  const inListBadge = (
    <div
      aria-label="already in your list"
      title="Already in your list"
      {...stylex.props(shared.badge, s.badgeLocal)}
    >
      <span aria-hidden="true">✓</span>in your list
    </div>
  );

  return (
    <div
      onClick={(e) => e.stopPropagation()}
      {...stylex.props(s.popup)}
      style={{ left, top }}
    >
      {popup.noKey
        ? (
          <div {...stylex.props(s.noKeyWrap)}>
            <div {...stylex.props(s.wordTitle, s.wordTitleMb)}>{popup.word}</div>
            Add your API key to translate words.
            <button onClick={onAddApiKey} {...stylex.props(buttonStyles.ghost, s.addKeyBtn)}>Add API key</button>
          </div>
        )
        : popup.loading
        ? (
          <div {...stylex.props(s.loadingWrap)}>
            <div {...stylex.props(shared.spinner, s.loadingIcon)}>⟳</div>
            <div {...stylex.props(s.loadingText)}>Analysing &ldquo;{popup.word}&rdquo;…</div>
            {popup.existsInDb && <div {...stylex.props(s.badgeCenter)}>{inListBadge}</div>}
          </div>
        )
        : (
          <>
            <div {...stylex.props(s.headerRow)}>
              <div>
                <div {...stylex.props(s.wordTitle)}>{popup.base || popup.word}</div>
                {popup.existsInDb && <div {...stylex.props(s.badgeMargin)}>{inListBadge}</div>}
              </div>
              {popup.pos && (
                <div {...stylex.props(s.posTag)} style={{ color: POS_CLR[popup.pos] ?? "#666", borderColor: `${(POS_CLR[popup.pos] ?? "#666")}44` }}>
                  {popup.pos}
                </div>
              )}
            </div>
            <div {...stylex.props(s.translations)}>
              {(popup.translations || []).map((t, i) => (
                <div key={i} {...stylex.props(i === 0 ? s.translationPrimary : s.translationSecondary)}>
                  {i === 0 ? "→ " : "   "}{t}
                </div>
              ))}
            </div>
            {popup.base && popup.base !== popup.word?.toLowerCase() && (
              <div {...stylex.props(s.formSection)}>
                <div {...stylex.props(shared.smallLabel, s.inTextLabelMb)}>in text</div>
                <div {...stylex.props(s.formText)}>
                  {popup.word}
                  {popup.formTranslation && <span {...stylex.props(s.formTrans)}> — {popup.formTranslation}</span>}
                </div>
              </div>
            )}
            {session[popup.k] && (
              (popup.added || session[popup.k]?.added)
                ? <div {...stylex.props(s.addedMsg)}>✓ Added to review</div>
                : <button onClick={onAddWord} {...stylex.props(s.addBtn)}>+ Add to review list</button>
            )}
          </>
        )
      }
    </div>
  );
}
