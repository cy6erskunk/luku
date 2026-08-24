"use client";
import { useState, useRef, useEffect } from "react";

const ITEM = {
  display: "flex", alignItems: "center", gap: 10, width: "100%",
  padding: "10px 14px", background: "transparent", border: "none",
  color: "#b9b0a4", fontSize: 13, fontFamily: "Georgia,serif",
  cursor: "pointer", textAlign: "left", whiteSpace: "nowrap",
};

/**
 * Overflow menu for the header's account-level actions. These used to sit in
 * the header as three separate buttons, which pushed it past the width of a
 * phone screen.
 */
export default function HeaderMenu({ onTelegram, onChangeKey, onSignOut }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);
  const btnRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    // mousedown rather than click: the root element closes the translation
    // popup on click, and we want the menu gone before that re-render.
    const onDocDown = (e) => { if (!wrapRef.current?.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === "Escape") { setOpen(false); btnRef.current?.focus(); } };
    document.addEventListener("mousedown", onDocDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const run = (fn) => (e) => { e.stopPropagation(); setOpen(false); fn?.(); };

  return (
    <div ref={wrapRef} style={{ position: "relative" }}>
      <button
        ref={btnRef}
        onClick={(e) => { e.stopPropagation(); setOpen((o) => !o); }}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Menu"
        title="Menu"
        style={{
          display: "flex", alignItems: "center", justifyContent: "center",
          width: 32, height: 32, padding: 0, borderRadius: 9,
          background: open ? "rgba(255,255,255,0.07)" : "transparent",
          border: "1px solid rgba(255,255,255,0.12)",
          color: "#8a8279", fontSize: 15, lineHeight: 1, cursor: "pointer",
          fontFamily: "Georgia,serif",
        }}
      >
        ☰
      </button>
      {open && (
        <div
          role="menu"
          onClick={(e) => e.stopPropagation()}
          style={{
            position: "absolute", top: "calc(100% + 6px)", right: 0, zIndex: 60,
            minWidth: 170, padding: "5px 0", borderRadius: 11,
            background: "#171a22", border: "1px solid rgba(255,255,255,0.1)",
            boxShadow: "0 10px 30px rgba(0,0,0,0.5)",
            animation: "fadeUp 0.12s ease-out",
          }}
        >
          <button role="menuitem" onClick={run(onTelegram)} style={ITEM}>
            <span aria-hidden="true" style={{ width: 14, textAlign: "center", color: "#6a9ebe" }}>✈</span>Telegram
          </button>
          <button role="menuitem" onClick={run(onChangeKey)} style={ITEM}>
            <span aria-hidden="true" style={{ width: 14 }} />API key
          </button>
          <div style={{ height: 1, background: "rgba(255,255,255,0.07)", margin: "5px 0" }} />
          <button role="menuitem" onClick={run(onSignOut)} style={ITEM}>
            <span aria-hidden="true" style={{ width: 14 }} />Sign out
          </button>
        </div>
      )}
    </div>
  );
}
