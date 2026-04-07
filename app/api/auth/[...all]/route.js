import { authApiHandler } from "@neondatabase/auth/next/server";

let _handler = null;
function handler() {
  if (!_handler) _handler = authApiHandler();
  return _handler;
}

export async function GET(request, ctx) {
  return handler().GET(request, ctx);
}
export async function POST(request, ctx) {
  return handler().POST(request, ctx);
}
