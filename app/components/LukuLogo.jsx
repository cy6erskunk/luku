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
      <path d="M32,16 C22,16 12,20 12,28 L12,36 C12,44 22,48 32,48 Z" fill="#e8e0d5" opacity="0.9" />
      <path d="M32,16 C42,16 52,20 52,28 L52,36 C52,44 42,48 32,48 Z" fill="#e8e0d5" opacity="0.75" />
      <line x1="32" y1="15" x2="32" y2="49" stroke="#2d5a7a" strokeWidth="1.5" opacity="0.5" />
    </svg>
  );
}
