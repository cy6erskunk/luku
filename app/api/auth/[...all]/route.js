import { authApiHandler } from "@neondatabase/auth/next/server";

function resolveEnv() {
  if (!process.env.NEON_AUTH_BASE_URL && process.env.VITE_NEON_AUTH_URL) {
    process.env.NEON_AUTH_BASE_URL = process.env.VITE_NEON_AUTH_URL;
  }
}

let _handler = null;
function handler() {
  if (!_handler) { resolveEnv(); _handler = authApiHandler(); }
  return _handler;
}

async function handle(request, ctx) {
  try {
    return await handler()[request.method === "GET" ? "GET" : "POST"](request, ctx);
  } catch (e) {
    console.error("[auth handler]", e?.message ?? e);
    return Response.json(
      { error: e?.message ?? "Auth handler error" },
      { status: 500 }
    );
  }
}

export const GET = handle;
export const POST = handle;
