"use client";
import { useState } from "react";
import * as stylex from "@stylexjs/stylex";
import LukuLogo from "./LukuLogo.jsx";
import { buttonStyles, shared } from "../lib/styles.js";

const s = stylex.create({
  logoRow: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    marginBottom: 32,
  },
  logoTitle: {
    fontSize: 18,
    fontWeight: 600,
  },
  logoSubSize: {
    fontSize: 10,
  },
  link: {
    color: "#4a7c9e",
  },
  inputMono: {
    fontFamily: "monospace",
    marginBottom: 12,
  },
  skipBtn: {
    marginTop: 8,
  },
  footerNote: {
    fontSize: 11,
    color: "#3a4550",
    marginTop: 16,
    textAlign: "center",
  },
});

export default function ApiKeyScreen({ onSave, onSkip, stage = 0 }) {
  const [keyInput, setKeyInput] = useState("");
  const isValid = keyInput.startsWith("sk-");

  return (
    <div {...stylex.props(shared.screenContainer)}>
      <div {...stylex.props(shared.formContainer)}>
        <div {...stylex.props(s.logoRow)}>
          <LukuLogo size={36} />
          <div>
            <div {...stylex.props(s.logoTitle)}>Luku</div>
            <div {...stylex.props(shared.logoSub, s.logoSubSize)}>AI Finnish Reader</div>
          </div>
        </div>
        <p {...stylex.props(shared.desc)}>
          Luku reads Finnish text from photos and helps you learn vocabulary. An API key from{" "}
          <a href="https://console.anthropic.com" target="_blank" rel="noreferrer" {...stylex.props(s.link)}>console.anthropic.com</a>{" "}
          enables translations and AI-powered OCR, or skip to scan locally for free.
        </p>
        <input
          type="password"
          aria-label="Anthropic API key"
          placeholder="sk-ant-..."
          value={keyInput}
          onChange={(e) => setKeyInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && isValid && onSave(keyInput)}
          {...stylex.props(shared.input, s.inputMono)}
        />
        <button
          onClick={() => isValid && onSave(keyInput)}
          disabled={!isValid}
          {...stylex.props(buttonStyles.primary, shared.fullWidth)}
          style={{ opacity: isValid ? 1 : 0.4 }}
        >
          {stage > 0 ? "Save key & continue →" : "Start reading →"}
        </button>
        <button onClick={onSkip} {...stylex.props(buttonStyles.ghost, shared.fullWidth, s.skipBtn)}>
          Skip — use local OCR only
        </button>
        <p {...stylex.props(s.footerNote)}>
          Key is stored in your browser only. Each request passes it through this app&apos;s server to reach Anthropic — it is never stored server-side.
        </p>
      </div>
    </div>
  );
}
