import { useState, useEffect, useRef } from "react";
import { reportClientError } from "../lib/report.js";

export function useReview({ dbWords, applySchedule, stage, onGradeError, onGradeStale }) {
  const [queue, setQueue] = useState([]);
  const [revIdx, setRevIdx] = useState(0);
  const [showAnswer, setShowAnswer] = useState(false);
  const [grading, setGrading] = useState(false);
  const [mode, setMode] = useState("due");
  const isRepeat = mode === "repeat";
  const isNewReview = mode === "new";
  // Reverse practice (app/lib/reverse.js): English → Finnish, ungraded.
  const isReverse = mode === "reverse";
  // Each card's next_review_at as this pass first saw it, moved on only by
  // this pass's own grades. A grade is guarded on this rather than on the live
  // row, because a background refresh (useWords) may have brought in a
  // schedule set elsewhere since — and guarding on that would let the grade
  // through, counting the card twice.
  const shownScheduleRef = useRef(new Map());
  const beginPass = (words) => {
    shownScheduleRef.current = new Map(words.map((w) => [w.id, w.next_review_at]));
  };

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

  const startReview = (dueWords) => {
    beginPass(dueWords);
    setMode("due");
    setQueue(dueWords.map((w) => w.id));
    setRevIdx(0);
    setShowAnswer(false);
    setGrading(false);
  };

  const startRepeat = (words) => {
    setMode("repeat");
    setQueue(words.map((w) => w.id));
    setRevIdx(0);
    setShowAnswer(false);
    setGrading(false);
  };

  const startReverse = (words) => {
    setMode("reverse");
    setQueue(words.map((w) => w.id));
    setRevIdx(0);
    setShowAnswer(false);
    setGrading(false);
  };

  const startNewReview = (words) => {
    beginPass(words);
    setMode("new");
    setQueue(words.map((w) => w.id));
    setRevIdx(0);
    setShowAnswer(false);
    setGrading(false);
  };

  // Resolves true once the grade has landed, needed no write, or was refused
  // because the card had already been graded elsewhere. `persist`
  // writes a grade from the new-words pass, which otherwise writes nothing:
  // Again on a word the reader re-added is a real Again. It is not requeued
  // in that pass; the schedule brings it back in the due queue.
  const gradeWord = async (grade, { persist = false } = {}) => {
    const wordId = queue[revIdx];
    const word = dbWords.find((w) => w.id === wordId);
    if (!word) {
      if (wordId !== undefined) {
        const adjust = queue.slice(0, revIdx).filter((qid) => qid === wordId).length;
        setQueue((q) => q.filter((qid) => qid !== wordId));
        if (adjust > 0) setRevIdx((i) => i - adjust);
      }
      setShowAnswer(false);
      return false;
    }
    // Neither pass writes a schedule; a miss just comes round again.
    if (isRepeat || isReverse) {
      if (grade < 3) setQueue((q) => [...q, wordId]);
      setRevIdx((i) => i + 1);
      setShowAnswer(false);
      return true;
    }
    if (isNewReview && !persist) {
      // New-word review is a keep/reject pass — Keep and Skip write nothing.
      setRevIdx((i) => i + 1);
      setShowAnswer(false);
      return true;
    }
    setGrading(true);
    try {
      const r = await fetch("/api/reviews", {
        method: "POST",
        headers: { "content-type": "application/json" },
        // The schedule this tab showed. A card graded since — on the bot, in
        // another tab — no longer matches, and the server refuses rather than
        // grading it a second time from its new schedule.
        body: JSON.stringify({
          wordId: word.id,
          grade,
          expectedNextReviewAt: shownScheduleRef.current.get(word.id) ?? word.next_review_at,
        }),
      });
      if (r.status === 409) {
        // Already graded elsewhere. The reply carries the card's current
        // schedule, so this tab catches up and moves past the card without
        // requeueing it: this answer was not counted, and saying it again
        // would only be refused again.
        const { word: current } = await r.json();
        if (current) applySchedule(current);
        setRevIdx((i) => i + 1);
        setShowAnswer(false);
        onGradeStale?.();
        return true;
      }
      if (!r.ok) throw new Error(`grade failed: ${r.status}`);
      const { word: updated } = await r.json();
      if (updated) {
        applySchedule(updated);
        // A card failed here comes back in this pass, guarded on its new schedule.
        if (updated.next_review_at) shownScheduleRef.current.set(wordId, updated.next_review_at);
      }
      if (grade < 3 && !isNewReview) setQueue((q) => [...q, wordId]);
      setRevIdx((i) => i + 1);
      setShowAnswer(false);
      return true;
    } catch (e) {
      // The card stays put, which on its own reads as a button that did
      // nothing. The caller says so on screen.
      reportClientError("grade word", e);
      onGradeError?.(e);
      return false;
    }
    finally { setGrading(false); }
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

  const reset = () => {
    setQueue([]);
    setRevIdx(0);
    setShowAnswer(false);
    setGrading(false);
    setMode("due");
  };

  return {
    queue, revIdx, setRevIdx, showAnswer, setShowAnswer, grading, mode, isRepeat, isNewReview, isReverse,
    startReview, startRepeat, startReverse, startNewReview, gradeWord, removeWordFromQueue, restoreWordInQueue, reset,
  };
}
