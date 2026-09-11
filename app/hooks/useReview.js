import { useState, useEffect, useCallback, useRef } from "react";
import { responseError } from "../lib/utils.js";

export function useReview({ dbWords, updateWord, stage }) {
  const [queue, setQueue] = useState([]);
  const [revIdx, setRevIdx] = useState(0);
  const [showAnswer, setShowAnswer] = useState(false);
  const [grading, setGrading] = useState(false);
  const [mode, setMode] = useState("due");
  // The bundle a scoped session was started from, purely so the review screen
  // can name it. Null for a session over the whole vocabulary.
  const [scope, setScope] = useState(null);
  const [gradeError, setGradeError] = useState(null);
  // Which review the grading request belongs to, bumped by reset(). A grade is
  // a round trip, and reset() runs when the account changes — so without this
  // an answer from the previous session advances the card of whoever is
  // reviewing now, and requeues a word that is not theirs.
  const runRef = useRef(0);
  const isRepeat = mode === "repeat";
  const isNewReview = mode === "new";

  // Self-correct if the current queue entry refers to a word no longer in
  // dbWords (e.g. deleted in another tab). Without this the review screen
  // renders blank with no way to progress.
  useEffect(() => {
    if (stage !== 2) return;
    if (revIdx >= queue.length) return;
    const id = queue[revIdx];
    if (id == null) return;
    if (dbWords.some((w) => w.id === id)) return;
    const adjust = queue.slice(0, revIdx).filter((qid) => qid === id).length;
    setQueue((q) => q.filter((qid) => qid !== id));
    if (adjust > 0) setRevIdx((i) => i - adjust);
  }, [stage, revIdx, queue, dbWords]);

  const startReview = (dueWords, scopeLabel = null) => {
    // A new queue invalidates the old one's pending grade as surely as a reset
    // does: its answer would advance or requeue cards it has never seen.
    runRef.current += 1;
    setMode("due");
    setScope(scopeLabel);
    setQueue(dueWords.map((w) => w.id));
    setRevIdx(0);
    setShowAnswer(false);
    setGrading(false);
  };

  const startRepeat = (words, scopeLabel = null) => {
    runRef.current += 1;
    setMode("repeat");
    setScope(scopeLabel);
    setQueue(words.map((w) => w.id));
    setRevIdx(0);
    setShowAnswer(false);
    setGrading(false);
  };

  const startNewReview = (words, scopeLabel = null) => {
    runRef.current += 1;
    setMode("new");
    setScope(scopeLabel);
    setQueue(words.map((w) => w.id));
    setRevIdx(0);
    setShowAnswer(false);
    setGrading(false);
  };

  const gradeWord = async (grade) => {
    const wordId = queue[revIdx];
    const word = dbWords.find((w) => w.id === wordId);
    if (!word) {
      if (wordId !== undefined) {
        const adjust = queue.slice(0, revIdx).filter((qid) => qid === wordId).length;
        setQueue((q) => q.filter((qid) => qid !== wordId));
        if (adjust > 0) setRevIdx((i) => i - adjust);
      }
      setShowAnswer(false);
      return;
    }
    if (isRepeat) {
      if (grade < 3) setQueue((q) => [...q, wordId]);
      setRevIdx((i) => i + 1);
      setShowAnswer(false);
      return;
    }
    if (isNewReview) {
      // New-word review is a keep/reject pass — grading is not persisted.
      setRevIdx((i) => i + 1);
      setShowAnswer(false);
      return;
    }
    const run = runRef.current;
    setGrading(true);
    setGradeError(null);
    try {
      const r = await fetch("/api/reviews", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ wordId: word.id, grade }),
      });
      // Through responseError like the word actions, so the schema guard's
      // 503 reaches the reader rather than becoming "grade failed: 503".
      if (!r.ok) throw await responseError(r, "Could not record that answer");
      const { word: updated } = await r.json();
      // The row is applied either way: the grade was recorded server-side, so
      // discarding it leaves the card showing an old schedule and due again
      // until the next load. updateWord matches by id and word ids are unique
      // across accounts, so on a list that is not this row's it is a no-op.
      if (updated) updateWord(updated);
      // The queue is what the reset means: these are no longer its cards.
      if (runRef.current !== run) return;
      if (grade < 3) setQueue((q) => [...q, wordId]);
      setRevIdx((i) => i + 1);
      setShowAnswer(false);
    } catch (e) {
      console.error("grade failed", e);
      // Reported rather than swallowed: the card stays where it is either way,
      // so without this the reader taps a grade and nothing happens at all.
      if (runRef.current === run) setGradeError(e.message || "Could not record that answer.");
    }
    finally { if (runRef.current === run) setGrading(false); }
  };

  const removeWordFromQueue = (id) => {
    const queueIndices = [];
    queue.forEach((qid, i) => { if (qid === id) queueIndices.push(i); });
    const revIdxAdjust = queueIndices.filter((i) => i < revIdx).length;
    const wasCurrent = queue[revIdx] === id;
    setQueue((prev) => prev.filter((qid) => qid !== id));
    if (revIdxAdjust > 0) setRevIdx((i) => i - revIdxAdjust);
    if (wasCurrent) setShowAnswer(false);
    return { queueIndices, revIdxAdjust };
  };

  const restoreWordInQueue = (id, queueIndices, revIdxAdjust) => {
    setQueue((prev) => {
      const restored = [...prev];
      for (const idx of queueIndices) {
        restored.splice(Math.min(idx, restored.length), 0, id);
      }
      return restored;
    });
    if (revIdxAdjust > 0) setRevIdx((i) => i + revIdxAdjust);
  };

  // Stable, so callers can depend on it without re-running an effect every
  // render.
  const reset = useCallback(() => {
    runRef.current += 1;
    setGradeError(null);
    setQueue([]);
    setRevIdx(0);
    setShowAnswer(false);
    setGrading(false);
    setMode("due");
    setScope(null);
  }, []);

  return {
    queue, revIdx, setRevIdx, showAnswer, setShowAnswer, grading, gradeError, mode, scope, isRepeat, isNewReview,
    startReview, startRepeat, startNewReview, gradeWord, removeWordFromQueue, restoreWordInQueue, reset,
  };
}
