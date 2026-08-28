"use client";
import { Fragment, useState, useRef, useEffect, useId } from "react";

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
 *
 * The ARIA menu-button pattern is a keyboard contract as much as a set of
 * roles: the menu is one tab stop, and arrows move between the items inside
 * it. Opening moves focus into the menu, so the items carry `tabIndex={-1}`
 * and focus is placed by hand instead of by the browser's tab order.
 */
export default function HeaderMenu({ onTelegram, onChangeKey, onSignOut }) {
  const [open, setOpen] = useState(false);
  // Which item focus sits on. Also the item that opening the menu lands on:
  // the toggle sets it before the menu renders (0 for a click or ArrowDown,
  // the last item for ArrowUp, as the pattern expects).
  const [active, setActive] = useState(0);
  const wrapRef = useRef(null);
  const btnRef = useRef(null);
  const itemsRef = useRef([]);
  const restoreRef = useRef(0);
  const menuId = useId();
  const btnId = useId();

  const items = [
    { label: "Telegram", icon: "✈", iconColor: "#6a9ebe", fn: onTelegram },
    { label: "API key", fn: onChangeKey },
    { label: "Sign out", fn: onSignOut, separated: true },
  ];
  const last = items.length - 1;

  useEffect(() => {
    if (!open) return;
    // mousedown rather than click: the root element closes the translation
    // popup on click, and we want the menu gone before that re-render.
    const onDocDown = (e) => {
      if (wrapRef.current?.contains(e.target)) return;
      const hadFocus = wrapRef.current?.contains(document.activeElement);
      setOpen(false);
      // The focused item is about to unmount, so focus would fall to <body>
      // unless the press takes it somewhere. Where it lands is the browser's
      // call, and its default action runs after this listener — so the check
      // waits for the press to finish and only steps in if focus was dropped.
      // Reclaiming it here instead would fight the press for a control the
      // user actually clicked.
      if (hadFocus) {
        restoreRef.current = setTimeout(() => {
          const el = document.activeElement;
          if (!el || el === document.body) btnRef.current?.focus();
        }, 0);
      }
    };
    const onKey = (e) => { if (e.key === "Escape") { setOpen(false); btnRef.current?.focus(); } };
    document.addEventListener("mousedown", onDocDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // Closing is what schedules that check, so clearing it belongs to unmount
  // rather than to the effect above — whose cleanup runs on the very close
  // that armed it.
  useEffect(() => () => clearTimeout(restoreRef.current), []);

  // Focus follows `active` for as long as the menu is open — on opening, and
  // on every arrow press after it.
  useEffect(() => { if (open) itemsRef.current[active]?.focus(); }, [open, active]);

  const openAt = (i) => { setActive(i); setOpen(true); };

  // Focus goes back to the toggle before the action runs: the item that was
  // clicked is about to unmount, and a keyboard user should not be dropped
  // onto <body>. Telegram and API key open something else from here, so the
  // toggle is the sensible place to land.
  const run = (fn) => (e) => {
    e.stopPropagation();
    setOpen(false);
    btnRef.current?.focus();
    fn?.();
  };

  // Enter and Space already reach onClick as a synthesised click, so the
  // toggle only has to add the two arrow keys.
  const onBtnKeyDown = (e) => {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    e.preventDefault();
    e.stopPropagation();
    openAt(e.key === "ArrowDown" ? 0 : last);
  };

  const onMenuKeyDown = (e) => {
    const moves = {
      ArrowDown: (i) => (i === last ? 0 : i + 1),
      ArrowUp: (i) => (i === 0 ? last : i - 1),
      Home: () => 0,
      End: () => last,
    };
    const move = moves[e.key];
    if (move) {
      e.preventDefault();
      setActive(move);
      return;
    }
    if (e.key === "Tab") {
      // Not prevented: focus lands on the toggle first, so the browser
      // continues the tab sequence from there rather than from <body>.
      btnRef.current?.focus();
      setOpen(false);
    }
  };

  return (
    <div ref={wrapRef} style={{ position: "relative" }}>
      <button
        ref={btnRef}
        id={btnId}
        onClick={(e) => { e.stopPropagation(); if (open) setOpen(false); else openAt(0); }}
        onKeyDown={onBtnKeyDown}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
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
          id={menuId}
          role="menu"
          aria-labelledby={btnId}
          onClick={(e) => e.stopPropagation()}
          onKeyDown={onMenuKeyDown}
          style={{
            position: "absolute", top: "calc(100% + 6px)", right: 0, zIndex: 60,
            minWidth: 170, padding: "5px 0", borderRadius: 11,
            background: "#171a22", border: "1px solid rgba(255,255,255,0.1)",
            boxShadow: "0 10px 30px rgba(0,0,0,0.5)",
            animation: "fadeUp 0.12s ease-out",
          }}
        >
          {items.map((item, i) => (
            <Fragment key={item.label}>
              {item.separated && (
                <div
                  role="separator"
                  style={{ height: 1, background: "rgba(255,255,255,0.07)", margin: "5px 0" }}
                />
              )}
              <button
                ref={(el) => { itemsRef.current[i] = el; }}
                role="menuitem"
                tabIndex={i === active ? 0 : -1}
                onClick={run(item.fn)}
                style={ITEM}
              >
                <span aria-hidden="true" style={{ width: 14, textAlign: "center", color: item.iconColor }}>
                  {item.icon}
                </span>
                {item.label}
              </button>
            </Fragment>
          ))}
        </div>
      )}
    </div>
  );
}
