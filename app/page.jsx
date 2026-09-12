"use client";
import { useState, useCallback, useEffect, useRef } from "react";
import { authClient } from "./lib/authClient.js";
import { SKIP_KEY, SERVER_KEY, hasApiKey, tokenize, sentenceOf, findExistingWord, savedWordEntry, responseError } from "./lib/utils.js";
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
import { useServerKey } from "./hooks/useServerKey.js";
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
  const [changingKey, setChangingKey] = useState(false);
  // Probe only when the answer can change what renders: either there is no
  // saved key, or the key screen is open and needs to know whether to offer
  // the development one. Someone who has typed their own key and never opens
  // that screen — the common case — costs no request at all.
  const probeFor = user?.id && (!savedKey || changingKey) ? user.id : null;
  const { serverKey, checking: checkingServerKey } = useServerKey(probeFor);
  // A key the user typed wins over the development one, so someone who wants
  // to spend their own credit still can.
  const effectiveKey = savedKey || (serverKey ? SERVER_KEY : "");
  const { session, setSession } = useSession(user?.id);

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
  // A failed action, shown in the same banner as a failed load. These used to
  // reach only console.error, which on a screen whose empty state looks exactly
  // like the failed one told the reader nothing.
  const [actionError, setActionError] = useState(null);
  // Which screen is on display. Handlers here await, and the one that resumes
  // cannot read `user` — its closure holds whoever was signed in when it
  // started. The hooks guard their own writes by account id, which answers
  // *whose* list a row belongs in. This asks a narrower question: is the
  // screen still the one that asked? Signing out and back in as the same
  // account passes an id comparison but has already wiped the page below, so
  // a counter that moves on every change is what the resets are keyed to.
  const accountRef = useRef(user?.id);
  const screenRef = useRef(0);
  // The latest delete issued per word. A reset lets the same word be deleted
  // again on a new screen; if the older request then fails, restoring the row
  // would put back something the newer delete has already removed server-side.
  const deleteRuns = useRef(new Map());
  if (accountRef.current !== user?.id) {
    accountRef.current = user?.id;
    screenRef.current += 1;
  }
  // The flags that are *gated* on the screen, cleared wherever the screen is
  // replaced. Leaving one behind does not merely look stale — it strands the
  // thing that gates it: the delete bookkeeping's `finally` only runs for the
  // screen that started the request, so an id left here is never removed and
  // blocks every later attempt at that word.
  //
  // The new-word sets are deliberately not here. They are the session's triage
  // bucket, not the screen's, and returning to the scan screen — to pick a
  // bundle, or to start a review — has to keep them. Only starting a different
  // page (handleScanAnother) or a different account clears them.
  const clearScreenState = useCallback(() => {
    setXlating(null);
    setActionError(null);
    deletingRef.current = new Set();
    setDeletingIds(new Set());
  }, []);

  // Anything that throws away the page's work starts a new screen, not just a
  // change of account: a lookup or save still running from the last page would
  // otherwise pass the guard and repopulate what was just cleared — token keys
  // collide across scans, so the same word on two pages is enough.
  const newScreen = useCallback(() => {
    screenRef.current += 1;
    clearScreenState();
  }, [clearScreenState]);

  const words = useWords(user?.id);

  // Every caller here has produced fresh text — a scan, a crop, or an AI
  // re-scan of the same image. Token keys are derived from the words, so they
  // collide across pages: keeping the previous cache would show its
  // translations, and its "added" ticks, against the new page's tokens.
  const handleTextReady = useCallback((rawText) => {
    newScreen();
    setText(rawText);
    setTokens(tokenize(rawText));
    setSession({});
    setPopup(null);
    setStage(1);
  }, [setSession, newScreen]);

  const image = useImageProcessing({ savedKey: effectiveKey, onTextReady: handleTextReady });
  const review = useReview({ dbWords: words.dbWords, updateWord: words.updateWord, stage });
  // Both hooks hand back a new object every render; these two are the stable
  // callbacks inside them, pulled out so the effect below can depend on what
  // it actually calls rather than on the objects carrying them.
  const { reset: resetReview } = review;
  const { reset: resetImage } = image;

  useEffect(() => () => resetTesseractWorker(), []);

  // Everything on screen belongs to the account that put it there. This
  // component stays mounted while it renders <SignIn />, so without this the
  // next account opens on the previous one's scanned page, their popup, their
  // new-word bookkeeping and their failed action — none of it theirs, and the
  // word ids in it are not theirs either. `useSession` and `useWords` swap
  // their own state on the same id; this is the rest of it.
  useEffect(() => {
    // The counter was already bumped during render; this is the state half.
    clearScreenState();
    setStage(0);
    setText("");
    setTokens([]);
    setPopup(null);
    setShowWordList(false);
    // TelegramConnect loads its status once on mount and never again, so a
    // panel left open across a switch shows the previous account's linked
    // handle to the next one.
    setShowTelegram(false);
    resetReview();
    resetImage();
  }, [user?.id, resetReview, resetImage, clearScreenState]);

  if (authLoading) {
    return (
      <div style={{ minHeight: "100vh", background: D, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ color: "#4a7c9e", fontFamily: "Georgia,serif", fontSize: 14 }}>Loading…</div>
      </div>
    );
  }
  if (!user) return <SignIn />;
  // Held until the probe answers, so a deployment with its own key never
  // flashes a key screen the user does not need. Only when there is no saved
  // key: someone who already has one is not waiting on an answer that cannot
  // change what they see, and blocking them on a network round-trip would put
  // a spinner in front of every visit.
  if (checkingServerKey && !savedKey) {
    return (
      <div style={{ minHeight: "100vh", background: D, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ color: "#4a7c9e", fontFamily: "Georgia,serif", fontSize: 14 }}>Loading…</div>
      </div>
    );
  }
  if (changingKey || !effectiveKey) {
    return (
      <ApiKeyScreen
        stage={stage}
        serverKey={serverKey}
        onSave={(k) => { setSavedKey(k); setChangingKey(false); }}
        onSkip={() => { setSavedKey(SKIP_KEY); setChangingKey(false); }}
        onUseServerKey={() => { setSavedKey(""); setChangingKey(false); }}
      />
    );
  }

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
    // newScreen clears the new-word sets and the delete bookkeeping, so the
    // AI re-scan and the header logo get the same treatment this path used to
    // spell out for itself.
    newScreen();
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
    const forScreen = screenRef.current;
    // A word hyphenated across a line break is two tokens on screen but one
    // word to look up; both halves carry the whole word in `w`.
    const form = tok.w || tok.v;
    const r = e.target.getBoundingClientRect();
    const pr = containerRef?.current?.getBoundingClientRect() ?? { left: 0, top: 0 };
    const x = r.left - pr.left + r.width / 2, y = r.top - pr.top;
    // A word already on the list carries its own translation, so it can be
    // answered from local state — no key needed, and nothing to wait for.
    const savedByForm = findExistingWord(words.dbWords, { form });
    if (!hasApiKey(effectiveKey)) {
      setPopup(savedByForm
        ? { ...savedWordEntry(savedByForm, form), word: form, k: tok.k, x, y, existsInDb: true }
        : { word: form, k: tok.k, x, y, noKey: true });
      return;
    }
    if (session[tok.k]) {
      const cached = session[tok.k];
      const existing = findExistingWord(words.dbWords, { form, base: cached.base });
      setPopup({ ...cached, word: form, k: tok.k, x, y, existsInDb: !!existing });
      return;
    }
    // The saved translation shows straight away while the lookup of this
    // particular form runs; the fresh result replaces it when it lands.
    setXlating(tok.k);
    setPopup({
      ...(savedByForm ? savedWordEntry(savedByForm, form) : {}),
      word: form, k: tok.k, x, y, loading: true, existsInDb: !!savedByForm,
    });
    try {
      const d = await translateWord(effectiveKey, form, sentenceOf(text, form));
      const entry = { base: d.base, translations: d.translations, formTranslation: d.formTranslation, pos: d.pos, example: d.example, example_translation: d.example_translation, original: form, added: false };
      // The cache is keyed by account, but setSession writes under whoever is
      // signed in when it runs — so a lookup that answers after a sign-out
      // would file this account's word under the next one's key. The popup
      // is worse: its x/y and token key describe a page that is gone.
      if (screenRef.current !== forScreen) return;
      setSession((s) => ({ ...s, [tok.k]: entry }));
      const existing = findExistingWord(words.dbWords, { form, base: d.base });
      // The reader may have dismissed the popup while the request was in
      // flight; the answer belongs to the popup that asked for it, so a closed
      // one stays closed. The session cache is written either way, which is
      // what marks the word as seen in the text.
      setPopup((p) => p?.k === tok.k ? { ...entry, word: form, k: tok.k, x, y, existsInDb: !!existing } : p);
    } catch (e) {
      if (screenRef.current !== forScreen) return;
      setPopup((p) => {
        if (p?.k !== tok.k) return p;
        // A word from the list keeps the translation it already had: the
        // failure only concerns the extra lookup of this particular form.
        return p.translations?.length
          ? { ...p, loading: false, formError: e.message || "error" }
          : { ...p, loading: false, translations: [`(${e.message || "error"})`] };
      });
    }
    // As in useImageProcessing: the cleanup needs the same token as the rest.
    // An obsolete lookup clearing this would release the marker the *current*
    // lookup is holding, letting a second one start beside it.
    finally { if (screenRef.current === forScreen) setXlating(null); }
  };

  const handleAddWord = async () => {
    if (!popup?.k) return;
    // Captured up front: the reader can dismiss the popup or tap another word
    // while the save is in flight, and the result belongs to the word that
    // asked for it.
    const key = popup.k;
    const entry = session[key];
    if (!entry) return;
    // Snapshot preexistence BEFORE the save so we can distinguish "brand new to
    // the DB" from "re-added something already there".
    const wasPreexisting = !!findExistingWord(words.dbWords, { base: entry.base });
    const forScreen = screenRef.current;
    // The tick goes on the popup, which is ephemeral, and not into the session
    // cache, which is persisted under the account and survives a sign-out. A
    // save that fails once the screen is gone has no rollback path — there is
    // no popup left and the cache may belong to someone else — so a cache that
    // recorded the claim up front would keep telling this account the word is
    // on their list, with the Add button gone and no way to retry. It is
    // written below, once there is a row to point at.
    setPopup((p) => ({ ...p, added: true }));
    setActionError(null);
    try {
      const saved = await words.saveWord(entry);
      // saveWord withholds a row from another account, but "new this session"
      // is the screen's bookkeeping, not the list's: a save that lands after
      // the page was reset would hold a word out of the due queue for a
      // session that never added it.
      if (screenRef.current !== forScreen) return;
      // The route answers `{ word: null }` when its RETURNING yields no row, so
      // a 2xx does not by itself mean the word was saved. Treated as a success
      // it leaves the popup claiming "Added to review" over nothing, with the
      // Add button gone and no way to retry — the same trap as a swallowed
      // failure, reached through the happy path.
      if (saved?.id == null) throw new Error("The server saved nothing — try again.");
      {
        setSession((s) => (s[key] ? { ...s, [key]: { ...s[key], added: true } } : s));
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
    } catch (e) {
      if (screenRef.current !== forScreen) return;
      console.error("save word failed", e);
      // Nothing was saved, so the tick and the highlight have to go. Leaving
      // them is worse than never having shown them: the popup replaces its
      // Add button with "✓ Added to review", so the reader both believes the
      // word is on the list and has no way to try again.
      setPopup((p) => p?.k === key ? { ...p, added: false } : p);
      setActionError(e.message || "Could not save that word.");
    }
  };

  const handleDeleteWord = async (id) => {
    const forScreen = screenRef.current;
    const forAccount = accountRef.current;
    const forDelete = (deleteRuns.current.get(id) ?? 0) + 1;
    deleteRuns.current.set(id, forDelete);
    // As handleAddWord does. Without it a failure reported here outlives the
    // retry that succeeds, and the reader is still being told about a delete
    // that has since gone through.
    setActionError(null);
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
      if (!res.ok) throw await responseError(res, "Could not delete that word");
      // The optimistic removal was undone by the reload the account change
      // triggered, so the row is back on screen while the server no longer has
      // it — and deleting it again would 404 and restore it a second time.
      // Scoped to the account rather than the screen: the row is this
      // account's either way, and removing it is what the server already did.
      if (screenRef.current !== forScreen && accountRef.current === forAccount) {
        words.removeWord(id);
      }
    } catch (e) {
      console.error("delete word failed", e);
      // Two different questions, and conflating them lost the row. The
      // vocabulary belongs to the *account*: the delete failed, the server
      // still has the word, so it belongs back on the list even if the reader
      // has since scanned another page — otherwise it simply disappears until
      // a reload. The banner, the queue and the new-word sets belong to the
      // *screen*, which has been reset and is not the one that asked.
      if (accountRef.current !== forAccount) return;
      // And only while this is still the word's current delete: a newer one may
      // have succeeded on a later screen, and the row is genuinely gone.
      if (deleteRuns.current.get(id) !== forDelete) return;
      words.restoreWord(deletedWord);
      if (screenRef.current !== forScreen) return;
      // The row comes back on screen, which on its own reads as the delete
      // never having been asked for. Saying why is the difference between a
      // reader who retries and one who thinks they mis-clicked.
      setActionError(e.message || "Could not delete that word.");
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
      // The fourth place this has bitten: a reset empties both collections, so
      // a new screen can start deleting the same word before this request
      // settles, and an ungated cleanup here would lift *its* guard and
      // re-enable its controls.
      if (screenRef.current === forScreen) {
        deletingRef.current.delete(id);
        setDeletingIds((prev) => {
          if (!prev.has(id)) return prev;
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
      }
    }
  };

  const banner = words.wordsError || actionError || review.gradeError;
  // Dismiss has to clear whichever source is showing, or the alert stays put.
  const dismissAction = () => { setActionError(null); review.clearGradeError(); };
  // While the overlay is open it renders the banner itself, above its own
  // backdrop. Two copies would be one too many, and the page's is the one
  // nobody can see.
  const pageBanner = showWordList ? null : banner;

  return (
    <div style={{ minHeight: "100vh", background: D, color: "#e8e0d5", fontFamily: "Georgia,serif" }} onClick={() => setPopup(null)}>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "16px 20px", borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
        {/* Back to the scan screen, which is also how the reader reaches a
            review — so this keeps the session's new-word triage. The stale
            translations it used to leave behind are handled where they
            actually matter: a new scan clears the cache. */}
        <div onClick={(e) => { e.stopPropagation(); newScreen(); setStage(0); image.reset(); }} style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", minWidth: 0, flexShrink: 0 }}>
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
            onChangeKey={() => setChangingKey(true)}
            onSignOut={() => authClient.signOut()}
          />
        </div>
      </div>

      {/* A load failure wins over an action failure: it explains the empty
          screen the reader is looking at, and unlike a failed action it does
          not go away by dismissing it. */}
      {pageBanner && (
        <div
          role="alert"
          style={{ margin: "14px 18px 0", background: "rgba(180,80,80,0.1)", border: "1px solid rgba(180,80,80,0.3)", borderRadius: 10, padding: "11px 14px", fontSize: 12, color: "#c48a8a", display: "flex", alignItems: "flex-start", gap: 10 }}
        >
          <span style={{ flex: 1, lineHeight: 1.5 }}>⚠ {pageBanner}</span>
          {!words.wordsError && (
            <button
              onClick={(e) => { e.stopPropagation(); dismissAction(); }}
              aria-label="Dismiss"
              style={{ background: "none", border: "none", color: "#c48a8a", fontSize: 14, cursor: "pointer", lineHeight: 1, padding: "0 2px" }}
            >
              ✕
            </button>
          )}
        </div>
      )}

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
          onAddApiKey={() => setChangingKey(true)}
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
        <WordList
          words={words.dbWords}
          onClose={() => setShowWordList(false)}
          onDelete={handleDeleteWord}
          error={banner}
          onDismissError={words.wordsError ? undefined : dismissAction}
        />
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
