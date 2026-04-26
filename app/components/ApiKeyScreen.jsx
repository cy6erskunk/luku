"use client";
import { useState } from "react";

const D = "#0f1117";
const Bp = { padding: "13px 18px", borderRadius: 12, fontSize: 14, cursor: "pointer", border: "none", fontFamily: "Georgia,serif", background: "linear-gradient(135deg,#4a7c9e,#2d5a7a)", color: "#fff" };
const Bg = { ...Bp, background: "transparent", border: "1px solid rgba(255,255,255,0.12)", color: "#6b645e" };

export default function ApiKeyScreen({ onSave, onSkip, stage = 0 }) {
  const [keyInput, setKeyInput] = useState("");
  const isValid = keyInput.startsWith("sk-");

  return (
    <div style={{ minHeight: "100vh", background: D, color: "#e8e0d5", fontFamily: "Georgia,serif", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div style={{ maxWidth: 400, width: "100%" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 32 }}>
          <svg width="36" height="36" viewBox="0 0 32 32" aria-label="Luku" role="img">
            <defs>
              <linearGradient id="lukuApiKeyGrad" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="#4a7c9e" />
                <stop offset="100%" stopColor="#2d5a7a" />
              </linearGradient>
            </defs>
            <circle cx="16" cy="16" r="16" fill="url(#lukuApiKeyGrad)" />
            <path d="M11 8 L11 22 L21 22" fill="none" stroke="#e8e0d5" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
            <line x1="14.5" y1="12" x2="22" y2="12" stroke="#e8e0d5" strokeWidth="1.6" strokeLinecap="round" opacity="0.55" />
            <line x1="14.5" y1="16" x2="20" y2="16" stroke="#e8e0d5" strokeWidth="1.6" strokeLinecap="round" opacity="0.4" />
          </svg>
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
          aria-label="Anthropic API key"
          placeholder="sk-ant-..."
          value={keyInput}
          onChange={(e) => setKeyInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && isValid && onSave(keyInput)}
          style={{ width: "100%", padding: "12px 14px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.04)", color: "#e8e0d5", fontSize: 14, fontFamily: "monospace", boxSizing: "border-box", marginBottom: 12, outline: "none" }}
        />
        <button
          onClick={() => isValid && onSave(keyInput)}
          disabled={!isValid}
          style={{ ...Bp, width: "100%", opacity: isValid ? 1 : 0.4 }}
        >
          {stage > 0 ? "Save key & continue →" : "Start reading →"}
        </button>
        <button onClick={onSkip} style={{ ...Bg, width: "100%", marginTop: 8 }}>
          Skip — use local OCR only
        </button>
        <p style={{ fontSize: 11, color: "#3a4550", marginTop: 16, textAlign: "center" }}>
          Key is stored in your browser only. Each request passes it through this app&apos;s server to reach Anthropic — it is never stored server-side.
        </p>
      </div>
    </div>
  );
}
