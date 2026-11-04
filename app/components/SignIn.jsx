"use client";
import { useState } from "react";
import { authClient } from "../lib/authClient";
import LukuLogo from "./LukuLogo.jsx";
import { Bp, Bg } from "../lib/styles.js";
import { reportClientError } from "../lib/report.js";

const D = "#0f1117";

export const AUTH_UNAVAILABLE = "Sign-in is unavailable right now. Please try again later.";

/** What every dead end in the OAuth flow tells the reader to do. */
export const RESTART_CONNECTION = "Start the connection again from the app that sent you here.";

export const OAUTH_QUERY_EXPIRED = `This connection request has expired or is no longer valid. ${RESTART_CONNECTION}`;

// On /oauth/login and /oauth/consent the auth client adds the page's signed
// query to every POST, and the OAuth provider checks its signature and expiry
// (`codeExpiresIn`, ten minutes by default in @better-auth/oauth-provider)
// before it looks at any credentials. Past that, it answers 400
// `invalid_signature` to every attempt, the right password included, so the
// only way forward is a fresh request from the client. The same code covers a
// signature that does not match, which is why the message does not claim
// expiry alone.
function isExpiredOAuthQuery(error) {
  return error?.error === "invalid_signature" || error?.code === "INVALID_SIGNATURE";
}

// A 4xx carries a message meant for the reader ("Invalid email or password").
// A 5xx is the deployment's fault and its message is not: the auth client
// fills a missing one with "HTTP 500", and the proxy's own say things like
// "Could not resolve authentication server hostname". The cause reaches
// Sentry from the server side.
function authErrorMessage(error, fallback) {
  if (error?.status >= 500) return AUTH_UNAVAILABLE;
  if (isExpiredOAuthQuery(error)) return OAUTH_QUERY_EXPIRED;
  return error?.message || fallback;
}

export default function SignIn({ intro = "Sign in to save your vocabulary and review with spaced repetition across devices." }) {
  const [loading, setLoading] = useState(null);
  const [err, setErr] = useState("");
  const [mode, setMode] = useState("main"); // "main" | "sign-in" | "sign-up"
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");

  const inp = { width: "100%", padding: "12px 14px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.04)", color: "#e8e0d5", fontSize: 14, fontFamily: "Georgia,serif", boxSizing: "border-box", outline: "none", marginBottom: 10 };

  const signInSocial = async (provider) => {
    setErr(""); setLoading(provider);
    try {
      const result = await authClient.signIn.social({ provider, callbackURL: "/" });
      if (result?.error) setErr(authErrorMessage(result.error, "Sign-in failed."));
    } catch (e) { reportClientError("[sign-in]", e); setErr(authErrorMessage(e, "Sign-in failed.")); }
    finally { setLoading(null); }
  };

  const signInEmail = async () => {
    setErr(""); setLoading("email");
    try {
      const result = await authClient.signIn.email({ email, password, callbackURL: "/" });
      if (result?.error) setErr(authErrorMessage(result.error, "Sign-in failed."));
    } catch (e) { reportClientError("[sign-in]", e); setErr(authErrorMessage(e, "Sign-in failed.")); }
    finally { setLoading(null); }
  };

  const signUpEmail = async () => {
    setErr(""); setLoading("email");
    try {
      const result = await authClient.signUp.email({ email, password, name: name || email.split("@")[0], callbackURL: "/" });
      if (result?.error) setErr(authErrorMessage(result.error, "Sign-up failed."));
    } catch (e) { reportClientError("[sign-up]", e); setErr(authErrorMessage(e, "Sign-up failed.")); }
    finally { setLoading(null); }
  };

  const logo = (
    <>
      <LukuLogo size={48} style={{ display: "block", margin: "0 auto 20px" }} />
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
          <p style={{ color: "#6b645e", fontSize: 13, lineHeight: 1.7, marginBottom: 24 }}>{intro}</p>
          <button onClick={() => signInSocial("google")} disabled={!!loading} style={{ ...Bp, width: "100%", marginBottom: 10, opacity: loading ? 0.6 : 1 }}>
            {loading === "google" ? "Redirecting…" : "Continue with Google"}
          </button>
          <button onClick={() => signInSocial("github")} disabled={!!loading} style={{ ...Bg, width: "100%", marginBottom: 10, opacity: loading ? 0.6 : 1 }}>
            {loading === "github" ? "Redirecting…" : "Continue with GitHub"}
          </button>
          <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "16px 0" }}>
            <div style={{ flex: 1, height: 1, background: "rgba(255,255,255,0.08)" }} />
            <span style={{ fontSize: 11, color: "#3a4550" }}>or</span>
            <div style={{ flex: 1, height: 1, background: "rgba(255,255,255,0.08)" }} />
          </div>
          <button onClick={() => { setErr(""); setMode("sign-in"); }} style={{ ...Bg, width: "100%", marginBottom: 8 }}>Sign in with email</button>
          <button onClick={() => { setErr(""); setMode("sign-up"); }} style={{ ...Bg, width: "100%", fontSize: 13 }}>Create account</button>
          {errBox}
        </>}

        {mode === "sign-in" && <>
          <input style={inp} type="email" aria-label="Email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
          <input style={inp} type="password" aria-label="Password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password"
            onKeyDown={(e) => e.key === "Enter" && signInEmail()} />
          <button onClick={signInEmail} disabled={!!loading || !email || !password} style={{ ...Bp, width: "100%", marginBottom: 10, opacity: (loading || !email || !password) ? 0.5 : 1 }}>
            {loading === "email" ? "Signing in…" : "Sign in"}
          </button>
          <button onClick={() => { setErr(""); setMode("main"); }} style={{ ...Bg, width: "100%", fontSize: 13 }}>← Back</button>
          {errBox}
        </>}

        {mode === "sign-up" && <>
          <input style={inp} type="text" aria-label="Name" placeholder="Name (optional)" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
          <input style={inp} type="email" aria-label="Email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
          <input style={inp} type="password" aria-label="Password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password"
            onKeyDown={(e) => e.key === "Enter" && signUpEmail()} />
          <button onClick={signUpEmail} disabled={!!loading || !email || !password} style={{ ...Bp, width: "100%", marginBottom: 10, opacity: (loading || !email || !password) ? 0.5 : 1 }}>
            {loading === "email" ? "Creating account…" : "Create account"}
          </button>
          <button onClick={() => { setErr(""); setMode("main"); }} style={{ ...Bg, width: "100%", fontSize: 13 }}>← Back</button>
          {errBox}
        </>}
      </div>
    </div>
  );
}
