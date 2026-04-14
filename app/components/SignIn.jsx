"use client";
import { useState } from "react";
import { authClient } from "../lib/authClient";

const D = "#0f1117";

export default function SignIn() {
  const [loading, setLoading] = useState(null);
  const [err, setErr] = useState("");
  const [mode, setMode] = useState("main"); // "main" | "sign-in" | "sign-up"
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");

  const Bp2 = { padding: "13px 18px", borderRadius: 12, fontSize: 14, cursor: "pointer", border: "none", fontFamily: "Georgia,serif", background: "linear-gradient(135deg,#4a7c9e,#2d5a7a)", color: "#fff" };
  const Bg2 = { ...Bp2, background: "transparent", border: "1px solid rgba(255,255,255,0.12)", color: "#6b645e" };
  const inp = { width: "100%", padding: "12px 14px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.04)", color: "#e8e0d5", fontSize: 14, fontFamily: "Georgia,serif", boxSizing: "border-box", outline: "none", marginBottom: 10 };

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
      <div style={{ width: 48, height: 48, borderRadius: "50%", background: "linear-gradient(135deg,#4a7c9e,#2d5a7a)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, margin: "0 auto 20px" }}>🇫🇮</div>
      <div style={{ fontSize: 22, fontWeight: 600, marginBottom: 8 }}>Luku</div>
      <div style={{ fontSize: 11, color: "#555", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 24 }}>AI Finnish Reader</div>
    </>
  );

  const errBox = err && <div style={{ marginTop: 12, padding: "10px 14px", background: "rgba(180,80,80,0.1)", border: "1px solid rgba(180,80,80,0.3)", borderRadius: 10, fontSize: 12, color: "#c48a8a" }}>{err}</div>;

  return (
    <div style={{ minHeight: "100vh", background: D, color: "#e8e0d5", fontFamily: "Georgia,serif", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div style={{ maxWidth: 400, width: "100%", textAlign: "center" }}>
        {logo}

        {mode === "main" && <>
          <p style={{ color: "#6b645e", fontSize: 13, lineHeight: 1.7, marginBottom: 24 }}>Sign in to save your vocabulary and review with spaced repetition across devices.</p>
          <button onClick={() => signInSocial("google")} disabled={!!loading} style={{ ...Bp2, width: "100%", marginBottom: 10, opacity: loading ? 0.6 : 1 }}>
            {loading === "google" ? "Redirecting…" : "Continue with Google"}
          </button>
          <button onClick={() => signInSocial("github")} disabled={!!loading} style={{ ...Bg2, width: "100%", marginBottom: 10, opacity: loading ? 0.6 : 1 }}>
            {loading === "github" ? "Redirecting…" : "Continue with GitHub"}
          </button>
          <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "16px 0" }}>
            <div style={{ flex: 1, height: 1, background: "rgba(255,255,255,0.08)" }} />
            <span style={{ fontSize: 11, color: "#3a4550" }}>or</span>
            <div style={{ flex: 1, height: 1, background: "rgba(255,255,255,0.08)" }} />
          </div>
          <button onClick={() => { setErr(""); setMode("sign-in"); }} style={{ ...Bg2, width: "100%", marginBottom: 8 }}>Sign in with email</button>
          <button onClick={() => { setErr(""); setMode("sign-up"); }} style={{ ...Bg2, width: "100%", fontSize: 13 }}>Create account</button>
          {errBox}
        </>}

        {mode === "sign-in" && <>
          <input style={inp} type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
          <input style={inp} type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password"
            onKeyDown={(e) => e.key === "Enter" && signInEmail()} />
          <button onClick={signInEmail} disabled={!!loading || !email || !password} style={{ ...Bp2, width: "100%", marginBottom: 10, opacity: (loading || !email || !password) ? 0.5 : 1 }}>
            {loading === "email" ? "Signing in…" : "Sign in"}
          </button>
          <button onClick={() => { setErr(""); setMode("main"); }} style={{ ...Bg2, width: "100%", fontSize: 13 }}>← Back</button>
          {errBox}
        </>}

        {mode === "sign-up" && <>
          <input style={inp} type="text" placeholder="Name (optional)" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
          <input style={inp} type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
          <input style={inp} type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password"
            onKeyDown={(e) => e.key === "Enter" && signUpEmail()} />
          <button onClick={signUpEmail} disabled={!!loading || !email || !password} style={{ ...Bp2, width: "100%", marginBottom: 10, opacity: (loading || !email || !password) ? 0.5 : 1 }}>
            {loading === "email" ? "Creating account…" : "Create account"}
          </button>
          <button onClick={() => { setErr(""); setMode("main"); }} style={{ ...Bg2, width: "100%", fontSize: 13 }}>← Back</button>
          {errBox}
        </>}
      </div>
    </div>
  );
}
