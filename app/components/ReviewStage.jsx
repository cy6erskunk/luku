import { useState } from "react";
import { Bp, Bg } from "../lib/styles.js";
import { wordForms } from "../lib/utils.js";
import ExamplePicker from "./ExamplePicker.jsx";

const POS_CLR = { verb: "#7a9e7e", noun: "#9e8a7a", adjective: "#7a8a9e", adverb: "#9e7a9e" };

export default function ReviewStage({
  queue, revIdx, showAnswer, setShowAnswer, grading,
  dbWords, loadingWords,
  onGrade, onScanAnother, onRemoveNew, onKeepNew,
  isRepeat, isNewReview,
  repeatWords, onStartRepeat,
  dueWords, onStartReview,
  preexistingNewIds,
  deletingIds,
  onSuggestExample, onAcceptExample, onExampleSaveLost,
}) {
  // Which card's example popup is open, as queue position plus word id rather
  // than a flag: moving on closes it without an effect, and a failed card
  // coming round again later in the session does not reopen it.
  const [pickingFor, setPickingFor] = useState(null);
  // True while an accepted example is being saved. Moving on is held until it
  // settles: a grade sent alongside could answer last with the row as it was
  // before the PATCH, and its reply replaces the whole local word.
  const [savingExample, setSavingExample] = useState(false);
  // Every way off a card closes the popup, at the click rather than when the
  // grade comes back.
  const leaving = (fn) => (...args) => { setPickingFor(null); return fn?.(...args); };
  // And so does anything that hides the answer — a grade, a skip, a session
  // started from the header — since the popup only exists on the answer side.
  // Otherwise a pass restarted, or a skipped word that is still due turning
  // up at the same position in the next pass, would match the stale key and
  // reopen it, sending a request nobody asked for. Adjusted during render
  // rather than in an effect so the stale popup never paints.
  if (!showAnswer && pickingFor !== null) setPickingFor(null);
  const stepLabel = isNewReview ? "Step 3 — New words" : "Step 3 — Review";
  if (loadingWords) {
    return (
      <div style={{ padding: "24px 18px 36px", maxWidth: 460, margin: "0 auto" }}>
        <div style={{ fontSize: 10, letterSpacing: "0.15em", textTransform: "uppercase", color: "#4a7c9e", marginBottom: 14, fontFamily: "monospace" }}>{stepLabel}</div>
        <div style={{ textAlign: "center", padding: "60px 0", color: "#4a7c9e" }}>Loading…</div>
      </div>
    );
  }

  if (queue.length === 0) {
    return (
      <div style={{ padding: "24px 18px 36px", maxWidth: 460, margin: "0 auto" }}>
        <div style={{ fontSize: 10, letterSpacing: "0.15em", textTransform: "uppercase", color: "#4a7c9e", marginBottom: 14, fontFamily: "monospace" }}>{stepLabel}</div>
        <div style={{ textAlign: "center", padding: "50px 0" }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>✓</div>
          <div style={{ color: "#6b645e", fontSize: 14, lineHeight: 1.6, marginBottom: 20 }}>All caught up!<br />No words due for review.</div>
          <div style={{ color: "#4a4040", fontSize: 12, marginBottom: 20 }}>{dbWords.length} word{dbWords.length !== 1 ? "s" : ""} in your vocabulary.</div>
          {repeatWords?.length > 0 && (
            <button onClick={onStartRepeat} style={{ ...Bp, padding: "9px 20px", marginBottom: 10, width: "100%" }}>
              Repeat {repeatWords.length} word{repeatWords.length !== 1 ? "s" : ""}
            </button>
          )}
          <button onClick={onScanAnother} style={{ ...Bg, padding: "9px 20px" }}>← Back to Scan</button>
        </div>
      </div>
    );
  }

  if (revIdx >= queue.length) {
    const dueRemaining = (dueWords?.length ?? 0);
    return (
      <div style={{ padding: "24px 18px 36px", maxWidth: 460, margin: "0 auto" }}>
        <div style={{ fontSize: 10, letterSpacing: "0.15em", textTransform: "uppercase", color: "#4a7c9e", marginBottom: 14, fontFamily: "monospace" }}>{stepLabel}</div>
        <div style={{ textAlign: "center", padding: "36px 0" }}>
          <div style={{ fontSize: 46, marginBottom: 12 }}>🎉</div>
          <h2 style={{ fontSize: 20, fontWeight: 400, marginBottom: 6 }}>
            {isNewReview ? "New words triaged" : "Session complete"}
          </h2>
          <p style={{ color: "#6b645e", marginBottom: 24 }}>
            {isNewReview ? "Went through " : "Reviewed "}
            <strong style={{ color: "#4a7c9e" }}>{queue.length}</strong> card{queue.length !== 1 ? "s" : ""}.
          </p>
          {isNewReview && dueRemaining > 0 && onStartReview && (
            <button onClick={onStartReview} style={{ ...Bp, width: "100%", marginBottom: 10 }}>
              Continue → Review {dueRemaining} due word{dueRemaining !== 1 ? "s" : ""}
            </button>
          )}
          <button onClick={onScanAnother} style={{ ...(isNewReview && dueRemaining > 0 ? Bg : Bp), width: "100%", marginBottom: 10 }}>📸 Scan Another Page</button>
        </div>
      </div>
    );
  }

  const w = dbWords.find((dw) => dw.id === queue[revIdx]);
  if (!w) return null;
  const forms = wordForms(w);
  // Offered on the answer side only: on the question side a new example would
  // give the answer away before the reader has tried.
  const canSuggest = showAnswer && !!onSuggestExample && !!onAcceptExample;
  const cardKey = `${revIdx}:${w.id}`;
  const picking = canSuggest && pickingFor === cardKey;

  const heading = isNewReview ? "New words" : isRepeat ? "Extra practice" : "Review";
  const isPreexisting = isNewReview && !!preexistingNewIds && preexistingNewIds.has(w.id);

  return (
    <div style={{ padding: "24px 18px 36px", maxWidth: 460, margin: "0 auto" }}>
      <div style={{ fontSize: 10, letterSpacing: "0.15em", textTransform: "uppercase", color: "#4a7c9e", marginBottom: 14, fontFamily: "monospace" }}>{stepLabel}</div>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ fontSize: 16, fontWeight: 400 }}>{heading}</div>
          {isRepeat && <div style={{ fontSize: 9, letterSpacing: "0.12em", textTransform: "uppercase", color: "#6a9ebe", background: "rgba(74,124,158,0.12)", border: "1px solid rgba(74,124,158,0.25)", borderRadius: 10, padding: "2px 7px", fontFamily: "monospace" }}>no schedule update</div>}
          {/* Not a gate: the word was written to the database the moment it
              was added, and this pass is only an offer to undo. The bucket
              driving it is session state, so a refresh or a new scan drops
              the offer and the word simply stays — which is why the badge
              says "saved" rather than asking to keep. */}
          {isNewReview && <div style={{ fontSize: 9, letterSpacing: "0.12em", textTransform: "uppercase", color: "#7ab4d4", background: "rgba(74,124,158,0.12)", border: "1px solid rgba(74,124,158,0.25)", borderRadius: 10, padding: "2px 7px", fontFamily: "monospace" }}>saved · remove?</div>}
        </div>
        <div style={{ fontSize: 12, color: "#555" }}>{revIdx + 1} / {queue.length}</div>
      </div>
      <div style={{ height: 3, background: "rgba(255,255,255,0.06)", borderRadius: 2, marginBottom: 24, overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${(revIdx / queue.length) * 100}%`, background: isRepeat || isNewReview ? "rgba(74,124,158,0.5)" : "#4a7c9e", transition: "width 0.3s" }} />
      </div>
      <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 18, padding: "32px 24px", textAlign: "center", marginBottom: 18, minHeight: 180, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
        <div style={{ fontSize: 32, marginBottom: 4 }}>{w.base}</div>
        {isPreexisting && (
          <div
            aria-label="already in your list"
            title="Already in your list — Skip keeps study history"
            style={{ marginTop: 6, display: "inline-flex", alignItems: "center", gap: 4, fontSize: 10, letterSpacing: "0.05em", color: "#7ab4d4", background: "rgba(74,124,158,0.12)", border: "1px solid rgba(74,124,158,0.3)", borderRadius: 10, padding: "2px 7px", fontFamily: "monospace" }}
          >
            <span aria-hidden="true">✓</span> in your list
          </div>
        )}
        {(w.example || canSuggest) && (
          <div style={{ marginTop: 10, display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
            {w.example && <div style={{ fontSize: 13, color: "#6b645e", fontStyle: "italic" }}>{w.example}</div>}
            {canSuggest && (
              <button
                onClick={() => setPickingFor(picking ? null : cardKey)}
                // Closing mid-save would unmount the only place a failed save
                // is told, and reopening would allow a second, overlapping one.
                // Mid-grade the card is still up, but a save started now could
                // land before the grade's reply, which replaces the whole local
                // word with the row as it was before the save.
                disabled={savingExample || grading}
                aria-label={w.example ? "Suggest a different example" : "Suggest an example"}
                aria-expanded={picking}
                title={w.example ? "Suggest a different example" : "Suggest an example"}
                style={{ background: "none", border: "1px solid rgba(74,124,158,0.3)", borderRadius: 8, color: picking ? "#7ab4d4" : "#4a7c9e", cursor: "pointer", fontSize: 12, lineHeight: 1, padding: "3px 6px", flexShrink: 0 }}
              >
                {w.example ? "↻" : "+ example"}
              </button>
            )}
          </div>
        )}
        {picking && (
          <ExamplePicker
            key={cardKey}
            current={w.example}
            onFetch={(avoid) => onSuggestExample(w, avoid)}
            onAccept={async (s) => {
              setSavingExample(true);
              try { await onAcceptExample(w.id, s); }
              finally { setSavingExample(false); }
            }}
            onClose={() => setPickingFor(null)}
            onSaveLost={onExampleSaveLost}
          />
        )}
        {showAnswer && (
          <div style={{ borderTop: "1px solid rgba(255,255,255,0.06)", width: "100%", paddingTop: 18, marginTop: 14 }}>
            {w.pos && <div style={{ fontSize: 10, color: POS_CLR[w.pos] ?? "#666", marginBottom: 10 }}>{w.pos}</div>}
            {(w.translations || []).map((t, i) => (
              <div key={i} style={{ fontSize: i === 0 ? 18 : 13, color: i === 0 ? "#c8c0b5" : "#6b645e", marginBottom: 4 }}>{t}</div>
            ))}
            {w.example_translation && (
              <div style={{ marginTop: 8, fontSize: 12, color: "#6b645e", fontStyle: "italic" }}>{w.example_translation}</div>
            )}
            {forms.length > 0 && (
              <div style={{ marginTop: 14, paddingTop: 12, borderTop: "1px solid rgba(255,255,255,0.06)" }}>
                <div style={{ fontSize: 9, letterSpacing: "0.12em", textTransform: "uppercase", color: "#4a7c9e", fontFamily: "monospace", marginBottom: 6 }}>seen in text</div>
                {forms.map((f, i) => (
                  <div key={i} style={{ fontSize: 12, color: "#6b645e", marginBottom: 2 }}>
                    <span style={{ color: "#a89f93" }}>{f.word}</span>
                    {f.translation && <span> — {f.translation}</span>}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
      {!showAnswer
        ? <button onClick={() => setShowAnswer(true)} style={{ ...Bp, width: "100%" }}>Show answer</button>
        : isNewReview
        ? (() => {
          const isDeleting = !!deletingIds && deletingIds.has(w.id);
          const busy = grading || isDeleting || savingExample;
          return (
            <div style={{ display: "flex", gap: 8, opacity: busy ? 0.5 : 1 }}>
              <button
                onClick={leaving(() => onRemoveNew?.(w.id))}
                disabled={busy}
                title={isPreexisting ? "Skip: keep study history and drop from the new-words bucket" : "Delete this word from your list"}
                style={isPreexisting
                  ? { ...Bg, flex: 1, fontSize: 13 }
                  : { ...Bg, flex: 1, borderColor: "rgba(180,80,80,0.4)", color: "#c48a8a", fontSize: 13 }}
              >
                {isPreexisting ? "Skip" : "Remove"}
              </button>
              <button onClick={leaving(() => onKeepNew?.(w.id))} disabled={busy} style={{ ...Bp, flex: 1, fontSize: 13 }}>Keep</button>
            </div>
          );
        })()
        : (
          <div style={{ display: "flex", gap: 8, opacity: grading || savingExample ? 0.5 : 1 }}>
            <button onClick={leaving(() => onGrade(1))} disabled={grading || savingExample} style={{ ...Bg, flex: 1, borderColor: "rgba(180,80,80,0.4)", color: "#c48a8a", fontSize: 13 }}>Again</button>
            <button onClick={leaving(() => onGrade(3))} disabled={grading || savingExample} style={{ ...Bg, flex: 1, borderColor: "rgba(158,138,80,0.4)", color: "#c4b870", fontSize: 13 }}>Hard</button>
            <button onClick={leaving(() => onGrade(5))} disabled={grading || savingExample} style={{ ...Bp, flex: 1, fontSize: 13 }}>Easy</button>
          </div>
        )
      }
      {!isNewReview && w.interval_days > 0 && showAnswer && (
        <div style={{ textAlign: "center", marginTop: 12, fontSize: 11, color: "#3a4550" }}>
          last interval: {w.interval_days}d · ease: {Number(w.ease_factor).toFixed(1)}
        </div>
      )}
    </div>
  );
}
