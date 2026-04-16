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
      <path d="M32,20 C24,16 16,17 12,21 L12,43 C16,47 24,48 32,44 Z" fill="#e8e0d5" opacity="0.9" />
      <path d="M32,20 C40,16 48,17 52,21 L52,43 C48,47 40,48 32,44 Z" fill="#e8e0d5" opacity="0.75" />
      <line x1="32" y1="18" x2="32" y2="46" stroke="#2d5a7a" strokeWidth="1.5" opacity="0.5" />
    </svg>
  );
}
