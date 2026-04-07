import { createAuthServer } from "@neondatabase/auth/next/server";

// Normalize the Vercel Neon integration env var name to what the library expects
function resolveEnv() {
  if (!process.env.NEON_AUTH_BASE_URL && process.env.VITE_NEON_AUTH_URL) {
    process.env.NEON_AUTH_BASE_URL = process.env.VITE_NEON_AUTH_URL;
  }
}

// Lazily initialized so it doesn't throw at build time when env vars are absent
let _auth = null;

export function getAuth() {
  if (!_auth) { resolveEnv(); _auth = createAuthServer(); }
  return _auth;
}
