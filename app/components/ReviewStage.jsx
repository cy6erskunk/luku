import * as stylex from "@stylexjs/stylex";
import { buttonStyles, shared } from "../lib/styles.js";
import { wordForms } from "../lib/utils.js";
import { POS_CLR } from "../lib/tokens.js";

const s = stylex.create({
  wrap: {
    padding: "24px 18px 36px",
    maxWidth: 460,
    margin: "0 auto",
  },
  stepLabelMb: {
    marginBottom: 14,
  },
  centered: {
    textAlign: "center",
    padding: "60px 0",
    color: "#4a7c9e",
  },
  emptyWrap: {
    textAlign: "center",
    padding: "50px 0",
  },
  emptyIcon: {
    fontSize: 40,
    marginBottom: 12,
  },
  emptyText: {
    color: "#6b645e",
    fontSize: 14,
    lineHeight: 1.6,
    marginBottom: 20,
  },
  vocabCount: {
    color: "#4a4040",
    fontSize: 12,
    marginBottom: 20,
  },
  repeatBtn: {
    padding: "9px 20px",
    marginBottom: 10,
  },
  backBtn: {
    padding: "9px 20px",
  },
  doneWrap: {
    textAlign: "center",
    padding: "36px 0",
  },
  doneIcon: {
    fontSize: 46,
    marginBottom: 12,
  },
  doneTitle: {
    fontSize: 20,
    fontWeight: 400,
    marginBottom: 6,
  },
  doneText: {
    color: "#6b645e",
    marginBottom: 24,
  },
  doneCount: {
    color: "#4a7c9e",
  },
  scanBtn: {
    marginBottom: 10,
  },
  topRow: {
    display: "flex",
    justifyContent: "space-between",
    marginBottom: 16,
  },
  titleRow: {
    display: "flex",
    alignItems: "center",
    gap: 8,
  },
  titleText: {
    fontSize: 16,
    fontWeight: 400,
  },
  repeatBadge: {
    fontSize: 9,
    letterSpacing: "0.12em",
    textTransform: "uppercase",
    color: "#6a9ebe",
    border: "1px solid rgba(74,124,158,0.25)",
  },
  newBadge: {
    fontSize: 9,
    letterSpacing: "0.12em",
    textTransform: "uppercase",
    color: "#7ab4d4",
    border: "1px solid rgba(74,124,158,0.25)",
  },
  counter: {
    fontSize: 12,
    color: "#555",
  },
  progressMb: {
    marginBottom: 24,
  },
  card: {
    background: "rgba(255,255,255,0.02)",
    border: "1px solid rgba(255,255,255,0.07)",
    borderRadius: 18,
    padding: "32px 24px",
    textAlign: "center",
    marginBottom: 18,
    minHeight: 180,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
  },
  cardWord: {
    fontSize: 32,
    marginBottom: 4,
  },
  preexistingBadge: {
    marginTop: 6,
    fontSize: 10,
    letterSpacing: "0.05em",
    color: "#7ab4d4",
    border: "1px solid rgba(74,124,158,0.3)",
  },
  cardExample: {
    marginTop: 10,
    fontSize: 13,
    color: "#6b645e",
    fontStyle: "italic",
  },
  answerSection: {
    borderTop: "1px solid rgba(255,255,255,0.06)",
    width: "100%",
    paddingTop: 18,
    marginTop: 14,
  },
  posLabel: {
    fontSize: 10,
    marginBottom: 10,
  },
  translationPrimary: {
    fontSize: 18,
    color: "#c8c0b5",
    marginBottom: 4,
  },
  translationSecondary: {
    fontSize: 13,
    color: "#6b645e",
    marginBottom: 4,
  },
  exampleTrans: {
    marginTop: 8,
    fontSize: 12,
    color: "#6b645e",
    fontStyle: "italic",
  },
  formsSection: {
    marginTop: 14,
    paddingTop: 12,
    borderTop: "1px solid rgba(255,255,255,0.06)",
  },
  formsLabelMb: {
    marginBottom: 6,
  },
  formRow: {
    fontSize: 12,
    color: "#6b645e",
    marginBottom: 2,
  },
  formWord: {
    color: "#a89f93",
  },
  gradeRow: {
    display: "flex",
    gap: 8,
  },
  gradeAgain: {
    borderColor: "rgba(180,80,80,0.4)",
    color: "#c48a8a",
    fontSize: 13,
  },
  gradeHard: {
    borderColor: "rgba(158,138,80,0.4)",
    color: "#c4b870",
    fontSize: 13,
  },
  gradeEasy: {
    fontSize: 13,
  },
  removeBtn: {
    borderColor: "rgba(180,80,80,0.4)",
    color: "#c48a8a",
    fontSize: 13,
  },
  skipBtn: {
    fontSize: 13,
  },
  keepBtn: {
    fontSize: 13,
  },
  intervalInfo: {
    textAlign: "center",
    marginTop: 12,
    fontSize: 11,
    color: "#3a4550",
  },
});

export default function ReviewStage({
  queue, revIdx, showAnswer, setShowAnswer, grading,
  dbWords, loadingWords,
  onGrade, onScanAnother, onRemoveNew, onKeepNew,
  isRepeat, isNewReview,
  repeatWords, onStartRepeat,
  dueWords, onStartReview,
  preexistingNewIds,
  deletingIds,
}) {
  const stepLabel = isNewReview ? "Step 3 — New words" : "Step 3 — Review";
  if (loadingWords) {
    return (
      <div {...stylex.props(s.wrap)}>
        <div {...stylex.props(shared.stepLabel, s.stepLabelMb)}>{stepLabel}</div>
        <div {...stylex.props(s.centered)}>Loading…</div>
      </div>
    );
  }

  if (queue.length === 0) {
    return (
      <div {...stylex.props(s.wrap)}>
        <div {...stylex.props(shared.stepLabel, s.stepLabelMb)}>{stepLabel}</div>
        <div {...stylex.props(s.emptyWrap)}>
          <div {...stylex.props(s.emptyIcon)}>✓</div>
          <div {...stylex.props(s.emptyText)}>All caught up!<br />No words due for review.</div>
          <div {...stylex.props(s.vocabCount)}>{dbWords.length} word{dbWords.length !== 1 ? "s" : ""} in your vocabulary.</div>
          {repeatWords?.length > 0 && (
            <button onClick={onStartRepeat} {...stylex.props(buttonStyles.primary, s.repeatBtn, shared.fullWidth)}>
              Repeat {repeatWords.length} word{repeatWords.length !== 1 ? "s" : ""}
            </button>
          )}
          <button onClick={onScanAnother} {...stylex.props(buttonStyles.ghost, s.backBtn)}>← Back to Scan</button>
        </div>
      </div>
    );
  }

  if (revIdx >= queue.length) {
    const dueRemaining = (dueWords?.length ?? 0);
    return (
      <div {...stylex.props(s.wrap)}>
        <div {...stylex.props(shared.stepLabel, s.stepLabelMb)}>{stepLabel}</div>
        <div {...stylex.props(s.doneWrap)}>
          <div {...stylex.props(s.doneIcon)}>🎉</div>
          <h2 {...stylex.props(s.doneTitle)}>
            {isNewReview ? "New words triaged" : "Session complete"}
          </h2>
          <p {...stylex.props(s.doneText)}>
            {isNewReview ? "Went through " : "Reviewed "}
            <strong {...stylex.props(s.doneCount)}>{queue.length}</strong> card{queue.length !== 1 ? "s" : ""}.
          </p>
          {isNewReview && dueRemaining > 0 && onStartReview && (
            <button onClick={onStartReview} {...stylex.props(buttonStyles.primary, shared.fullWidth, s.scanBtn)}>
              Continue → Review {dueRemaining} due word{dueRemaining !== 1 ? "s" : ""}
            </button>
          )}
          <button onClick={onScanAnother} {...stylex.props(isNewReview && dueRemaining > 0 ? buttonStyles.ghost : buttonStyles.primary, shared.fullWidth, s.scanBtn)}>📸 Scan Another Page</button>
        </div>
      </div>
    );
  }

  const w = dbWords.find((dw) => dw.id === queue[revIdx]);
  if (!w) return null;
  const forms = wordForms(w);

  const heading = isNewReview ? "New words" : isRepeat ? "Extra practice" : "Review";
  const isPreexisting = isNewReview && !!preexistingNewIds && preexistingNewIds.has(w.id);

  return (
    <div {...stylex.props(s.wrap)}>
      <div {...stylex.props(shared.stepLabel, s.stepLabelMb)}>{stepLabel}</div>
      <div {...stylex.props(s.topRow)}>
        <div {...stylex.props(s.titleRow)}>
          <div {...stylex.props(s.titleText)}>{heading}</div>
          {isRepeat && <div {...stylex.props(shared.badge, s.repeatBadge)}>no schedule update</div>}
          {isNewReview && <div {...stylex.props(shared.badge, s.newBadge)}>keep or remove</div>}
        </div>
        <div {...stylex.props(s.counter)}>{revIdx + 1} / {queue.length}</div>
      </div>
      <div {...stylex.props(shared.progressTrack, s.progressMb)}>
        <div style={{ height: "100%", width: `${(revIdx / queue.length) * 100}%`, background: isRepeat || isNewReview ? "rgba(74,124,158,0.5)" : "#4a7c9e", transition: "width 0.3s" }} />
      </div>
      <div {...stylex.props(s.card)}>
        <div {...stylex.props(s.cardWord)}>{w.base}</div>
        {isPreexisting && (
          <div
            aria-label="already in your list"
            title="Already in your list — Skip keeps study history"
            {...stylex.props(shared.badge, s.preexistingBadge)}
          >
            <span aria-hidden="true">✓</span> in your list
          </div>
        )}
        {w.example && (
          <div {...stylex.props(s.cardExample)}>{w.example}</div>
        )}
        {showAnswer && (
          <div {...stylex.props(s.answerSection)}>
            {w.pos && <div {...stylex.props(s.posLabel)} style={{ color: POS_CLR[w.pos] ?? "#666" }}>{w.pos}</div>}
            {(w.translations || []).map((t, i) => (
              <div key={i} {...stylex.props(i === 0 ? s.translationPrimary : s.translationSecondary)}>{t}</div>
            ))}
            {w.example_translation && (
              <div {...stylex.props(s.exampleTrans)}>{w.example_translation}</div>
            )}
            {forms.length > 0 && (
              <div {...stylex.props(s.formsSection)}>
                <div {...stylex.props(shared.smallLabel, s.formsLabelMb)}>seen in text</div>
                {forms.map((f, i) => (
                  <div key={i} {...stylex.props(s.formRow)}>
                    <span {...stylex.props(s.formWord)}>{f.word}</span>
                    {f.translation && <span> — {f.translation}</span>}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
      {!showAnswer
        ? <button onClick={() => setShowAnswer(true)} {...stylex.props(buttonStyles.primary, shared.fullWidth)}>Show answer</button>
        : isNewReview
        ? (() => {
          const isDeleting = !!deletingIds && deletingIds.has(w.id);
          const busy = grading || isDeleting;
          return (
            <div {...stylex.props(s.gradeRow)} style={{ opacity: busy ? 0.5 : 1 }}>
              <button
                onClick={() => onRemoveNew?.(w.id)}
                disabled={busy}
                title={isPreexisting ? "Skip: keep study history and drop from the new-words bucket" : "Delete this word from your list"}
                {...stylex.props(buttonStyles.ghost, shared.flex1, isPreexisting ? s.skipBtn : s.removeBtn)}
              >
                {isPreexisting ? "Skip" : "Remove"}
              </button>
              <button onClick={() => onKeepNew?.(w.id)} disabled={busy} {...stylex.props(buttonStyles.primary, shared.flex1, s.keepBtn)}>Keep</button>
            </div>
          );
        })()
        : (
          <div {...stylex.props(s.gradeRow)} style={{ opacity: grading ? 0.5 : 1 }}>
            <button onClick={() => onGrade(1)} disabled={grading} {...stylex.props(buttonStyles.ghost, shared.flex1, s.gradeAgain)}>Again</button>
            <button onClick={() => onGrade(3)} disabled={grading} {...stylex.props(buttonStyles.ghost, shared.flex1, s.gradeHard)}>Hard</button>
            <button onClick={() => onGrade(5)} disabled={grading} {...stylex.props(buttonStyles.primary, shared.flex1, s.gradeEasy)}>Easy</button>
          </div>
        )
      }
      {!isNewReview && w.interval_days > 0 && showAnswer && (
        <div {...stylex.props(s.intervalInfo)}>
          last interval: {w.interval_days}d · ease: {Number(w.ease_factor).toFixed(1)}
        </div>
      )}
    </div>
  );
}
