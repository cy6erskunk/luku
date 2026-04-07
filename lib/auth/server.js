import { createAuthServer } from "@neondatabase/auth/next/server";

// Lazily initialized so it doesn't throw at build time when env vars are absent
let _auth = null;

export function getAuth() {
  if (!_auth) _auth = createAuthServer();
  return _auth;
}
