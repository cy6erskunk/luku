"use client";
import { useState, useCallback, useEffect, useRef } from "react";
import * as stylex from "@stylexjs/stylex";
import { authClient } from "./lib/authClient.js";
import { SKIP_KEY, hasApiKey, tokenize, sentenceOf, findExistingWord } from "./lib/utils.js";
import { translateWord } from "./lib/api.js";
import { resetTesseractWorker } from "./lib/ocr.js";
import SignIn from "./components/SignIn.jsx";
import ApiKeyScreen from "./components/ApiKeyScreen.jsx";
import WordList from "./components/WordList.jsx";
import LukuLogo from "./components/LukuLogo.jsx";
import ScanStage from "./components/ScanStage.jsx";
import ReadStage from "./components/ReadStage.jsx";
import ReviewStage from "./components/ReviewStage.jsx";
import { useApiKey } from "./hooks/useApiKey.js";
import { useSession } from "./hooks/useSession.js";
import { useWords } from "./hooks/useWords.js";
import { useReview } from "./hooks/useReview.js";
import { useImageProcessing } from "./hooks/useImageProcessing.js";
import { buttonStyles, shared } from "./lib/styles.js";

const s = stylex.create({
  root: {
    minHeight: "100vh",
    background: "#0f1117",
    color: "#e8e0d5",
    fontFamily: "Georgia,serif",
  },
  loadingWrap: {
    minHeight: "100vh",
    background: "#0f1117",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  loadingText: {
    color: "#4a7c9e",
    fontFamily: "Georgia,serif",
    fontSize: 14,
  },
  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "16px 20px",
    borderBottom: "1px solid rgba(255,255,255,0.07)",
  },
  logoArea: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    cursor: "pointer",
  },
  logoTitle: {
    fontSize: 15,
    fontWeight: 600,
  },
  logoSubSize: {
    fontSize: 9,
  },
  steps: {
    display: "flex",
    gap: 4,
    alignItems: "center",
  },
  stepItem: {
    display: "flex",
    alignItems: "center",
    gap: 4,
  },
  stepDot: {
    width: 20,
    height: 20,
    borderRadius: "50%",
    fontSize: 9,
    fontFamily: "monospace",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  stepDotActive: {
    background: "#4a7c9e",
    border: "1.5px solid #4a7c9e",
    color: "#fff",
  },
  stepDotInactive: {
    background: "rgba(255,255,255,0.05)",
    border: "1.5px solid rgba(255,255,255,0.1)",
    color: "#444",
  },
  stepLine: {
    width: 14,
    height: 1,
    background: "rgba(255,255,255,0.08)",
  },
  actions: {
    display: "flex",
    alignItems: "center",
    gap: 6,
  },
  wordBtnGroup: {
    display: "flex",
    gap: 5,
  },
  wordsBtn: {
    fontSize: 11,
    color: "#7a9e7e",
    background: "rgba(122,158,126,0.1)",
    padding: "3px 9px",
    borderRadius: 20,
    border: "1px solid rgba(122,158,126,0.2)",
    cursor: "pointer",
    fontFamily: "Georgia,serif",
  },
  newBtn: {
    fontSize: 11,
    color: "#7ab4d4",
    background: "rgba(74,124,158,0.12)",
    padding: "3px 9px",
    borderRadius: 20,
    border: "1px solid rgba(74,124,158,0.25)",
    cursor: "pointer",
    fontFamily: "Georgia,serif",
  },
  dueBtn: {
    fontSize: 11,
    color: "#9e8a7a",
    background: "rgba(158,138,122,0.1)",
    padding: "3px 9px",
    borderRadius: 20,
    border: "1px solid rgba(158,138,122,0.2)",
    cursor: "pointer",
    fontFamily: "Georgia,serif",
  },
  smallGhost: {
    padding: "4px 10px",
    fontSize: 11,
  },
});

export default function Luku() {
  const authSession = authClient.useSession();
  const user = authSession.data?.user ?? null;
  const authLoading = authSession.isPending;

  const { savedKey, setSavedKey } = useApiKey();
  const { session, setSession } = useSession();

  const [stage, setStage] = useState(0);
  const [text, setText] = useState("");
  const [tokens, setTokens] = useState([]);
  const [popup, setPopup] = useState(null);
  const [xlating, setXlating] = useState(null);
  const [showWordList, setShowWordList] = useState(false);
  const [newWordIds, setNewWordIds] = useState(() => new Set());
  const [preexistingNewIds, setPreexistingNewIds] = useState(() => new Set());
  const [deletingIds, setDeletingIds] = useState(() => new Set());
  const deletingRef = useRef(new Set());

  const words = useWords(user?.id);

  const handleTextReady = useCallback((rawText, { resetSession = false } = {}) => {
    setText(rawText);
    setTokens(tokenize(rawText));
    setStage(1);
    if (resetSession) { setSession({}); setPopup(null); }
  }, [setSession]);

  const image = useImageProcessing({ savedKey, onTextReady: handleTextReady });
  const review = useReview({ dbWords: words.dbWords, updateWord: words.updateWord, stage });

  useEffect(() => () => resetTesseractWorker(), []);

  if (authLoading) {
    return (
      <div {...stylex.props(s.loadingWrap)}>
        <div {...stylex.props(s.loadingText)}>Loading…</div>
      </div>
    );
  }
  if (!user) return <SignIn />;
  if (!savedKey) return <ApiKeyScreen stage={stage} onSave={setSavedKey} onSkip={() => setSavedKey(SKIP_KEY)} />;

  const allDueWords = words.dbWords.filter((w) => new Date(w.next_review_at) <= new Date());
  const newWords = words.dbWords.filter((w) => newWordIds.has(w.id));
  const dueWords = allDueWords.filter((w) => !newWordIds.has(w.id));
  const savedBases = new Set(words.dbWords.map((w) => w.base));
  const repeatWords = allDueWords.length === 0
    ? [...words.dbWords].sort((a, b) => (a.interval_days ?? 0) - (b.interval_days ?? 0)).slice(0, 5)
    : [];

  const handleStartReview = () => {
    if (words.loadingWords || review.grading) return;
    review.startReview(dueWords);
    setPopup(null);
    setStage(2);
  };

  const handleStartNewReview = () => {
    if (words.loadingWords || review.grading || newWords.length === 0) return;
    review.startNewReview(newWords);
    setPopup(null);
    setStage(2);
  };

  const retireFromNew = (id) => {
    setNewWordIds((prev) => {
      if (!prev.has(id)) return prev;
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
    setPreexistingNewIds((prev) => {
      if (!prev.has(id)) return prev;
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  };

  const handleKeepNew = (id) => {
    retireFromNew(id);
    review.gradeWord(5);
  };

  const handleRemoveNew = async (id) => {
    if (preexistingNewIds.has(id)) {
      review.removeWordFromQueue(id);
      retireFromNew(id);
      return;
    }
    await handleDeleteWord(id);
  };

  const handleStartRepeat = () => {
    if (words.loadingWords || review.grading || words.dbWords.length === 0) return;
    const pool = [...words.dbWords]
      .sort((a, b) => (a.interval_days ?? 0) - (b.interval_days ?? 0))
      .slice(0, 15);
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    review.startRepeat(pool.slice(0, 5));
    setPopup(null);
    setStage(2);
  };

  const handleScanAnother = () => {
    setStage(0);
    setSession({});
    setNewWordIds(new Set());
    setPreexistingNewIds(new Set());
    deletingRef.current = new Set();
    setDeletingIds(new Set());
    review.reset();
    image.reset();
    setText("");
    setTokens([]);
    setPopup(null);
  };

  const onWord = async (e, tok, containerRef) => {
    e.stopPropagation(); if (xlating) return;
    const r = e.target.getBoundingClientRect();
    const pr = containerRef?.current?.getBoundingClientRect() ?? { left: 0, top: 0 };
    const x = r.left - pr.left + r.width / 2, y = r.top - pr.top;
    if (!hasApiKey(savedKey)) { setPopup({ word: tok.v, k: tok.k, x, y, noKey: true }); return; }
    if (session[tok.k]) {
      const cached = session[tok.k];
      const existing = findExistingWord(words.dbWords, { form: tok.v, base: cached.base });
      setPopup({ ...cached, word: tok.v, k: tok.k, x, y, existsInDb: !!existing });
      return;
    }
    const existingByForm = findExistingWord(words.dbWords, { form: tok.v });
    setXlating(tok.k);
    setPopup({ word: tok.v, k: tok.k, x, y, loading: true, existsInDb: !!existingByForm });
    try {
      const d = await translateWord(savedKey, tok.v, sentenceOf(text, tok.v));
      const entry = { base: d.base, translations: d.translations, formTranslation: d.formTranslation, pos: d.pos, example: d.example, example_translation: d.example_translation, original: tok.v, added: false };
      setSession((s) => ({ ...s, [tok.k]: entry }));
      const existing = findExistingWord(words.dbWords, { form: tok.v, base: d.base });
      setPopup({ ...entry, word: tok.v, k: tok.k, x, y, existsInDb: !!existing });
    } catch (e) { setPopup((p) => ({ ...p, loading: false, translations: [`(${e.message || "error"})`] })); }
    finally { setXlating(null); }
  };

  const handleAddWord = async () => {
    if (!popup?.k) return;
    const entry = session[popup.k];
    if (!entry) return;
    const wasPreexisting = !!findExistingWord(words.dbWords, { base: entry.base });
    setSession((s) => ({ ...s, [popup.k]: { ...s[popup.k], added: true } }));
    setPopup((p) => ({ ...p, added: true }));
    try {
      const saved = await words.saveWord(entry);
      if (saved?.id != null) {
        setNewWordIds((prev) => {
          if (prev.has(saved.id)) return prev;
          const next = new Set(prev);
          next.add(saved.id);
          return next;
        });
        if (wasPreexisting) {
          setPreexistingNewIds((prev) => {
            if (prev.has(saved.id)) return prev;
            const next = new Set(prev);
            next.add(saved.id);
            return next;
          });
        }
      }
    } catch (e) { console.error("save word failed", e); }
  };

  const handleDeleteWord = async (id) => {
    if (deletingRef.current.has(id)) return;
    const deletedWord = words.dbWords.find((w) => w.id === id);
    if (!deletedWord) return;
    deletingRef.current.add(id);
    setDeletingIds((prev) => {
      if (prev.has(id)) return prev;
      const next = new Set(prev);
      next.add(id);
      return next;
    });
    const wasNew = newWordIds.has(id);
    const wasPreexisting = preexistingNewIds.has(id);
    const { queueIndices, revIdxAdjust } = review.removeWordFromQueue(id);
    words.removeWord(id);
    if (wasNew) {
      setNewWordIds((prev) => {
        if (!prev.has(id)) return prev;
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
    if (wasPreexisting) {
      setPreexistingNewIds((prev) => {
        if (!prev.has(id)) return prev;
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
    try {
      const res = await fetch(`/api/words?id=${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    } catch (e) {
      console.error("delete word failed", e);
      words.restoreWord(deletedWord);
      review.restoreWordInQueue(id, queueIndices, revIdxAdjust);
      if (wasNew) {
        setNewWordIds((prev) => {
          if (prev.has(id)) return prev;
          const next = new Set(prev);
          next.add(id);
          return next;
        });
      }
      if (wasPreexisting) {
        setPreexistingNewIds((prev) => {
          if (prev.has(id)) return prev;
          const next = new Set(prev);
          next.add(id);
          return next;
        });
      }
    } finally {
      deletingRef.current.delete(id);
      setDeletingIds((prev) => {
        if (!prev.has(id)) return prev;
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  };

  return (
    <div {...stylex.props(s.root)} onClick={() => setPopup(null)}>

      {/* Header */}
      <div {...stylex.props(s.header)}>
        <div onClick={(e) => { e.stopPropagation(); setStage(0); image.reset(); }} {...stylex.props(s.logoArea)}>
          <LukuLogo size={32} />
          <div>
            <div {...stylex.props(s.logoTitle)}>Luku</div>
            <div {...stylex.props(shared.logoSub, s.logoSubSize)}>AI Finnish Reader</div>
          </div>
        </div>
        <div {...stylex.props(s.steps)}>
          {["Scan", "Read", "Review"].map((l, i) => (
            <div key={l} {...stylex.props(s.stepItem)}>
              <div {...stylex.props(s.stepDot, stage === i ? s.stepDotActive : s.stepDotInactive)}>{i + 1}</div>
              {i < 2 && <div {...stylex.props(s.stepLine)} />}
            </div>
          ))}
        </div>
        <div {...stylex.props(s.actions)}>
          {words.dbWords.length > 0 && (
            <div {...stylex.props(s.wordBtnGroup)}>
              <button onClick={(e) => { e.stopPropagation(); setShowWordList(true); }} {...stylex.props(s.wordsBtn)}>{words.dbWords.length} words</button>
              {newWords.length > 0 && <button onClick={(e) => { e.stopPropagation(); handleStartNewReview(); }} {...stylex.props(s.newBtn)}>{newWords.length} new</button>}
              {dueWords.length > 0 && <button onClick={(e) => { e.stopPropagation(); handleStartReview(); }} {...stylex.props(s.dueBtn)}>{dueWords.length} due</button>}
            </div>
          )}
          <button onClick={() => setSavedKey("")} {...stylex.props(buttonStyles.ghost, s.smallGhost)}>Key</button>
          <button onClick={() => authClient.signOut()} {...stylex.props(buttonStyles.ghost, s.smallGhost)}>Sign out</button>
        </div>
      </div>

      {stage === 0 && <ScanStage image={image} dueWords={dueWords} onStartReview={handleStartReview} repeatWords={repeatWords} onStartRepeat={handleStartRepeat} />}
      {stage === 1 && (
        <ReadStage
          tokens={tokens}
          session={session}
          savedBases={savedBases}
          xlating={xlating}
          popup={popup}

          ocrSource={image.ocrSource}
          busy={image.busy}
          err={image.err}
          loadingWords={words.loadingWords}
          dueWords={dueWords}
          newWords={newWords}
          onWord={onWord}
          onAddWord={handleAddWord}
          onRescanWithAI={image.rescanWithAI}
          onStartReview={handleStartReview}
          onStartNewReview={handleStartNewReview}
          onAddApiKey={() => setSavedKey("")}
        />
      )}
      {stage === 2 && (
        <ReviewStage
          queue={review.queue}
          revIdx={review.revIdx}
          showAnswer={review.showAnswer}
          setShowAnswer={review.setShowAnswer}
          grading={review.grading}
          isRepeat={review.isRepeat}
          isNewReview={review.isNewReview}
          dbWords={words.dbWords}
          loadingWords={words.loadingWords}
          onGrade={review.gradeWord}
          onKeepNew={handleKeepNew}
          onRemoveNew={handleRemoveNew}
          preexistingNewIds={preexistingNewIds}
          deletingIds={deletingIds}
          onScanAnother={handleScanAnother}
          dueWords={dueWords}
          onStartReview={handleStartReview}
          repeatWords={repeatWords}
          onStartRepeat={handleStartRepeat}
        />
      )}

      {showWordList && (
        <WordList words={words.dbWords} onClose={() => setShowWordList(false)} onDelete={handleDeleteWord} />
      )}
    </div>
  );
}
