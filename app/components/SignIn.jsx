"use client";
import { useState } from "react";
import * as stylex from "@stylexjs/stylex";
import { authClient } from "../lib/authClient";
import LukuLogo from "./LukuLogo.jsx";
import { buttonStyles, shared } from "../lib/styles.js";

const s = stylex.create({
  center: {
    textAlign: "center",
  },
  logoTitle: {
    fontSize: 22,
    fontWeight: 600,
    marginBottom: 8,
  },
  logoSubSize: {
    fontSize: 11,
    marginBottom: 24,
  },
  inputFont: {
    fontFamily: "Georgia,serif",
    marginBottom: 10,
  },
  primaryBtn: {
    marginBottom: 10,
  },
  backBtn: {
    fontSize: 13,
  },
  dividerRow: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    margin: "16px 0",
  },
  dividerLine: {
    flex: 1,
    height: 1,
    background: "rgba(255,255,255,0.08)",
  },
  dividerText: {
    fontSize: 11,
    color: "#3a4550",
  },
  emailBtn: {
    marginBottom: 8,
  },
  errMargin: {
    marginTop: 12,
  },
});

export default function SignIn() {
  const [loading, setLoading] = useState(null);
  const [err, setErr] = useState("");
  const [mode, setMode] = useState("main");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");

  const signInSocial = async (provider) => {
    setErr(""); setLoading(provider);
    try {
      const result = await authClient.signIn.social({ provider, callbackURL: "/" });
      if (result?.error) setErr(result.error.message || "Sign-in failed. Check your Neon Auth setup.");
    } catch (e) { setErr(e?.message || "Sign-in failed."); }
    finally { setLoading(null); }
  };

  const signInEmail = async () => {
    setErr(""); setLoading("email");
    try {
      const result = await authClient.signIn.email({ email, password, callbackURL: "/" });
      if (result?.error) setErr(result.error.message || "Sign-in failed.");
    } catch (e) { setErr(e?.message || "Sign-in failed."); }
    finally { setLoading(null); }
  };

  const signUpEmail = async () => {
    setErr(""); setLoading("email");
    try {
      const result = await authClient.signUp.email({ email, password, name: name || email.split("@")[0], callbackURL: "/" });
      if (result?.error) setErr(result.error.message || "Sign-up failed.");
    } catch (e) { setErr(e?.message || "Sign-up failed."); }
    finally { setLoading(null); }
  };

  const logo = (
    <>
      <LukuLogo size={48} style={{ display: "block", margin: "0 auto 20px" }} />
      <div {...stylex.props(s.logoTitle)}>Luku</div>
      <div {...stylex.props(shared.logoSub, s.logoSubSize)}>AI Finnish Reader</div>
    </>
  );

  const errBox = err && <div {...stylex.props(shared.errorBox, s.errMargin)}>{err}</div>;

  return (
    <div {...stylex.props(shared.screenContainer)}>
      <div {...stylex.props(shared.formContainer, s.center)}>
        {logo}

        {mode === "main" && <>
          <p {...stylex.props(shared.desc)}>Sign in to save your vocabulary and review with spaced repetition across devices.</p>
          <button onClick={() => signInSocial("google")} disabled={!!loading} {...stylex.props(buttonStyles.primary, shared.fullWidth, s.primaryBtn)} style={{ opacity: loading ? 0.6 : 1 }}>
            {loading === "google" ? "Redirecting…" : "Continue with Google"}
          </button>
          <button onClick={() => signInSocial("github")} disabled={!!loading} {...stylex.props(buttonStyles.ghost, shared.fullWidth, s.primaryBtn)} style={{ opacity: loading ? 0.6 : 1 }}>
            {loading === "github" ? "Redirecting…" : "Continue with GitHub"}
          </button>
          <div {...stylex.props(s.dividerRow)}>
            <div {...stylex.props(s.dividerLine)} />
            <span {...stylex.props(s.dividerText)}>or</span>
            <div {...stylex.props(s.dividerLine)} />
          </div>
          <button onClick={() => { setErr(""); setMode("sign-in"); }} {...stylex.props(buttonStyles.ghost, shared.fullWidth, s.emailBtn)}>Sign in with email</button>
          <button onClick={() => { setErr(""); setMode("sign-up"); }} {...stylex.props(buttonStyles.ghost, shared.fullWidth, s.backBtn)}>Create account</button>
          {errBox}
        </>}

        {mode === "sign-in" && <>
          <input {...stylex.props(shared.input, s.inputFont)} type="email" aria-label="Email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
          <input {...stylex.props(shared.input, s.inputFont)} type="password" aria-label="Password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password"
            onKeyDown={(e) => e.key === "Enter" && signInEmail()} />
          <button onClick={signInEmail} disabled={!!loading || !email || !password} {...stylex.props(buttonStyles.primary, shared.fullWidth, s.primaryBtn)} style={{ opacity: (loading || !email || !password) ? 0.5 : 1 }}>
            {loading === "email" ? "Signing in…" : "Sign in"}
          </button>
          <button onClick={() => { setErr(""); setMode("main"); }} {...stylex.props(buttonStyles.ghost, shared.fullWidth, s.backBtn)}>← Back</button>
          {errBox}
        </>}

        {mode === "sign-up" && <>
          <input {...stylex.props(shared.input, s.inputFont)} type="text" aria-label="Name" placeholder="Name (optional)" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
          <input {...stylex.props(shared.input, s.inputFont)} type="email" aria-label="Email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
          <input {...stylex.props(shared.input, s.inputFont)} type="password" aria-label="Password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password"
            onKeyDown={(e) => e.key === "Enter" && signUpEmail()} />
          <button onClick={signUpEmail} disabled={!!loading || !email || !password} {...stylex.props(buttonStyles.primary, shared.fullWidth, s.primaryBtn)} style={{ opacity: (loading || !email || !password) ? 0.5 : 1 }}>
            {loading === "email" ? "Creating account…" : "Create account"}
          </button>
          <button onClick={() => { setErr(""); setMode("main"); }} {...stylex.props(buttonStyles.ghost, shared.fullWidth, s.backBtn)}>← Back</button>
          {errBox}
        </>}
      </div>
    </div>
  );
}
