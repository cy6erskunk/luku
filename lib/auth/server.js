import { createNeonAuth } from "@neondatabase/auth/next/server";

// Normalize the Vercel Neon integration env var name to what the library expects
function resolveEnv() {
  if (!process.env.NEON_AUTH_BASE_URL && process.env.VITE_NEON_AUTH_URL) {
    process.env.NEON_AUTH_BASE_URL = process.env.VITE_NEON_AUTH_URL;
  }
}

// Lazily initialized so it doesn't throw at build time when env vars are absent.
// createNeonAuth throws on a cookie secret under 32 characters, so a deployment
// missing NEON_AUTH_COOKIE_SECRET fails on its first auth request, not at build.
let _auth = null;

export function getAuth() {
  if (!_auth) {
    resolveEnv();
    // The old createAuthServer() named this itself; createNeonAuth would fail
    // later with "Cannot read properties of undefined".
    if (!process.env.NEON_AUTH_BASE_URL) throw new Error("NEON_AUTH_BASE_URL is not set");
    _auth = createNeonAuth({
      baseUrl: process.env.NEON_AUTH_BASE_URL,
      cookies: { secret: process.env.NEON_AUTH_COOKIE_SECRET },
    });
  }
  return _auth;
}
