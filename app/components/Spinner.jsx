// A ring drawn with borders rather than a "⟳" glyph: a glyph sits off-centre in
// its own line box, so rotating it swings it around a point beside it.
export default function Spinner({ size = 12 }) {
  return (
    <span
      aria-hidden="true"
      style={{
        display: "inline-block",
        flexShrink: 0,
        width: size,
        height: size,
        boxSizing: "border-box",
        border: `${Math.max(2, Math.round(size / 8))}px solid rgba(74,124,158,0.25)`,
        borderTopColor: "currentColor",
        borderRadius: "50%",
        animation: "spin 0.8s linear infinite",
      }}
    />
  );
}
