"use client";
/**
 * The login and consent pages Neon Auth sends a browser to while an MCP client
 * (claude.ai, Claude Code) asks to connect.
 *
 * Neon Auth runs the authorization server, but these two pages are ours: it
 * redirects here with a signed query (`sig`, `ba_param`, the client's
 * parameters), and the auth client attaches that query to every request made
 * from the page, so whatever the reader does next resumes the authorization.
 *
 * Login has two cases, and the second is the one that matters in practice.
 * Signed out, SignIn works unchanged: a Google round trip or an email sign-in
 * carries the query through and lands on consent or straight back at the
 * client. Signed in already — likely, since our session cookie lives on this
 * domain while the authorize endpoint lives on Neon's and cannot see it — the
 * page offers to continue as that account rather than asking for a sign-in
 * the reader has already done.
 *
 * Both actions answer `{ redirect: true, url }`. The auth client's redirect
 * plugin follows it; following it here as well costs nothing and keeps the
 * page from stalling if that plugin is ever configured away.
 */
import { useEffect, useState } from "react";
import { authClient } from "../lib/authClient.js";
import { reportClientError } from "../lib/report.js";
import { Bp, Bg } from "../lib/styles.js";
import LukuLogo from "./LukuLogo.jsx";
import SignIn from "./SignIn.jsx";

const D = "#0f1117";

/**
 * The authorization request Neon redirected with: the client's own parameters
 * plus `sig`, which Neon appends. Without `sig` there is no authorization to
 * resume — someone opened the page by hand.
 *
 * null until mounted: the page also renders on the server, which has no URL to
 * read, and answering "not signed" there would hydrate into a different page.
 */
function useOAuthQuery() {
  const [query, setQuery] = useState(null);
  useEffect(() => { setQuery(new URLSearchParams(window.location.search)); }, []);
  return query;
}

/** Throws rather than doing nothing on a reply with nowhere to go, so the
 *  caller's catch re-enables the buttons instead of leaving them dead. */
function follow(result) {
  if (result?.error) throw result.error;
  const url = result?.data?.url ?? result?.data?.redirect_uri;
  if (!url) throw new Error("OAuth reply carried no redirect");
  window.location.href = url;
}

/** The host a URL names, or null for anything that is not one. */
function hostOf(value) {
  try { return new URL(value).host; } catch { return null; }
}

function Frame({ children }) {
  return (
    <div style={{ minHeight: "100vh", background: D, color: "#e8e0d5", fontFamily: "Georgia,serif", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div style={{ maxWidth: 400, width: "100%", textAlign: "center" }}>
        <LukuLogo size={48} style={{ display: "block", margin: "0 auto 20px" }} />
        {children}
      </div>
    </div>
  );
}

const text = { color: "#9a928a", fontSize: 14, lineHeight: 1.7, marginBottom: 20 };
const errStyle = { marginTop: 12, padding: "10px 14px", background: "rgba(180,80,80,0.1)", border: "1px solid rgba(180,80,80,0.3)", borderRadius: 10, fontSize: 12, color: "#c48a8a" };

function Loading() {
  return <Frame><div style={{ color: "#4a7c9e", fontSize: 14 }}>Loading…</div></Frame>;
}

function NothingToResume() {
  return (
    <Frame>
      <p style={text}>This page is where an app asking to connect to your Luku cards sends you. Start from that app — Claude&apos;s connector settings, for example — and it will bring you back here.</p>
      <a href="/" style={{ ...Bg, display: "inline-block", textDecoration: "none" }}>Go to Luku</a>
    </Frame>
  );
}

export function OAuthLogin() {
  const query = useOAuthQuery();
  const session = authClient.useSession();
  const user = session.data?.user ?? null;
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  if (query === null || session.isPending) return <Loading />;
  if (!query.has("sig")) return <NothingToResume />;
  if (!user) return <SignIn intro="Sign in to let the app that sent you here read and refine your Luku cards." />;

  // A client asking for a fresh sign-in (prompt=login, or a max_age the
  // current session may not meet) is not answered by the existing session:
  // continuing with it would send the reader straight back here. Signing in
  // again is what satisfies it, and SignIn works while signed in.
  const prompts = (query.get("prompt") ?? "").split(" ");
  if (prompts.includes("login") || query.has("max_age")) {
    return <SignIn intro="The app that sent you here asks you to sign in again before it connects to your Luku cards." />;
  }

  const resume = async () => {
    setErr(""); setBusy(true);
    try {
      follow(await authClient.oauth2.continue({ selected: true }));
    } catch (e) {
      reportClientError("[oauth continue]", e);
      setErr("Could not continue. Start the connection again from the app that sent you here.");
      setBusy(false);
    }
  };

  const switchAccount = async () => {
    setErr("");
    try {
      const result = await authClient.signOut();
      if (result?.error) throw result.error;
    } catch (e) {
      reportClientError("[oauth sign-out]", e);
      setErr("Could not sign out. Start the connection again from the app that sent you here.");
    }
  };

  return (
    <Frame>
      <p style={text}>Signed in as <strong style={{ color: "#e8e0d5" }}>{user.email || user.name}</strong>.</p>
      <button onClick={resume} disabled={busy} style={{ ...Bp, width: "100%", marginBottom: 10, opacity: busy ? 0.6 : 1 }}>
        {busy ? "Continuing…" : "Continue"}
      </button>
      {/* Signing out keeps the signed query in the URL, so SignIn renders next
          and the authorization resumes under the other account. */}
      <button onClick={switchAccount} disabled={busy} style={{ ...Bg, width: "100%", fontSize: 13 }}>
        Use a different account
      </button>
      {err && <div role="alert" style={errStyle}>{err}</div>}
    </Frame>
  );
}

export function OAuthConsent() {
  const query = useOAuthQuery();
  const session = authClient.useSession();
  const user = session.data?.user ?? null;
  const [clientName, setClientName] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  // Read in an effect: the page also renders on the server, where there is no
  // window. A name that fails to load is not worth blocking on — the prompt
  // falls back to "An app", and the decision is the reader's either way.
  useEffect(() => {
    const clientId = new URLSearchParams(window.location.search).get("client_id");
    if (!clientId) return;
    let live = true;
    authClient.oauth2.publicClient({ query: { client_id: clientId } })
      .then(({ data }) => { if (live && data?.client_name) setClientName(data.client_name); })
      .catch((e) => reportClientError("[oauth publicClient]", e));
    return () => { live = false; };
  }, []);

  if (query === null || session.isPending) return <Loading />;
  if (!query.has("sig")) return <NothingToResume />;
  if (!user) return <SignIn intro="Sign in to let the app that sent you here read and refine your Luku cards." />;

  // The name is whatever the client says about itself — anyone can register
  // one called "Claude". The redirect URI is the part that cannot lie: it is
  // signed into the query and it is where the code goes. Its host is shown
  // beside the name, so a reader can see who would actually receive access.
  const returnHost = hostOf(query.get("redirect_uri"));

  const answer = async (accept) => {
    setErr(""); setBusy(true);
    try {
      follow(await authClient.oauth2.consent({ accept }));
    } catch (e) {
      reportClientError("[oauth consent]", e);
      setErr("Could not send your answer. Start the connection again from the app that sent you here.");
      setBusy(false);
    }
  };

  return (
    <Frame>
      <p style={{ ...text, color: "#e8e0d5", fontSize: 16 }}>
        <strong>{clientName ?? "An app"}</strong> wants to connect to your Luku cards
      </p>
      {returnHost && <p style={{ ...text, marginTop: -12, fontSize: 12 }}>Allowing sends you back to {returnHost}</p>}
      <p style={text}>
        It will be able to read your cards and their review schedule, and change a
        card&apos;s translations, part of speech and example sentence. It cannot
        reschedule, rename or delete a card. Signed in as {user.email || user.name}.
      </p>
      <button onClick={() => answer(true)} disabled={busy} style={{ ...Bp, width: "100%", marginBottom: 10, opacity: busy ? 0.6 : 1 }}>
        Allow
      </button>
      <button onClick={() => answer(false)} disabled={busy} style={{ ...Bg, width: "100%" }}>
        Deny
      </button>
      {err && <div role="alert" style={errStyle}>{err}</div>}
    </Frame>
  );
}
