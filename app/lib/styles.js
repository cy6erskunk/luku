import * as stylex from "@stylexjs/stylex";

const spin = stylex.keyframes({
  to: { transform: "rotate(360deg)" },
});

export const buttonStyles = stylex.create({
  primary: {
    padding: "13px 18px",
    borderRadius: 12,
    fontSize: 14,
    cursor: "pointer",
    border: "none",
    fontFamily: "Georgia,serif",
    background: "linear-gradient(135deg,#4a7c9e,#2d5a7a)",
    color: "#fff",
  },
  ghost: {
    padding: "13px 18px",
    borderRadius: 12,
    fontSize: 14,
    cursor: "pointer",
    fontFamily: "Georgia,serif",
    background: "transparent",
    border: "1px solid rgba(255,255,255,0.12)",
    color: "#6b645e",
  },
});

export const shared = stylex.create({
  spinner: {
    animationName: spin,
    animationDuration: "1s",
    animationTimingFunction: "linear",
    animationIterationCount: "infinite",
    display: "inline-block",
  },
  stepLabel: {
    fontSize: 10,
    letterSpacing: "0.15em",
    textTransform: "uppercase",
    color: "#4a7c9e",
    fontFamily: "monospace",
  },
  smallLabel: {
    fontSize: 9,
    letterSpacing: "0.12em",
    textTransform: "uppercase",
    color: "#4a7c9e",
    fontFamily: "monospace",
  },
  errorBox: {
    background: "rgba(180,80,80,0.1)",
    border: "1px solid rgba(180,80,80,0.3)",
    borderRadius: 10,
    padding: "11px 14px",
    fontSize: 12,
    color: "#c48a8a",
  },
  fullWidth: {
    width: "100%",
  },
  flex1: {
    flex: 1,
  },
  screenContainer: {
    minHeight: "100vh",
    background: "#0f1117",
    color: "#e8e0d5",
    fontFamily: "Georgia,serif",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  formContainer: {
    maxWidth: 400,
    width: "100%",
  },
  desc: {
    color: "#6b645e",
    fontSize: 13,
    lineHeight: 1.7,
    marginBottom: 24,
  },
  input: {
    width: "100%",
    padding: "12px 14px",
    borderRadius: 10,
    border: "1px solid rgba(255,255,255,0.12)",
    background: "rgba(255,255,255,0.04)",
    color: "#e8e0d5",
    fontSize: 14,
    boxSizing: "border-box",
    outline: "none",
  },
  logoSub: {
    color: "#555",
    letterSpacing: "0.1em",
    textTransform: "uppercase",
  },
  surface: {
    background: "rgba(255,255,255,0.02)",
    border: "1px solid rgba(255,255,255,0.06)",
    borderRadius: 9,
  },
  progressTrack: {
    height: 3,
    background: "rgba(255,255,255,0.06)",
    borderRadius: 2,
    overflow: "hidden",
  },
  badge: {
    display: "inline-flex",
    alignItems: "center",
    gap: 4,
    background: "rgba(74,124,158,0.12)",
    borderRadius: 10,
    padding: "2px 7px",
    fontFamily: "monospace",
  },
});
