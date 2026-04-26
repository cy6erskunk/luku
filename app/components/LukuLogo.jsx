import { useId } from "react";

export default function LukuLogo({ size = 32, style }) {
  const gradId = `lukuGrad-${useId()}`;
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-label="Luku" role="img" style={style}>
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#4a7c9e" />
          <stop offset="100%" stopColor="#2d5a7a" />
        </linearGradient>
      </defs>
      <circle cx="16" cy="16" r="16" fill={`url(#${gradId})`} />
      <path d="M11 8 L11 22 L21 22" fill="none" stroke="#e8e0d5" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
      <line x1="14.5" y1="12" x2="22" y2="12" stroke="#e8e0d5" strokeWidth="1.6" strokeLinecap="round" opacity="0.55" />
      <line x1="14.5" y1="16" x2="20" y2="16" stroke="#e8e0d5" strokeWidth="1.6" strokeLinecap="round" opacity="0.4" />
    </svg>
  );
}
