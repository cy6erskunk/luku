"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Bp, Bg } from "../lib/styles.js";

const POLL_MS = 2000;
const POLL_TIMEOUT_MS = 60000;

export default function TelegramConnect({ onClose }) {
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [pendingCode, setPendingCode] = useState(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);
  const pollRef = useRef(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/telegram/link");
    if (!res.ok) throw new Error(`Failed to load status (${res.status})`);
    return res.json();
  }, []);

  useEffect(() => {
    let cancelled = false;
    load()
      .then((s) => { if (!cancelled) setStatus(s); })
      .catch((e) => { if (!cancelled) setErr(e.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [load]);

  // While a code is outstanding, watch for the bot to claim it so the panel
  // flips to connected without the user having to refresh.
  useEffect(() => {
    if (!pendingCode) return undefined;

    const startedAt = Date.now();
    pollRef.current = setInterval(async () => {
      if (Date.now() - startedAt > POLL_TIMEOUT_MS) {
        clearInterval(pollRef.current);
        setPendingCode(null);
        return;
      }
      try {
        const s = await load();
        if (s.linked) {
          clearInterval(pollRef.current);
          setStatus(s);
          setPendingCode(null);
        }
      } catch {
        // Transient failure; the next tick will try again.
      }
    }, POLL_MS);

    return () => clearInterval(pollRef.current);
  }, [pendingCode, load]);

  const handleConnect = async () => {
    setErr("");
    setBusy(true);
    try {
      const res = await fetch("/api/telegram/link", { method: "POST" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || `Failed to start connection (${res.status})`);
      setPendingCode(json.code);
      window.open(json.url, "_blank", "noopener");
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };

  const handleDisconnect = async () => {
    setErr("");
    setBusy(true);
    try {
      const res = await fetch("/api/telegram/link", { method: "DELETE" });
      if (!res.ok) throw new Error(`Failed to disconnect (${res.status})`);
      setStatus({ linked: false });
      setConfirmDisconnect(false);
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      data-testid="telegram-backdrop"
      onClick={onClose}
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 300, display: "flex", alignItems: "center", justifyContent: "center" }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="telegram-heading"
        onClick={(e) => e.stopPropagation()}
        style={{ background: "#181d2a", borderRadius: 18, width: "100%", maxWidth: 440, margin: 16, overflow: "hidden" }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "18px 20px 14px", borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
          <div id="telegram-heading" style={{ fontSize: 14, fontWeight: 600 }}>Telegram</div>
          <button onClick={onClose} aria-label="Close" style={{ background: "none", border: "none", color: "#555", fontSize: 18, cursor: "pointer", lineHeight: 1, padding: "0 4px" }}>✕</button>
        </div>

        <div style={{ padding: 20 }}>
          {loading && <div style={{ color: "#555", fontSize: 13 }}>Loading…</div>}

          {!loading && status?.linked && (
            <>
              <div style={{ fontSize: 13, color: "#c8c0b5", lineHeight: 1.6 }}>
                Connected{status.username ? ` as @${status.username}` : ""}.
              </div>
              <div style={{ fontSize: 12, color: "#6b645e", marginTop: 8, lineHeight: 1.6 }}>
                {status.remindersEnabled
                  ? `Daily reminder at ${String(status.reminderHour).padStart(2, "0")}:00 (${status.timezone}).`
                  : "Daily reminders are paused."}
                {" "}Send /review in the chat to start a session.
              </div>
              {confirmDisconnect ? (
                <div style={{ display: "flex", gap: 8, marginTop: 18 }}>
                  <button onClick={handleDisconnect} disabled={busy} style={{ ...Bp, flex: 1, background: "linear-gradient(135deg,#9e5a5a,#7a2d2d)", opacity: busy ? 0.5 : 1 }}>
                    Really disconnect
                  </button>
                  <button onClick={() => setConfirmDisconnect(false)} disabled={busy} style={{ ...Bg, flex: 1 }}>Cancel</button>
                </div>
              ) : (
                <button onClick={() => setConfirmDisconnect(true)} disabled={busy} style={{ ...Bg, width: "100%", marginTop: 18 }}>
                  Disconnect
                </button>
              )}
            </>
          )}

          {!loading && !status?.linked && (
            <>
              <div style={{ fontSize: 13, color: "#c8c0b5", lineHeight: 1.6 }}>
                Review your words from Telegram and get a daily reminder when something is due.
              </div>
              {pendingCode ? (
                <>
                  <div style={{ fontSize: 12, color: "#6b645e", marginTop: 14, lineHeight: 1.6 }}>
                    Waiting for you to tap <strong style={{ color: "#c8c0b5" }}>START</strong> in Telegram…
                  </div>
                  <div style={{ fontSize: 11, color: "#555", marginTop: 14, lineHeight: 1.6 }}>
                    Nothing happened? Send this to the bot instead:
                  </div>
                  <code
                    style={{ display: "block", marginTop: 6, padding: "10px 12px", background: "rgba(0,0,0,0.3)", borderRadius: 8, fontSize: 11, color: "#7ab4d4", wordBreak: "break-all", userSelect: "all" }}
                  >
                    /link {pendingCode}
                  </code>
                  <div style={{ fontSize: 11, color: "#555", marginTop: 10 }}>This code expires in 10 minutes.</div>
                </>
              ) : (
                <button onClick={handleConnect} disabled={busy} style={{ ...Bp, width: "100%", marginTop: 18, opacity: busy ? 0.5 : 1 }}>
                  {busy ? "Opening Telegram…" : "Connect Telegram"}
                </button>
              )}
            </>
          )}

          {err && <div style={{ color: "#9e5a5a", fontSize: 12, marginTop: 14 }}>{err}</div>}
        </div>
      </div>
    </div>
  );
}
