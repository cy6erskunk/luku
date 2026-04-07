import { createAuthServer } from "@neondatabase/auth/next/server";

// Reads NEON_AUTH_BASE_URL from env automatically
export const auth = createAuthServer();
