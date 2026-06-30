import { Bp, Bg } from "../lib/styles.js";
import { wordForms } from "../lib/utils.js";

const POS_CLR = { verb: "#7a9e7e", noun: "#9e8a7a", adjective: "#7a8a9e", adverb: "#9e7a9e" };

export default function ReviewStage({
  queue, revIdx, showAnswer, setShowAnswer, grading,
  dbWords, loadingWords,
  onGrade, onScanAnother,
  isRepeat, repeatWords, onStartRepeat,
}) {
  if (loadingWords) {
    return (
      <div style={{ padding: "24px 18px 36px", maxWidth: 460, margin: "0 auto" }}>
        <div style={{ fontSize: 10, letterSpacing: "0.15em", textTransform: "uppercase", color: "#4a7c9e", marginBottom: 14, fontFamily: "monospace" }}>Step 3 — Review</div>
        <div style={{ textAlign: "center", padding: "60px 0", color: "#4a7c9e" }}>Loading…</div>
      </div>
    );
  }

  if (queue.length === 0) {
    return (
      <div style={{ padding: "24px 18px 36px", maxWidth: 460, margin: "0 auto" }}>
        <div style={{ fontSize: 10, letterSpacing: "0.15em", textTransform: "uppercase", color: "#4a7c9e", marginBottom: 14, fontFamily: "monospace" }}>Step 3 — Review</div>
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
    return (
      <div style={{ padding: "24px 18px 36px", maxWidth: 460, margin: "0 auto" }}>
        <div style={{ fontSize: 10, letterSpacing: "0.15em", textTransform: "uppercase", color: "#4a7c9e", marginBottom: 14, fontFamily: "monospace" }}>Step 3 — Review</div>
        <div style={{ textAlign: "center", padding: "36px 0" }}>
          <div style={{ fontSize: 46, marginBottom: 12 }}>🎉</div>
          <h2 style={{ fontSize: 20, fontWeight: 400, marginBottom: 6 }}>Session complete</h2>
          <p style={{ color: "#6b645e", marginBottom: 24 }}>Reviewed <strong style={{ color: "#4a7c9e" }}>{queue.length}</strong> card{queue.length !== 1 ? "s" : ""}.</p>
          <button onClick={onScanAnother} style={{ ...Bp, width: "100%", marginBottom: 10 }}>📸 Scan Another Page</button>
        </div>
      </div>
    );
  }

  const w = dbWords.find((dw) => dw.id === queue[revIdx]);
  if (!w) return null;
  const forms = wordForms(w);

  return (
    <div style={{ padding: "24px 18px 36px", maxWidth: 460, margin: "0 auto" }}>
      <div style={{ fontSize: 10, letterSpacing: "0.15em", textTransform: "uppercase", color: "#4a7c9e", marginBottom: 14, fontFamily: "monospace" }}>Step 3 — Review</div>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ fontSize: 16, fontWeight: 400 }}>{isRepeat ? "Extra practice" : "Review"}</div>
          {isRepeat && <div style={{ fontSize: 9, letterSpacing: "0.12em", textTransform: "uppercase", color: "#6a9ebe", background: "rgba(74,124,158,0.12)", border: "1px solid rgba(74,124,158,0.25)", borderRadius: 10, padding: "2px 7px", fontFamily: "monospace" }}>no schedule update</div>}
        </div>
        <div style={{ fontSize: 12, color: "#555" }}>{revIdx + 1} / {queue.length}</div>
      </div>
      <div style={{ height: 3, background: "rgba(255,255,255,0.06)", borderRadius: 2, marginBottom: 24, overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${(revIdx / queue.length) * 100}%`, background: isRepeat ? "rgba(74,124,158,0.5)" : "#4a7c9e", transition: "width 0.3s" }} />
      </div>
      <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 18, padding: "32px 24px", textAlign: "center", marginBottom: 18, minHeight: 180, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
        <div style={{ fontSize: 32, marginBottom: 4 }}>{w.base}</div>
        {showAnswer && (
          <div style={{ borderTop: "1px solid rgba(255,255,255,0.06)", width: "100%", paddingTop: 18, marginTop: 14 }}>
            {w.pos && <div style={{ fontSize: 10, color: POS_CLR[w.pos] ?? "#666", marginBottom: 10 }}>{w.pos}</div>}
            {(w.translations || []).map((t, i) => (
              <div key={i} style={{ fontSize: i === 0 ? 18 : 13, color: i === 0 ? "#c8c0b5" : "#6b645e", marginBottom: 4 }}>{t}</div>
            ))}
            {w.example && (
              <div style={{ marginTop: 14, paddingTop: 12, borderTop: "1px solid rgba(255,255,255,0.06)" }}>
                <div style={{ fontSize: 9, letterSpacing: "0.12em", textTransform: "uppercase", color: "#4a7c9e", fontFamily: "monospace", marginBottom: 6 }}>example</div>
                <div style={{ fontSize: 13, color: "#a89f93", marginBottom: 2 }}>{w.example}</div>
                {w.example_translation && <div style={{ fontSize: 12, color: "#6b645e" }}>{w.example_translation}</div>}
              </div>
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
        : (
          <div style={{ display: "flex", gap: 8, opacity: grading ? 0.5 : 1 }}>
            <button onClick={() => onGrade(1)} disabled={grading} style={{ ...Bg, flex: 1, borderColor: "rgba(180,80,80,0.4)", color: "#c48a8a", fontSize: 13 }}>Again</button>
            <button onClick={() => onGrade(3)} disabled={grading} style={{ ...Bg, flex: 1, borderColor: "rgba(158,138,80,0.4)", color: "#c4b870", fontSize: 13 }}>Hard</button>
            <button onClick={() => onGrade(5)} disabled={grading} style={{ ...Bp, flex: 1, fontSize: 13 }}>Easy</button>
          </div>
        )
      }
      {w.interval_days > 0 && showAnswer && (
        <div style={{ textAlign: "center", marginTop: 12, fontSize: 11, color: "#3a4550" }}>
          last interval: {w.interval_days}d · ease: {Number(w.ease_factor).toFixed(1)}
        </div>
      )}
    </div>
  );
}
