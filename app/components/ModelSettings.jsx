"use client";
import { Bg } from "../lib/styles.js";
import { useDialog } from "../hooks/useDialog.js";
import { MODELS, TASKS } from "@/lib/shared/models.js";

/**
 * Picks the model behind each of Luku's two Claude calls.
 *
 * One radio group per task rather than one setting for both: the two jobs
 * differ in how much a mistake costs. A misread photograph is wrong for every
 * word in the session, so it can be worth the slowest model; a translation is
 * one short call repeated all session, where a fast model usually pays.
 *
 * Native radios, so the groups arrive with their keyboard contract already
 * written — arrows within a group, Tab between them — and so each group is
 * announced with its own name.
 */
export default function ModelSettings({ models, onPick, onClose }) {
  const panelRef = useDialog(onClose);

  return (
    <div
      data-testid="models-backdrop"
      onClick={onClose}
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 300, display: "flex", alignItems: "center", justifyContent: "center" }}
    >
      <div
        role="dialog"
        aria-modal="true"
        ref={panelRef}
        tabIndex={-1}
        aria-labelledby="models-heading"
        onClick={(e) => e.stopPropagation()}
        style={{ background: "#181d2a", borderRadius: 18, width: "100%", maxWidth: 440, margin: 16, maxHeight: "calc(100vh - 32px)", display: "flex", flexDirection: "column", overflow: "hidden" }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "18px 20px 14px", borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
          <div id="models-heading" style={{ fontSize: 14, fontWeight: 600 }}>Models</div>
          <button onClick={onClose} aria-label="Close" style={{ background: "none", border: "none", color: "#555", fontSize: 18, cursor: "pointer", lineHeight: 1, padding: "0 4px" }}>✕</button>
        </div>

        <div style={{ padding: 20, overflowY: "auto" }}>
          {TASKS.map((task, i) => (
            <fieldset
              key={task.id}
              style={{ border: "none", padding: 0, margin: i === 0 ? 0 : "22px 0 0" }}
            >
              <legend style={{ fontSize: 13, color: "#c8c0b5", padding: 0 }}>{task.label}</legend>
              <div style={{ fontSize: 11, color: "#6b645e", margin: "4px 0 10px", lineHeight: 1.6 }}>{task.note}</div>
              {MODELS.map((model) => {
                const checked = models[task.id] === model.id;
                return (
                  <label
                    key={model.id}
                    style={{
                      display: "flex", alignItems: "flex-start", gap: 10, cursor: "pointer",
                      padding: "10px 12px", marginBottom: 6, borderRadius: 10,
                      background: checked ? "rgba(74,124,158,0.12)" : "rgba(255,255,255,0.03)",
                      border: `1px solid ${checked ? "rgba(74,124,158,0.35)" : "rgba(255,255,255,0.07)"}`,
                    }}
                  >
                    <input
                      type="radio"
                      name={`luku-model-${task.id}`}
                      value={model.id}
                      checked={checked}
                      onChange={() => onPick(task.id, model.id)}
                      style={{ marginTop: 2, accentColor: "#4a7c9e", cursor: "pointer" }}
                    />
                    <span style={{ minWidth: 0 }}>
                      <span style={{ display: "block", fontSize: 13, color: checked ? "#e8e0d5" : "#c8c0b5" }}>{model.label}</span>
                      <span style={{ display: "block", fontSize: 11, color: "#6b645e", marginTop: 2, lineHeight: 1.5 }}>{model.note}</span>
                    </span>
                  </label>
                );
              })}
            </fieldset>
          ))}

          {/* Says what a pick costs without saying whose key pays: the reader
              may be on the deployment's development key, where "your own API
              key" would be plainly untrue. */}
          <p style={{ fontSize: 11, color: "#3a4550", marginTop: 18, lineHeight: 1.6 }}>
            A slower model costs more per scan and per word. The free local scan uses no
            model at all, so this changes nothing about it.
          </p>

          {/* Last in the DOM so the dialog's Tab trap wraps from here back to
              Close. There is nothing to save: a pick is stored as it is made. */}
          <button onClick={onClose} style={{ ...Bg, width: "100%", marginTop: 14 }}>Done</button>
        </div>
      </div>
    </div>
  );
}
