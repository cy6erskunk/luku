import * as Sentry from "@sentry/nextjs";
import { getAuth } from "@/lib/auth/server";

let _handler = null;
function handler() {
  if (!_handler) _handler = getAuth().handler();
  return _handler;
}

async function handle(request, ctx) {
  try {
    return await handler()[request.method === "GET" ? "GET" : "POST"](request, ctx);
  } catch (e) {
    // Almost always configuration — a missing NEON_AUTH_COOKIE_SECRET or base
    // URL — which is the operator's to read, not the reader's. Caught here, it
    // never reaches onRequestError, so it is reported by hand. The client
    // shows `message` (and invents "HTTP 500" without one), so that is the
    // field the reader-facing text goes in.
    console.error("[auth handler]", e?.message ?? e);
    Sentry.captureException(e);
    return Response.json(
      { message: "Sign-in is unavailable right now.", code: "AUTH_UNAVAILABLE" },
      { status: 500 }
    );
  }
}

export const GET = handle;
export const POST = handle;
