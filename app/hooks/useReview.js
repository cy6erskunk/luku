import { useState, useEffect } from "react";

export function useReview({ dbWords, updateWord, stage }) {
  const [queue, setQueue] = useState([]);
  const [revIdx, setRevIdx] = useState(0);
  const [showAnswer, setShowAnswer] = useState(false);
  const [grading, setGrading] = useState(false);

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
    setQueue(dueWords.map((w) => w.id));
    setRevIdx(0);
    setShowAnswer(false);
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
    setGrading(true);
    try {
      const r = await fetch("/api/reviews", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ wordId: word.id, grade }),
      });
      const { word: updated } = await r.json();
      if (updated) updateWord(updated);
    } catch (e) { console.error("grade failed", e); }
    finally { setGrading(false); }
    if (grade < 3) setQueue((q) => [...q, wordId]);
    setRevIdx((i) => i + 1);
    setShowAnswer(false);
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
  };

  return {
    queue, revIdx, setRevIdx, showAnswer, setShowAnswer, grading,
    startReview, gradeWord, removeWordFromQueue, restoreWordInQueue, reset,
  };
}
