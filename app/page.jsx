"use client";
import { useState, useCallback, useEffect } from "react";
import { authClient } from "./lib/authClient.js";
import { SKIP_KEY, hasApiKey, tokenize, sentenceOf } from "./lib/utils.js";
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
import { Bp, Bg } from "./lib/styles.js";

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

  const dueWords = words.dbWords.filter((w) => new Date(w.next_review_at) <= new Date());
  const savedBases = new Set(words.dbWords.map((w) => w.base));
  const repeatWords = dueWords.length === 0
    ? [...words.dbWords].sort((a, b) => (a.interval_days ?? 0) - (b.interval_days ?? 0)).slice(0, 5)
    : [];

  const handleStartReview = () => {
    if (words.loadingWords) return;
    review.startReview(dueWords);
    setPopup(null);
    setStage(2);
  };

  const handleStartRepeat = () => {
    if (words.loadingWords || words.dbWords.length === 0) return;
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
    if (session[tok.k]) { setPopup({ ...session[tok.k], word: tok.v, k: tok.k, x, y }); return; }
    setXlating(tok.k); setPopup({ word: tok.v, k: tok.k, x, y, loading: true });
    try {
      const d = await translateWord(savedKey, tok.v, sentenceOf(text, tok.v));
      const entry = { base: d.base, translations: d.translations, pos: d.pos, original: tok.v, added: false };
      setSession((s) => ({ ...s, [tok.k]: entry }));
      setPopup({ ...entry, word: tok.v, k: tok.k, x, y });
    } catch (e) { setPopup((p) => ({ ...p, loading: false, translations: [`(${e.message || "error"})`] })); }
    finally { setXlating(null); }
  };

  const handleAddWord = async () => {
    if (!popup?.k) return;
    const entry = session[popup.k];
    if (!entry) return;
    setSession((s) => ({ ...s, [popup.k]: { ...s[popup.k], added: true } }));
    setPopup((p) => ({ ...p, added: true }));
    try { await words.saveWord(entry); }
    catch (e) { console.error("save word failed", e); }
  };

  const handleDeleteWord = async (id) => {
    const deletedWord = words.dbWords.find((w) => w.id === id);
    if (!deletedWord) return;
    const { queueIndices, revIdxAdjust } = review.removeWordFromQueue(id);
    words.removeWord(id);
    try {
      const res = await fetch(`/api/words?id=${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    } catch (e) {
      console.error("delete word failed", e);
      words.restoreWord(deletedWord);
      review.restoreWordInQueue(id, queueIndices, revIdxAdjust);
    }
  };

  return (
    <div style={{ minHeight: "100vh", background: D, color: "#e8e0d5", fontFamily: "Georgia,serif" }} onClick={() => setPopup(null)}>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 20px", borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
        <div onClick={(e) => { e.stopPropagation(); setStage(0); image.reset(); }} style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}>
          <LukuLogo size={32} />
          <div>
            <div style={{ fontSize: 15, fontWeight: 600 }}>Luku</div>
            <div style={{ fontSize: 9, color: "#555", letterSpacing: "0.1em", textTransform: "uppercase" }}>AI Finnish Reader</div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
          {["Scan", "Read", "Review"].map((l, i) => (
            <div key={l} style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <div style={{ width: 20, height: 20, borderRadius: "50%", fontSize: 9, fontFamily: "monospace", display: "flex", alignItems: "center", justifyContent: "center", background: stage === i ? "#4a7c9e" : "rgba(255,255,255,0.05)", border: `1.5px solid ${stage === i ? "#4a7c9e" : "rgba(255,255,255,0.1)"}`, color: stage === i ? "#fff" : "#444" }}>{i + 1}</div>
              {i < 2 && <div style={{ width: 14, height: 1, background: "rgba(255,255,255,0.08)" }} />}
            </div>
          ))}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          {words.dbWords.length > 0 && (
            <div style={{ display: "flex", gap: 5 }}>
              <button onClick={(e) => { e.stopPropagation(); setShowWordList(true); }} style={{ fontSize: 11, color: "#7a9e7e", background: "rgba(122,158,126,0.1)", padding: "3px 9px", borderRadius: 20, border: "1px solid rgba(122,158,126,0.2)", cursor: "pointer", fontFamily: "Georgia,serif" }}>{words.dbWords.length} words</button>
              {dueWords.length > 0 && <button onClick={(e) => { e.stopPropagation(); handleStartReview(); }} style={{ fontSize: 11, color: "#9e8a7a", background: "rgba(158,138,122,0.1)", padding: "3px 9px", borderRadius: 20, border: "1px solid rgba(158,138,122,0.2)", cursor: "pointer", fontFamily: "Georgia,serif" }}>{dueWords.length} due</button>}
            </div>
          )}
          <button onClick={() => setSavedKey("")} style={{ ...Bg, padding: "4px 10px", fontSize: 11 }}>Key</button>
          <button onClick={() => authClient.signOut()} style={{ ...Bg, padding: "4px 10px", fontSize: 11 }}>Sign out</button>
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
          onWord={onWord}
          onAddWord={handleAddWord}
          onRescanWithAI={image.rescanWithAI}
          onStartReview={handleStartReview}
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
          dbWords={words.dbWords}
          loadingWords={words.loadingWords}
          onGrade={review.gradeWord}
          onScanAnother={handleScanAnother}
          repeatWords={repeatWords}
          onStartRepeat={handleStartRepeat}
        />
      )}

      {showWordList && (
        <WordList words={words.dbWords} onClose={() => setShowWordList(false)} onDelete={handleDeleteWord} />
      )}

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes fadeUp { from { opacity: 0; transform: translateY(5px); } to { opacity: 1; transform: translateY(0); } }
        * { box-sizing: border-box; margin: 0; padding: 0; }
        input:focus { outline: 1px solid rgba(74,124,158,0.5); }
      `}</style>
    </div>
  );
}
