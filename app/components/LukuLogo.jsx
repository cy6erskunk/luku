"use client";
import { useId } from "react";

export default function LukuLogo({ size = 32 }) {
  const id = useId();
  const gradId = `luku-bg-${id}`;
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#4a7c9e" />
          <stop offset="100%" stopColor="#2d5a7a" />
        </linearGradient>
      </defs>
      <circle cx="32" cy="32" r="32" fill={`url(#${gradId})`} />
      <path d="M32,24 C26,23 18,23 14,25 L14,41 C18,43 26,43 32,42 Z" fill="#e8e0d5" opacity="0.9" />
      <path d="M32,24 C38,23 46,23 50,25 L50,41 C46,43 38,43 32,42 Z" fill="#e8e0d5" opacity="0.75" />
      <line x1="32" y1="22" x2="32" y2="44" stroke="#2d5a7a" strokeWidth="1.5" opacity="0.6" />
    </svg>
  );
}
