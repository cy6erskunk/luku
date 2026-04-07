import { authApiHandler } from "@neondatabase/auth/next/server";

let _handler = null;
function handler() {
  if (!_handler) _handler = authApiHandler();
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
