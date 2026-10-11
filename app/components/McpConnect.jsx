"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Bp, Bg } from "../lib/styles.js";
import { useDialog } from "../hooks/useDialog.js";

/**
 * The panel that connects an MCP client to this account.
 *
 * It mints a bearer token for /api/mcp. The plaintext exists only in the mint
 * response — the server stores a hash — so it is shown once, here, and the
 * panel says so rather than letting the reader assume they can come back for
 * it.
 *
 * Failures are reported inside the dialog: the page's banner is a sibling of
 * this overlay, so it would sit outside the focus trap and inside the subtree
 * `aria-modal` declares inert. The one failure that cannot be reported here is
 * a mint whose reply arrives after the panel is gone, because then a token
 * exists that the reader has never seen and cannot use — `onLost` hands that
 * to something that outlives the panel.
 */
export default function McpConnect({ endpoint, onClose, onLost }) {
  const [tokens, setTokens] = useState(null);
  const [minted, setMinted] = useState(null);
  const [label, setLabel] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const mountedRef = useRef(true);
  const panelRef = useDialog(onClose);

  // Set on setup as well as cleared on cleanup: the App Router runs every
  // effect setup -> cleanup -> setup in development, and a cleanup-only
  // version would leave this false for the rest of the component's life —
  // every mint would then report itself lost. Same shape as ExamplePicker.
  useEffect(() => {
    const mounted = mountedRef;
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  const load = useCallback(async () => {
    const res = await fetch("/api/mcp/tokens");
    if (!res.ok) throw new Error(`Failed to load connections (${res.status})`);
    return (await res.json()).tokens ?? [];
  }, []);

  useEffect(() => {
    let cancelled = false;
    load()
      .then((list) => { if (!cancelled) setTokens(list); })
      // An empty list and a failed load must not look alike: one offers
      // Connect, the other has no idea what is already connected.
      .catch((e) => { if (!cancelled) { setTokens([]); setErr(e.message); } })
    ;
    return () => { cancelled = true; };
  }, [load]);

  const handleMint = async () => {
    setErr("");
    setCopied(false);
    setBusy(true);
    try {
      const res = await fetch("/api/mcp/tokens", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ label: label.trim() || null }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || `Failed to create a token (${res.status})`);
      // A token minted but never displayed is a row the reader cannot use and
      // cannot find, so the loss is worth telling even though the panel is gone.
      if (!mountedRef.current) { onLost?.(); return; }
      setMinted(json.token);
      setLabel("");
      setTokens(await load().catch(() => tokens ?? []));
    } catch (e) {
      // No onLost here: a refused mint stored nothing, so there is no orphaned
      // token to go and revoke. Telling the reader to hunt for one would send
      // them after a row that does not exist.
      if (!mountedRef.current) return;
      setErr(e.message);
    } finally {
      if (mountedRef.current) setBusy(false);
    }
  };

  const handleRevoke = async (id) => {
    setErr("");
    setBusy(true);
    try {
      const res = await fetch(`/api/mcp/tokens?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      if (!res.ok) throw new Error(`Failed to revoke that token (${res.status})`);
      if (!mountedRef.current) return;
      setTokens((prev) => (prev ?? []).filter((t) => t.id !== id));
    } catch (e) {
      if (mountedRef.current) setErr(e.message);
    } finally {
      if (mountedRef.current) setBusy(false);
    }
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(minted);
      setCopied(true);
    } catch {
      // Clipboard access can be refused outright. The token is on screen and
      // selectable, so this is not worth an error line.
      setCopied(false);
    }
  };

  return (
    <div
      data-testid="mcp-backdrop"
      onClick={onClose}
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 300, display: "flex", alignItems: "center", justifyContent: "center" }}
    >
      <div
        role="dialog"
        aria-modal="true"
        ref={panelRef}
        tabIndex={-1}
        aria-labelledby="mcp-heading"
        onClick={(e) => e.stopPropagation()}
        style={{ background: "#181d2a", borderRadius: 18, width: "100%", maxWidth: 460, margin: 16, maxHeight: "90vh", overflowY: "auto" }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "18px 20px 14px", borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
          <div id="mcp-heading" style={{ fontSize: 14, fontWeight: 600 }}>Refine with Claude</div>
          <button onClick={onClose} aria-label="Close" style={{ background: "none", border: "none", color: "#555", fontSize: 18, cursor: "pointer", lineHeight: 1, padding: "0 4px" }}>✕</button>
        </div>

        <div style={{ padding: 20 }}>
          {err && (
            <div role="alert" style={{ padding: "10px 12px", marginBottom: 14, fontSize: 12, color: "#c48a8a", background: "rgba(180,80,80,0.1)", border: "1px solid rgba(180,80,80,0.25)", borderRadius: 8 }}>
              ⚠ {err}
            </div>
          )}

          <div style={{ fontSize: 13, color: "#c8c0b5", lineHeight: 1.6 }}>
            Connect Claude Desktop or Claude Code to this account and it can read your
            vocabulary and fix translations, parts of speech and example sentences.
          </div>
          <div style={{ fontSize: 12, color: "#6b645e", marginTop: 8, lineHeight: 1.6 }}>
            It cannot change your review schedule, so nothing you do here costs you progress.
          </div>

          <div style={{ marginTop: 16, fontSize: 11, color: "#6b645e", fontFamily: "monospace", wordBreak: "break-all" }}>
            {endpoint}
          </div>

          {minted ? (
            <div style={{ marginTop: 18, padding: 14, background: "rgba(74,124,158,0.08)", border: "1px solid rgba(74,124,158,0.3)", borderRadius: 10 }}>
              <div style={{ fontSize: 12, color: "#c8c0b5", marginBottom: 8 }}>
                Your token — <strong>copy it now</strong>. It is not shown again.
              </div>
              <code style={{ display: "block", fontSize: 11, color: "#e8e0d5", wordBreak: "break-all", lineHeight: 1.5 }}>
                {minted}
              </code>
              <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                <button onClick={handleCopy} style={{ ...Bp, flex: 1 }}>{copied ? "✓ Copied" : "Copy"}</button>
                <button onClick={() => setMinted(null)} style={{ ...Bg, flex: 1 }}>Done</button>
              </div>
              <div style={{ fontSize: 11, color: "#6b645e", marginTop: 12, lineHeight: 1.6 }}>
                Then run:
                <code style={{ display: "block", marginTop: 6, color: "#9a9288", wordBreak: "break-all" }}>
                  claude mcp add --transport http luku {endpoint} --header &quot;Authorization: Bearer &lt;token&gt;&quot;
                </code>
              </div>
            </div>
          ) : (
            <div style={{ marginTop: 18 }}>
              <label htmlFor="mcp-label" style={{ display: "block", fontSize: 12, color: "#6b645e", marginBottom: 6 }}>
                What is connecting? (optional)
              </label>
              <input
                id="mcp-label"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                maxLength={60}
                placeholder="Claude Desktop on my laptop"
                style={{ width: "100%", padding: "9px 11px", borderRadius: 8, background: "#0f1117", border: "1px solid rgba(255,255,255,0.12)", color: "#e8e0d5", fontSize: 13, fontFamily: "Georgia,serif", boxSizing: "border-box" }}
              />
              <button onClick={handleMint} disabled={busy} style={{ ...Bp, width: "100%", marginTop: 12, opacity: busy ? 0.5 : 1 }}>
                Create a token
              </button>
            </div>
          )}

          {tokens === null && <div style={{ color: "#555", fontSize: 13, marginTop: 18 }}>Loading…</div>}

          {tokens !== null && tokens.length > 0 && (
            <div style={{ marginTop: 22, borderTop: "1px solid rgba(255,255,255,0.07)", paddingTop: 14 }}>
              <div style={{ fontSize: 12, color: "#6b645e", marginBottom: 10 }}>Connected clients</div>
              {tokens.map((t) => (
                <div key={t.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 0" }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, color: "#c8c0b5" }}>{t.label || "Unnamed client"}</div>
                    <div style={{ fontSize: 11, color: "#6b645e", marginTop: 2 }}>
                      {t.last_used_at ? `Last used ${new Date(t.last_used_at).toLocaleDateString()}` : "Never used"}
                    </div>
                  </div>
                  <button
                    onClick={() => handleRevoke(t.id)}
                    disabled={busy}
                    aria-label={`Revoke ${t.label || "unnamed client"}`}
                    style={{ ...Bg, padding: "5px 11px", fontSize: 12, opacity: busy ? 0.5 : 1 }}
                  >
                    Revoke
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
