"use client";
import { useState, useCallback, useEffect, useRef } from "react";
import { authClient } from "./lib/authClient.js";
import { SKIP_KEY, hasApiKey, tokenize, sentenceOf, findExistingWord } from "./lib/utils.js";
import { translateWord } from "./lib/api.js";
import { resetTesseractWorker } from "./lib/ocr.js";
import SignIn from "./components/SignIn.jsx";
import ApiKeyScreen from "./components/ApiKeyScreen.jsx";
import WordList from "./components/WordList.jsx";
import TelegramConnect from "./components/TelegramConnect.jsx";
import LukuLogo from "./components/LukuLogo.jsx";
import HeaderMenu from "./components/HeaderMenu.jsx";
import ScanStage from "./components/ScanStage.jsx";
import ReadStage from "./components/ReadStage.jsx";
import ReviewStage from "./components/ReviewStage.jsx";
import { useApiKey } from "./hooks/useApiKey.js";
import { useSession } from "./hooks/useSession.js";
import { useWords } from "./hooks/useWords.js";
import { useReview } from "./hooks/useReview.js";
import { useImageProcessing } from "./hooks/useImageProcessing.js";

const D = "#0f1117";

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
  const [showTelegram, setShowTelegram] = useState(false);
  const [newWordIds, setNewWordIds] = useState(() => new Set());
  // Subset of newWordIds: words that already existed in the DB when the user
  // re-added them this session. Kept separate so Remove can retire them from
  // the new-words bucket without destroying their SRS history.
  const [preexistingNewIds, setPreexistingNewIds] = useState(() => new Set());
  // Ids with an in-flight DELETE. deletingRef is the synchronous re-entry
  // guard (React state updates are batched, so a state Set alone can't stop
  // a rapid second click); deletingIds mirrors it so ReviewStage can disable
  // Remove / Skip / Keep for the card whose delete is pending. WordList runs
  // its own two-step confirm flow and doesn't consume this.
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
      <div style={{ minHeight: "100vh", background: D, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ color: "#4a7c9e", fontFamily: "Georgia,serif", fontSize: 14 }}>Loading…</div>
      </div>
    );
  }
  if (!user) return <SignIn />;
  if (!savedKey) return <ApiKeyScreen stage={stage} onSave={setSavedKey} onSkip={() => setSavedKey(SKIP_KEY)} />;

  const allDueWords = words.dbWords.filter((w) => new Date(w.next_review_at) <= new Date());
  const newWords = words.dbWords.filter((w) => newWordIds.has(w.id));
  // Words freshly added this session get their own review pass, so keep them
  // out of the regular due queue until the user is done triaging them.
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
      // Word predates this session: just retire it from the new-words bucket.
      // Its SRS history stays intact.
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
    // Drop any in-flight delete bookkeeping. If a pending DELETE resolves
    // after this reset, its finally block's functional setters are no-ops
    // because the ids are already gone from both the ref and the state.
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
    // A word hyphenated across a line break is two tokens on screen but one
    // word to look up; both halves carry the whole word in `w`.
    const form = tok.w || tok.v;
    const r = e.target.getBoundingClientRect();
    const pr = containerRef?.current?.getBoundingClientRect() ?? { left: 0, top: 0 };
    const x = r.left - pr.left + r.width / 2, y = r.top - pr.top;
    if (!hasApiKey(savedKey)) { setPopup({ word: form, k: tok.k, x, y, noKey: true }); return; }
    if (session[tok.k]) {
      const cached = session[tok.k];
      const existing = findExistingWord(words.dbWords, { form, base: cached.base });
      setPopup({ ...cached, word: form, k: tok.k, x, y, existsInDb: !!existing });
      return;
    }
    // Local-DB match by the tapped form runs in parallel with the translation
    // request, so we can flag the popup immediately when applicable.
    const existingByForm = findExistingWord(words.dbWords, { form });
    setXlating(tok.k);
    setPopup({ word: form, k: tok.k, x, y, loading: true, existsInDb: !!existingByForm });
    try {
      const d = await translateWord(savedKey, form, sentenceOf(text, form));
      const entry = { base: d.base, translations: d.translations, formTranslation: d.formTranslation, pos: d.pos, example: d.example, example_translation: d.example_translation, original: form, added: false };
      setSession((s) => ({ ...s, [tok.k]: entry }));
      const existing = findExistingWord(words.dbWords, { form, base: d.base });
      setPopup({ ...entry, word: form, k: tok.k, x, y, existsInDb: !!existing });
    } catch (e) { setPopup((p) => ({ ...p, loading: false, translations: [`(${e.message || "error"})`] })); }
    finally { setXlating(null); }
  };

  const handleAddWord = async () => {
    if (!popup?.k) return;
    const entry = session[popup.k];
    if (!entry) return;
    // Snapshot preexistence BEFORE the save so we can distinguish "brand new to
    // the DB" from "re-added something already there".
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
    // Synchronous guard against rapid double-clicks: React state updates are
    // async, so a Set stored only in useState can't stop the second click
    // before its own render cycle. A ref lets us reject re-entry immediately.
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
    <div style={{ minHeight: "100vh", background: D, color: "#e8e0d5", fontFamily: "Georgia,serif" }} onClick={() => setPopup(null)}>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "16px 20px", borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
        <div onClick={(e) => { e.stopPropagation(); setStage(0); image.reset(); }} style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", minWidth: 0, flexShrink: 0 }}>
          <LukuLogo size={32} />
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 15, fontWeight: 600 }}>Luku</div>
            <div className="luku-tagline" style={{ fontSize: 9, color: "#555", letterSpacing: "0.1em", textTransform: "uppercase", whiteSpace: "nowrap" }}>AI Finnish Reader</div>
          </div>
        </div>
        <div className="luku-steps" style={{ display: "flex", gap: 4, alignItems: "center", flexShrink: 0 }}>
          {["Scan", "Read", "Review"].map((l, i) => (
            <div key={l} style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <div style={{ width: 20, height: 20, borderRadius: "50%", fontSize: 9, fontFamily: "monospace", display: "flex", alignItems: "center", justifyContent: "center", background: stage === i ? "#4a7c9e" : "rgba(255,255,255,0.05)", border: `1.5px solid ${stage === i ? "#4a7c9e" : "rgba(255,255,255,0.1)"}`, color: stage === i ? "#fff" : "#444" }}>{i + 1}</div>
              {i < 2 && <div className="luku-step-line" style={{ width: 14, height: 1, background: "rgba(255,255,255,0.08)" }} />}
            </div>
          ))}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
          {words.dbWords.length > 0 && (
            <div style={{ display: "flex", gap: 5 }}>
              <button onClick={(e) => { e.stopPropagation(); setShowWordList(true); }} style={{ fontSize: 11, color: "#7a9e7e", background: "rgba(122,158,126,0.1)", padding: "3px 9px", borderRadius: 20, border: "1px solid rgba(122,158,126,0.2)", cursor: "pointer", fontFamily: "Georgia,serif", whiteSpace: "nowrap" }}>{words.dbWords.length} words</button>
              {/* The due-review launcher used to live here too; it is dropped in
                  favour of the ScanStage entry point, which the header had no
                  room for on a phone. */}
              {newWords.length > 0 && <button onClick={(e) => { e.stopPropagation(); handleStartNewReview(); }} style={{ fontSize: 11, color: "#7ab4d4", background: "rgba(74,124,158,0.12)", padding: "3px 9px", borderRadius: 20, border: "1px solid rgba(74,124,158,0.25)", cursor: "pointer", fontFamily: "Georgia,serif", whiteSpace: "nowrap" }}>{newWords.length} new</button>}
            </div>
          )}
          <HeaderMenu
            onTelegram={() => setShowTelegram(true)}
            onChangeKey={() => setSavedKey("")}
            onSignOut={() => authClient.signOut()}
          />
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

      {showTelegram && <TelegramConnect onClose={() => setShowTelegram(false)} />}

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes fadeUp { from { opacity: 0; transform: translateY(5px); } to { opacity: 1; transform: translateY(0); } }
        * { box-sizing: border-box; margin: 0; padding: 0; }
        /* The header carries a logo, a stage indicator, word-count chips and
           the menu; on a phone the first two give way so the chips and the
           menu never collide. */
        @media (max-width: 460px) {
          .luku-tagline { display: none; }
          .luku-step-line { width: 8px !important; }
        }
        @media (max-width: 400px) {
          .luku-steps { display: none !important; }
        }
        input:focus { outline: 1px solid rgba(74,124,158,0.5); }
      `}</style>
    </div>
  );
}
