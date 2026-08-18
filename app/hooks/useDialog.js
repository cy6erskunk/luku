"use client";
import { useEffect, useRef } from "react";

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Makes an `aria-modal` dialog actually modal for keyboard users.
 *
 * Declaring aria-modal promises assistive technology that the rest of the page
 * is inert; without this the promise is false — focus stays on the trigger,
 * background controls stay tabbable, and Escape does nothing.
 *
 * Returns a ref to attach to the dialog panel.
 */
export function useDialog(onClose) {
  const panelRef = useRef(null);

  // Held in a ref so an inline arrow callback — which every call site passes —
  // doesn't tear down and rebuild the listener on each render.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const panel = panelRef.current;
    const previouslyFocused = document.activeElement;

    const focusable = () => Array.from(panel?.querySelectorAll(FOCUSABLE) ?? []);

    // Move focus in. The panel itself carries tabIndex={-1} as the fallback
    // target for a dialog with nothing focusable in it yet.
    (focusable()[0] ?? panel)?.focus?.();

    const handleKeyDown = (e) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onCloseRef.current?.();
        return;
      }
      if (e.key !== "Tab") return;

      const items = focusable();
      if (items.length === 0) {
        e.preventDefault();
        return;
      }

      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;

      // Wrap at both ends, and pull focus back if it escaped the panel.
      if (e.shiftKey && (active === first || !panel?.contains(active))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (active === last || !panel?.contains(active))) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown, true);
    return () => {
      document.removeEventListener("keydown", handleKeyDown, true);
      previouslyFocused?.focus?.();
    };
  }, []);

  return panelRef;
}
