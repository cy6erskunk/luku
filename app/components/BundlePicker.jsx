"use client";
import { useState } from "react";
import { MAX_BUNDLE_NAME } from "@/lib/shared/bundle.js";

/**
 * Picks the bundle words are collected into while reading — an existing one by
 * name, a new one typed on the spot, or none at all.
 *
 * Names are unique per user server-side, so creating one that already exists
 * simply selects it; nothing here has to guard against that.
 */
export default function BundlePicker({ bundles, activeBundleId, onSelect, onCreate, label = "Collecting into", counts, maxWidth = 400 }) {
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  const stop = (e) => e.stopPropagation();

  // The remembered selection outlives the list that names it — it is read from
  // localStorage before /api/bundles answers, and survives a failed load. With
  // no option carrying its value the select falls off its own value and reads
  // as unselected, while every word added still goes into that bundle. So the
  // selection gets an option of its own until the list can name it.
  const unresolved = activeBundleId != null && !bundles.some((b) => b.id === activeBundleId);

  const submit = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    const clean = name.trim();
    if (!clean || saving) return;
    setSaving(true);
    setErr("");
    try {
      const bundle = await onCreate(clean);
      if (bundle?.id != null) onSelect(bundle.id);
      setName("");
      setAdding(false);
    } catch {
      setErr("Could not create that bundle.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div onClick={stop} style={{ width: "100%", maxWidth }}>
      <div style={{ fontSize: 9, letterSpacing: "0.14em", textTransform: "uppercase", color: "#4a6070", fontFamily: "monospace", marginBottom: 6 }}>
        {label}
      </div>
      {adding
        ? (
          <form onSubmit={submit} style={{ display: "flex", gap: 8 }}>
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={MAX_BUNDLE_NAME}
              placeholder="Bundle name"
              aria-label="New bundle name"
              style={{ flex: 1, minWidth: 0, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 10, padding: "9px 12px", color: "#e8e0d5", fontFamily: "Georgia,serif", fontSize: 13 }}
            />
            <button type="submit" disabled={!name.trim() || saving} style={{ background: "linear-gradient(135deg,#4a7c9e,#2d5a7a)", border: "none", borderRadius: 10, color: "#fff", padding: "9px 14px", fontSize: 13, cursor: "pointer", fontFamily: "Georgia,serif", opacity: !name.trim() || saving ? 0.5 : 1 }}>
              {saving ? "…" : "Create"}
            </button>
            <button type="button" onClick={() => { setAdding(false); setName(""); setErr(""); }} style={{ background: "none", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 10, color: "#6b645e", padding: "9px 12px", fontSize: 13, cursor: "pointer", fontFamily: "Georgia,serif" }}>
              Cancel
            </button>
          </form>
        )
        : (
          <div style={{ display: "flex", gap: 8 }}>
            <select
              aria-label={label}
              value={activeBundleId ?? ""}
              onChange={(e) => onSelect(e.target.value === "" ? null : Number(e.target.value))}
              style={{ flex: 1, minWidth: 0, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 10, padding: "9px 12px", color: "#e8e0d5", fontFamily: "Georgia,serif", fontSize: 13 }}
            >
              <option value="">No bundle</option>
              {unresolved && <option value={activeBundleId}>Remembered bundle</option>}
              {bundles.map((b) => (
                <option key={b.id} value={b.id}>
                  {counts?.[b.id] != null ? `${b.name} (${counts[b.id]})` : b.name}
                </option>
              ))}
            </select>
            <button type="button" onClick={() => setAdding(true)} style={{ background: "none", border: "1px solid rgba(74,124,158,0.35)", borderRadius: 10, color: "#6a9ebe", padding: "9px 14px", fontSize: 13, cursor: "pointer", fontFamily: "Georgia,serif", whiteSpace: "nowrap" }}>
              + New
            </button>
          </div>
        )}
      {/* Announced, not just shown: it appears asynchronously while focus is
          still on the form, so without a live region a screen reader gives no
          sign the create failed at all. */}
      {err && <div role="alert" style={{ marginTop: 6, fontSize: 11, color: "#c48a8a" }}>{err}</div>}
    </div>
  );
}
