import { Bg } from "../lib/styles.js";

// The tag every reverse-practice entry point carries, so nobody reads a pass
// that writes nothing as progress on the schedule.
export function AlphaTag() {
  return (
    <span style={{ fontSize: 9, letterSpacing: "0.12em", textTransform: "uppercase", color: "#9e8a7a", background: "rgba(158,138,122,0.12)", border: "1px solid rgba(158,138,122,0.3)", borderRadius: 10, padding: "2px 7px", fontFamily: "monospace", whiteSpace: "nowrap" }}>
      alpha · not graded
    </span>
  );
}

/** Starts a reverse pass (app/lib/reverse.js). */
export default function ReverseButton({ count, onClick, label = "Reverse practice", style }) {
  return (
    <button
      onClick={onClick}
      style={{ ...Bg, padding: "9px 20px", fontSize: 13, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8, flexWrap: "wrap", ...style }}
    >
      <span>{label}: English → Finnish ({count}) →</span>
      <AlphaTag />
    </button>
  );
}
