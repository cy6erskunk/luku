"use client";
import { useState, useRef, useCallback, useEffect } from "react";

const SKIP_KEY = "__skip__";
const hasApiKey = (key) => key && key !== SKIP_KEY;

// ── API ────────────────────────────────────────────────────────────────────
async function callClaude(apiKey, messages, system, maxTokens = 1500) {
  const res = await fetch("/api/claude", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ apiKey, messages, system, maxTokens }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
  return data.content.find((b) => b.type === "text")?.text ?? "";
}

async function ocrImage(apiKey, base64, mediaType) {
  return callClaude(
    apiKey,
    [{ role: "user", content: [
      { type: "image", source: { type: "base64", media_type: mediaType, data: base64 } },
      { type: "text", text: "Extract ALL text from this image exactly as written. Return only the raw text, nothing else. Preserve paragraph breaks." },
    ]}],
    "You are an OCR assistant. Extract text from images with high accuracy.",
    1500
  );
}

// ── Local OCR (Tesseract.js) ──────────────────────────────────────────────
let tesseractWorkerPromise = null;
let ocrStatusCallback = null;

function waitForTesseract(timeout = 15000) {
  return new Promise((resolve, reject) => {
    if (typeof window !== "undefined" && window.Tesseract) return resolve(window.Tesseract);
    const t0 = Date.now();
    const id = setInterval(() => {
      if (typeof window !== "undefined" && window.Tesseract) { clearInterval(id); resolve(window.Tesseract); }
      else if (Date.now() - t0 > timeout) { clearInterval(id); reject(new Error("Tesseract.js failed to load")); }
    }, 100);
  });
}

async function initWorker() {
  const { createWorker } = await waitForTesseract();
  const worker = await createWorker("fin", 1, {
    logger(p) {
      if (!ocrStatusCallback || p.progress == null) return;
      const label = p.status === "loading tesseract core" ? "Loading OCR engine…"
        : p.status === "initializing tesseract" ? "Initializing OCR…"
        : p.status === "loading language traineddata" ? "Downloading Finnish model…"
        : p.status === "initializing api" ? "Preparing OCR…"
        : p.status === "recognizing text" ? "Recognizing text…"
        : null;
      if (label) ocrStatusCallback(label, p.progress);
    },
  });
  await worker.setParameters({
    tessedit_pageseg_mode: "6",
    preserve_interword_spaces: "1",
  });
  return worker;
}

function getOrCreateWorker() {
  if (!tesseractWorkerPromise) {
    tesseractWorkerPromise = initWorker().catch((err) => {
      tesseractWorkerPromise = null;
      throw err;
    });
  }
  return tesseractWorkerPromise;
}

function resetTesseractWorker() {
  if (!tesseractWorkerPromise) return;
  const p = tesseractWorkerPromise;
  tesseractWorkerPromise = null;
  p.then((w) => w.terminate()).catch(() => {});
}

async function ocrLocal(base64, mediaType, onStatus) {
  ocrStatusCallback = onStatus;
  if (onStatus) onStatus("Loading OCR engine…", 0);
  const worker = await getOrCreateWorker();
  const dataUrl = `data:${mediaType};base64,${base64}`;
  const { data: { text } } = await worker.recognize(dataUrl);
  ocrStatusCallback = null;
  return text;
}

async function translateWord(apiKey, word, context) {
  const raw = await callClaude(
    apiKey,
    [{ role: "user", content: `Finnish word: "${word}"\nSentence: "${context}"\n\nONLY raw JSON:\n{"base":"dictionary form","translations":["main English","alt1","alt2"],"pos":"noun/verb/adj/adv/other"}` }],
    "You are a Finnish linguist. Return only raw JSON, no markdown.",
    250
  );
  try { return JSON.parse(raw.replace(/```json|```/g, "").trim()); }
  catch { return { base: word, translations: ["(unavailable)"], pos: "?" }; }
}

// ── Image helpers ──────────────────────────────────────────────────────────
function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const MAX = 1024, scale = Math.min(1, MAX / Math.max(img.width, img.height));
        const c = document.createElement("canvas");
        c.width = Math.round(img.width * scale);
        c.height = Math.round(img.height * scale);
        c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
        let quality = 0.85;
        let base64 = c.toDataURL("image/jpeg", quality).split(",")[1];
        while (base64.length > 400000 && quality > 0.4) {
          quality -= 0.1;
          base64 = c.toDataURL("image/jpeg", quality).split(",")[1];
        }
        resolve({ base64, mediaType: "image/jpeg" });
      };
      img.onerror = () => reject(new Error("Cannot decode image"));
      img.src = e.target.result;
    };
    reader.onerror = () => reject(new Error("FileReader failed"));
    reader.readAsDataURL(file);
  });
}

function tokenize(text) {
  const out = [], re = /(\n+|\s+|[.,!?;:"""''«»—–\-]+|[^\s.,!?;:"""''«»—–\-]+)/g;
  let m;
  while ((m = re.exec(text))) {
    const v = m[0];
    if (/^\n+$/.test(v)) out.push({ t: "br", v });
    else if (/^\s+$/.test(v)) out.push({ t: "sp", v });
    else if (/^[.,!?;:"""''«»—–\-]+$/.test(v)) out.push({ t: "pu", v });
    else out.push({ t: "wd", v, k: v.toLowerCase() });
  }
  return out;
}

function sentenceOf(text, word) {
  return (text.match(/[^.!?\n]+[.!?]*/g) || [text]).find((s) => s.toLowerCase().includes(word.toLowerCase())) || text.slice(0, 120);
}

// ── Styles ─────────────────────────────────────────────────────────────────
const D = "#0f1117";
const POS_CLR = { verb: "#7a9e7e", noun: "#9e8a7a", adjective: "#7a8a9e", adverb: "#9e7a9e" };
const Bp = { padding: "13px 18px", borderRadius: 12, fontSize: 14, cursor: "pointer", border: "none", fontFamily: "Georgia,serif", background: "linear-gradient(135deg,#4a7c9e,#2d5a7a)", color: "#fff" };
const Bg = { ...Bp, background: "transparent", border: "1px solid rgba(255,255,255,0.12)", color: "#6b645e" };

// ── Component ──────────────────────────────────────────────────────────────
export default function Luku() {
  const [apiKey, setApiKey] = useState("");
  const [savedKey, _setSavedKey] = useState(() => {
    if (typeof window === "undefined") return "";
    try { return localStorage.getItem("luku_api_key") || ""; } catch { return ""; }
  });
  const setSavedKey = useCallback((v) => {
    _setSavedKey(v);
    try { if (v) localStorage.setItem("luku_api_key", v); else localStorage.removeItem("luku_api_key"); } catch {}
  }, []);
  const [keyInput, setKeyInput] = useState("");

  const [stage, setStage] = useState(0);
  const [text, setText] = useState("");
  const [tokens, setTokens] = useState([]);
  const [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState("");
  const [err, setErr] = useState("");
  const [popup, setPopup] = useState(null);
  const [xlating, setXlating] = useState(null);
  const [session, _setSession] = useState(() => {
    if (typeof window === "undefined") return {};
    try { const v = JSON.parse(localStorage.getItem("luku_session") || "{}"); return v && typeof v === "object" && !Array.isArray(v) ? v : {}; } catch { return {}; }
  });
  const setSession = useCallback((v) => {
    let next;
    _setSession((prev) => { next = typeof v === "function" ? v(prev) : v; return next; });
    try { localStorage.setItem("luku_session", JSON.stringify(next)); } catch {}
  }, []);
  const [saved, _setSaved] = useState(() => {
    if (typeof window === "undefined") return [];
    try { const v = JSON.parse(localStorage.getItem("luku_saved") || "[]"); return Array.isArray(v) ? v : []; } catch { return []; }
  });
  const setSaved = useCallback((v) => {
    let next;
    _setSaved((prev) => { next = typeof v === "function" ? v(prev) : v; return next; });
    try { localStorage.setItem("luku_saved", JSON.stringify(next)); } catch {}
  }, []);
  const [revIdx, setRevIdx] = useState(0);
  const [ocrProgress, setOcrProgress] = useState(0);
  const [ocrSource, setOcrSource] = useState("");

  const fileRef = useRef(), camRef = useRef(), readRef = useRef();

  useEffect(() => () => resetTesseractWorker(), []);

  // ── API key screen ───────────────────────────────────────────────────────
  if (!savedKey) {
    return (
      <div style={{ minHeight: "100vh", background: D, color: "#e8e0d5", fontFamily: "Georgia,serif", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
        <div style={{ maxWidth: 400, width: "100%" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 32 }}>
            <div style={{ width: 36, height: 36, borderRadius: "50%", background: "linear-gradient(135deg,#4a7c9e,#2d5a7a)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16 }}>🇫🇮</div>
            <div>
              <div style={{ fontSize: 18, fontWeight: 600 }}>Luku</div>
              <div style={{ fontSize: 10, color: "#555", letterSpacing: "0.1em", textTransform: "uppercase" }}>AI Finnish Reader</div>
            </div>
          </div>
          <p style={{ color: "#6b645e", fontSize: 13, lineHeight: 1.7, marginBottom: 24 }}>
            Luku reads Finnish text from photos and helps you learn vocabulary. An API key from{" "}
            <a href="https://console.anthropic.com" target="_blank" rel="noreferrer" style={{ color: "#4a7c9e" }}>console.anthropic.com</a>{" "}
            enables translations and AI-powered OCR, or skip to scan locally for free.
          </p>
          <input
            type="password"
            placeholder="sk-ant-..."
            value={keyInput}
            onChange={(e) => setKeyInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && keyInput.startsWith("sk-") && setSavedKey(keyInput)}
            style={{ width: "100%", padding: "12px 14px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.04)", color: "#e8e0d5", fontSize: 14, fontFamily: "monospace", boxSizing: "border-box", marginBottom: 12, outline: "none" }}
          />
          <button
            onClick={() => keyInput.startsWith("sk-") && setSavedKey(keyInput)}
            disabled={!keyInput.startsWith("sk-")}
            style={{ ...Bp, width: "100%", opacity: keyInput.startsWith("sk-") ? 1 : 0.4 }}
          >
            {stage > 0 ? "Save key & continue →" : "Start reading →"}
          </button>
          <button
            onClick={() => setSavedKey(SKIP_KEY)}
            style={{ ...Bg, width: "100%", marginTop: 8 }}
          >
            Skip — use local OCR only
          </button>
          <p style={{ fontSize: 11, color: "#3a4550", marginTop: 16, textAlign: "center" }}>
            Key is saved in your browser's local storage and never sent to any server except Anthropic.
          </p>
        </div>
      </div>
    );
  }

  // ── File processing ──────────────────────────────────────────────────────
  const processFile = async (file) => {
    setErr(""); setBusy(true); setStep("Reading image…");
    try {
      const { base64, mediaType } = await fileToBase64(file);
      setPreview(`data:${mediaType};base64,${base64}`);
      setStep("Loading OCR engine…");
      setOcrProgress(0);
      const out = await ocrLocal(base64, mediaType, (label, p) => {
        setStep(label);
        setOcrProgress(p);
      });
      setOcrProgress(1);
      if (!out?.trim()) { setErr("No text found — try a clearer photo."); return; }
      setText(out.trim()); setTokens(tokenize(out.trim())); setStage(1); setOcrSource("local");
    } catch (e) { setErr(e.message); }
    finally { setBusy(false); setStep(""); }
  };

  const onFile = (e) => { const f = e.target.files?.[0]; if (f && !busy) processFile(f); e.target.value = ""; };
  const onDrop = (e) => { e.preventDefault(); const f = e.dataTransfer.files?.[0]; if (f && !busy) processFile(f); };

  const rescanWithAI = async () => {
    const hasKey = hasApiKey(savedKey);
    if (!hasKey) { setErr("Enter your API key to use AI OCR — tap 'Key' in the header."); return; }
    setErr(""); setBusy(true); setStep("Re-scanning with AI…");
    try {
      const [header, b64] = preview.split(",");
      const mediaType = header.match(/data:(.*?);/)[1];
      const out = await ocrImage(savedKey, b64, mediaType);
      if (!out?.trim()) { setErr("AI found no text — try a different photo."); return; }
      setText(out.trim()); setTokens(tokenize(out.trim()));
      setOcrSource("ai");
      setSession({}); setPopup(null);
    } catch (e) { setErr(e.message); }
    finally { setBusy(false); setStep(""); }
  };

  // ── Word tap ─────────────────────────────────────────────────────────────
  const hasRealKey = hasApiKey(savedKey);

  const onWord = async (e, tok) => {
    e.stopPropagation(); if (xlating) return;
    const r = e.target.getBoundingClientRect(), pr = readRef.current?.getBoundingClientRect() ?? { left: 0, top: 0 };
    const x = r.left - pr.left + r.width / 2, y = r.top - pr.top;
    if (!hasRealKey) { setPopup({ word: tok.v, k: tok.k, x, y, noKey: true }); return; }
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

  const addWord = () => {
    if (!popup?.k) return;
    setSession((s) => ({ ...s, [popup.k]: { ...s[popup.k], added: true } }));
    setPopup((p) => ({ ...p, added: true }));
  };

  const reviewList = Object.entries(session).filter(([, v]) => v.added);
  const confirmWord = (k) => { setSaved((s) => [...s, session[k]]); setRevIdx((i) => i + 1); };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div style={{ minHeight: "100vh", background: D, color: "#e8e0d5", fontFamily: "Georgia,serif" }} onClick={() => setPopup(null)}>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 20px", borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 32, height: 32, borderRadius: "50%", background: "linear-gradient(135deg,#4a7c9e,#2d5a7a)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14 }}>🇫🇮</div>
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
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {saved.length > 0 && <div style={{ fontSize: 11, color: "#7a9e7e", background: "rgba(122,158,126,0.1)", padding: "3px 9px", borderRadius: 20, border: "1px solid rgba(122,158,126,0.2)" }}>{saved.length} saved</div>}
          <button onClick={() => setSavedKey("")} style={{ ...Bg, padding: "4px 10px", fontSize: 11 }}>Key</button>
        </div>
      </div>

      {/* Stage 0 — Scan */}
      {stage === 0 && (
        <div style={{ padding: "36px 20px", display: "flex", flexDirection: "column", alignItems: "center" }}>
          <div style={{ fontSize: 10, letterSpacing: "0.15em", textTransform: "uppercase", color: "#4a7c9e", marginBottom: 10, fontFamily: "monospace" }}>Step 1 — Scan</div>
          <h2 style={{ fontSize: 24, fontWeight: 400, textAlign: "center", margin: "0 0 6px" }}>Photograph a Finnish page</h2>
          <p style={{ color: "#6b645e", textAlign: "center", marginBottom: 28, maxWidth: 300, fontSize: 13, lineHeight: 1.6 }}>Take a photo or upload an image. Text will be extracted locally.</p>
          <div
            onDrop={onDrop} onDragOver={(e) => e.preventDefault()}
            onClick={() => !busy && fileRef.current?.click()}
            style={{ width: "100%", maxWidth: 400, aspectRatio: "4/3", borderRadius: 14, border: "1.5px dashed rgba(74,124,158,0.4)", cursor: busy ? "default" : "pointer", background: preview ? "transparent" : "rgba(74,124,158,0.03)", overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 10, marginBottom: 14, position: "relative" }}
          >
            {preview
              ? <img src={preview} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              : <><div style={{ fontSize: 36, opacity: 0.15 }}>🖼</div><div style={{ color: "#4a6070", fontSize: 13, textAlign: "center" }}>Drop image here<br /><span style={{ opacity: 0.6, fontSize: 11 }}>or tap to browse</span></div></>}
            {[
              [{ top: 8, left: 8 }, { borderTop: "2px solid #4a7c9e", borderLeft: "2px solid #4a7c9e", borderRadius: "3px 0 0 0" }],
              [{ top: 8, right: 8 }, { borderTop: "2px solid #4a7c9e", borderRight: "2px solid #4a7c9e", borderRadius: "0 3px 0 0" }],
              [{ bottom: 8, left: 8 }, { borderBottom: "2px solid #4a7c9e", borderLeft: "2px solid #4a7c9e", borderRadius: "0 0 0 3px" }],
              [{ bottom: 8, right: 8 }, { borderBottom: "2px solid #4a7c9e", borderRight: "2px solid #4a7c9e", borderRadius: "0 0 3px 0" }],
            ].map(([p, b], i) => <div key={i} style={{ position: "absolute", width: 18, height: 18, ...p, ...b }} />)}
          </div>
          <input ref={fileRef} type="file" accept="image/*" onChange={onFile} style={{ display: "none" }} />
          <input ref={camRef} type="file" accept="image/*" capture="environment" onChange={onFile} style={{ display: "none" }} />
          <div style={{ display: "flex", gap: 10, width: "100%", maxWidth: 400 }}>
            <button onClick={() => camRef.current?.click()} disabled={busy} style={{ ...Bg, flex: 1 }}>📷 Camera</button>
            <button onClick={() => fileRef.current?.click()} disabled={busy} style={{ ...Bp, flex: 2 }}>📁 Photo Library</button>
          </div>
          {busy && (
            <div style={{ marginTop: 20, width: "100%", maxWidth: 400 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, color: "#4a7c9e", fontSize: 13, marginBottom: 8 }}>
                <span style={{ animation: "spin 1s linear infinite", display: "inline-block" }}>⟳</span>{step}
              </div>
              {ocrProgress > 0 && ocrProgress < 1 && (
                <div style={{ height: 3, background: "rgba(255,255,255,0.06)", borderRadius: 2, overflow: "hidden" }}>
                  <div style={{ height: "100%", width: `${Math.round(ocrProgress * 100)}%`, background: "linear-gradient(90deg,#4a7c9e,#2d5a7a)", transition: "width 0.2s" }} />
                </div>
              )}
            </div>
          )}
          {err && <div style={{ marginTop: 14, maxWidth: 400, width: "100%", background: "rgba(180,80,80,0.1)", border: "1px solid rgba(180,80,80,0.3)", borderRadius: 10, padding: "11px 14px", fontSize: 12, color: "#c48a8a" }}>⚠ {err}</div>}
        </div>
      )}

      {/* Stage 1 — Read */}
      {stage === 1 && (
        <div ref={readRef} style={{ position: "relative", padding: "24px 18px 100px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <div style={{ fontSize: 10, letterSpacing: "0.15em", textTransform: "uppercase", color: "#4a7c9e", fontFamily: "monospace" }}>Step 2 — Read</div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              {xlating && <span style={{ fontSize: 11, color: "#4a7c9e", display: "flex", alignItems: "center", gap: 4 }}><span style={{ animation: "spin 1s linear infinite", display: "inline-block" }}>⟳</span>translating…</span>}
              <span style={{ fontSize: 11, color: "#555", background: "rgba(74,124,158,0.08)", padding: "2px 9px", borderRadius: 20 }}>tap any word</span>
            </div>
          </div>
          <div style={{ display: "flex", gap: 12, marginBottom: 14, fontSize: 10, color: "#555" }}>
            {[["#4a7c9e", "rgba(74,124,158,0.15)", "added"], ["#7a9e7e", "rgba(122,158,126,0.1)", "seen"]].map(([c, bg, l]) => (
              <div key={l} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <div style={{ width: 7, height: 7, background: bg, border: `1.5px solid ${c}`, borderRadius: 2 }} />{l}
              </div>
            ))}
          </div>
          {ocrSource === "local" && (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 9, padding: "8px 13px", marginBottom: 14, fontSize: 12 }}>
              <span style={{ color: "#6b645e" }}>Scanned locally with Tesseract</span>
              <button onClick={rescanWithAI} disabled={busy} style={{ ...Bg, padding: "5px 12px", fontSize: 11, opacity: busy ? 0.5 : 1 }}>
                {busy ? "Scanning…" : "Re-scan with AI"}
              </button>
            </div>
          )}
          {ocrSource === "ai" && (
            <div style={{ background: "rgba(74,124,158,0.08)", border: "1px solid rgba(74,124,158,0.15)", borderRadius: 9, padding: "8px 13px", marginBottom: 14, fontSize: 11, color: "#4a7c9e" }}>
              Scanned with AI (Claude Vision)
            </div>
          )}
          {err && <div style={{ marginBottom: 14, background: "rgba(180,80,80,0.1)", border: "1px solid rgba(180,80,80,0.3)", borderRadius: 10, padding: "11px 14px", fontSize: 12, color: "#c48a8a" }}>⚠ {err}</div>}
          <div style={{ background: "rgba(255,255,255,0.015)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 14, padding: "20px 16px", lineHeight: 2.1, fontSize: 17 }}>
            {tokens.map((tok, i) => {
              if (tok.t === "br") return <br key={i} />;
              if (tok.t === "sp") return <span key={i}> </span>;
              if (tok.t === "pu") return <span key={i} style={{ color: "#333" }}>{tok.v}</span>;
              const added = session[tok.k]?.added, seen = !!session[tok.k] && !added, loading = xlating === tok.k;
              return (
                <span key={i} onClick={(e) => onWord(e, tok)} style={{ cursor: "pointer", borderRadius: 3, padding: "1px 2px", background: loading ? "rgba(74,124,158,0.3)" : added ? "rgba(74,124,158,0.15)" : seen ? "rgba(122,158,126,0.1)" : "transparent", color: added ? "#7ab4d4" : seen ? "#8eba92" : "#e0d8cf", borderBottom: !added && !seen && !loading ? "1px dotted rgba(232,224,213,0.12)" : "none", transition: "all 0.12s" }}>{tok.v}</span>
              );
            })}
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
            {[{ n: Object.keys(session).length, l: "looked up" }, { n: Object.values(session).filter((w) => w.added).length, l: "to review" }].map(({ n, l }) => (
              <div key={l} style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 9, padding: "7px 13px" }}>
                <div style={{ fontSize: 18, fontWeight: 600, color: "#4a7c9e" }}>{n}</div>
                <div style={{ fontSize: 10, color: "#555" }}>{l}</div>
              </div>
            ))}
          </div>
          <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, padding: "12px 18px", background: "linear-gradient(to top,#0f1117 60%,transparent)", zIndex: 50 }}>
            <button onClick={() => { setPopup(null); setRevIdx(0); setStage(2); }} style={{ ...Bp, width: "100%", maxWidth: 480, margin: "0 auto", display: "block" }}>Done Reading → Review Words</button>
          </div>
          {popup && (
            <div onClick={(e) => e.stopPropagation()} style={{ position: "absolute", left: Math.min(Math.max((popup.x ?? 150) - 125, 4), (readRef.current?.offsetWidth ?? 360) - 258), top: Math.max((popup.y ?? 80) - 155, 8), width: 250, background: "#181d2a", border: "1px solid rgba(74,124,158,0.45)", borderRadius: 12, padding: 14, boxShadow: "0 12px 40px rgba(0,0,0,0.7)", zIndex: 200, animation: "fadeUp 0.12s ease" }}>
              {popup.noKey
                ? <div style={{ textAlign: "center", padding: "12px 0", color: "#6b645e", fontSize: 12 }}>
                    <div style={{ fontSize: 19, color: "#e8e0d5", fontWeight: 600, marginBottom: 8 }}>{popup.word}</div>
                    Add your API key to translate words.
                    <button onClick={() => { setPopup(null); setSavedKey(""); }} style={{ ...Bg, marginTop: 10, padding: "5px 12px", fontSize: 11, display: "block", width: "100%" }}>Add API key</button>
                  </div>
                : popup.loading
                ? <div style={{ textAlign: "center", padding: "18px 0", color: "#4a7c9e" }}><div style={{ fontSize: 22, animation: "spin 1s linear infinite", marginBottom: 6 }}>⟳</div><div style={{ fontSize: 12 }}>Analysing "{popup.word}"…</div></div>
                : <>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
                    <div>
                      <div style={{ fontSize: 19, color: "#e8e0d5", fontWeight: 600 }}>{popup.word}</div>
                      {popup.base && popup.base !== popup.word?.toLowerCase() && <div style={{ fontSize: 11, color: "#4a7c9e", fontFamily: "monospace" }}>base: {popup.base}</div>}
                    </div>
                    {popup.pos && <div style={{ fontSize: 9, padding: "2px 6px", borderRadius: 8, marginTop: 2, fontFamily: "monospace", color: POS_CLR[popup.pos] ?? "#666", background: "rgba(255,255,255,0.05)", border: `1px solid ${(POS_CLR[popup.pos] ?? "#666")}44` }}>{popup.pos}</div>}
                  </div>
                  <div style={{ marginBottom: 12 }}>
                    {(popup.translations || []).map((t, i) => <div key={i} style={{ fontSize: i === 0 ? 14 : 12, color: i === 0 ? "#c8c0b5" : "#6b645e", paddingBottom: 2 }}>{i === 0 ? "→ " : "   "}{t}</div>)}
                  </div>
                  {(popup.added || session[popup.k]?.added)
                    ? <div style={{ fontSize: 11, color: "#4a7c9e", textAlign: "center", padding: 5, background: "rgba(74,124,158,0.1)", borderRadius: 6 }}>✓ Added to review</div>
                    : <button onClick={addWord} style={{ width: "100%", padding: 7, fontSize: 12, cursor: "pointer", background: "rgba(74,124,158,0.18)", border: "1px solid rgba(74,124,158,0.38)", color: "#7ab4d4", borderRadius: 7, fontFamily: "inherit" }}>+ Add to review list</button>}
                </>}
            </div>
          )}
        </div>
      )}

      {/* Stage 2 — Review */}
      {stage === 2 && (
        <div style={{ padding: "24px 18px 36px", maxWidth: 460, margin: "0 auto" }}>
          <div style={{ fontSize: 10, letterSpacing: "0.15em", textTransform: "uppercase", color: "#4a7c9e", marginBottom: 14, fontFamily: "monospace" }}>Step 3 — Review</div>
          {reviewList.length === 0
            ? <div style={{ textAlign: "center", padding: "50px 0" }}>
              <div style={{ fontSize: 40, marginBottom: 12 }}>📖</div>
              <div style={{ color: "#6b645e", fontSize: 14, lineHeight: 1.6 }}>No words added.<br />Tap words while reading to look them up.</div>
              <button onClick={() => setStage(1)} style={{ ...Bg, marginTop: 18, padding: "9px 20px" }}>← Back</button>
            </div>
            : revIdx < reviewList.length
              ? (() => {
                const [k, w] = reviewList[revIdx];
                return <>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 16 }}>
                    <div style={{ fontSize: 16, fontWeight: 400 }}>Review words</div>
                    <div style={{ fontSize: 12, color: "#555" }}>{revIdx + 1} / {reviewList.length}</div>
                  </div>
                  <div style={{ height: 3, background: "rgba(255,255,255,0.06)", borderRadius: 2, marginBottom: 24, overflow: "hidden" }}>
                    <div style={{ height: "100%", width: `${(revIdx / reviewList.length) * 100}%`, background: "#4a7c9e", transition: "width 0.3s" }} />
                  </div>
                  <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 18, padding: "32px 24px", textAlign: "center", marginBottom: 18 }}>
                    <div style={{ fontSize: 30, marginBottom: 4 }}>{w.original}</div>
                    {w.base && w.base !== w.original?.toLowerCase() && <div style={{ fontSize: 11, color: "#4a7c9e", fontFamily: "monospace", marginBottom: 4 }}>base: {w.base}</div>}
                    {w.pos && <div style={{ fontSize: 10, color: POS_CLR[w.pos] ?? "#666", marginBottom: 18 }}>{w.pos}</div>}
                    <div style={{ borderTop: "1px solid rgba(255,255,255,0.06)", paddingTop: 18 }}>
                      {w.translations.map((t, i) => <div key={i} style={{ fontSize: i === 0 ? 17 : 13, color: i === 0 ? "#c8c0b5" : "#6b645e", marginBottom: 4 }}>{t}</div>)}
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 10 }}>
                    <button onClick={() => setRevIdx((i) => i + 1)} style={{ ...Bg, flex: 1 }}>Skip</button>
                    <button onClick={() => confirmWord(k)} style={{ ...Bp, flex: 2 }}>✓ Save to list</button>
                  </div>
                </>;
              })()
              : <div style={{ textAlign: "center", padding: "36px 0" }}>
                <div style={{ fontSize: 46, marginBottom: 12 }}>🎉</div>
                <h2 style={{ fontSize: 20, fontWeight: 400, marginBottom: 6 }}>Session complete</h2>
                <p style={{ color: "#6b645e", marginBottom: 24 }}>Saved <strong style={{ color: "#4a7c9e" }}>{saved.length}</strong> word{saved.length !== 1 ? "s" : ""}.</p>
                {saved.length > 0 && (
                  <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 14, padding: 16, marginBottom: 24, textAlign: "left" }}>
                    <div style={{ fontSize: 10, color: "#4a7c9e", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 10, fontFamily: "monospace" }}>Saved</div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                      {saved.map((w, i) => (
                        <div key={i} style={{ background: "rgba(74,124,158,0.1)", border: "1px solid rgba(74,124,158,0.2)", borderRadius: 7, padding: "4px 10px", fontSize: 12 }}>
                          <span style={{ color: "#7ab4d4" }}>{w.base || w.original}</span>
                          <span style={{ color: "#3a4550", margin: "0 3px" }}>·</span>
                          <span style={{ color: "#8a8480" }}>{w.translations[0]}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                <button onClick={() => { setStage(0); setSession({}); setRevIdx(0); setPopup(null); setPreview(null); setText(""); setTokens([]); setOcrSource(""); setOcrProgress(0); }} style={{ ...Bp, width: "100%", marginBottom: 10 }}>📸 Scan Another Page</button>
                {saved.length > 0 && <button onClick={() => { setSaved([]); setSession({}); setRevIdx(0); setPopup(null); setPreview(null); setText(""); setTokens([]); setOcrSource(""); setOcrProgress(0); setStage(0); }} style={{ ...Bg, width: "100%", fontSize: 12 }}>Start over</button>}
              </div>}
        </div>
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
