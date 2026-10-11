/**
 * Minting, listing and revoking the bearer tokens /api/mcp accepts.
 *
 * Session-authenticated, unlike /api/mcp itself — this is the browser half,
 * and it is where the MCP credential inherits the identity Neon Auth
 * established. The user_id written into a token row is whatever getSession()
 * reports here, which is why no part of the MCP surface has to take one from a
 * caller.
 */
import { getAuth } from "@/lib/auth/server";
import { getDb } from "@/lib/db";
import { MAX_LABEL, createToken, listTokens, revokeToken } from "@/lib/mcp/tokens";

async function requireUser() {
  const { data: session } = await getAuth().getSession();
  return session?.user ?? null;
}

export async function GET() {
  const user = await requireUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const tokens = await listTokens(getDb(), user.id);
  return Response.json({ tokens });
}

/**
 * Mints a token. The plaintext is in this response and nowhere else — only its
 * hash is stored — so the panel has to show it once and say so.
 */
export async function POST(request) {
  const user = await requireUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  let body = {};
  // A mint needs no body; an absent or unreadable one is not a reason to fail.
  try { body = (await request.json()) ?? {}; } catch { body = {}; }

  const { label } = body;
  if (label != null && (typeof label !== "string" || label.length > MAX_LABEL)) {
    return Response.json({ error: "Invalid label" }, { status: 400 });
  }

  const { token } = await createToken(getDb(), user.id, label?.trim());
  return Response.json({ token });
}

export async function DELETE(request) {
  const user = await requireUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) return Response.json({ error: "Missing id" }, { status: 400 });

  // Scoped to the owner inside revokeToken, so a well-formed id belonging to
  // somebody else is a 404 rather than a revocation.
  const revoked = await revokeToken(getDb(), user.id, id);
  if (!revoked) return Response.json({ error: "Not found" }, { status: 404 });
  return Response.json({ ok: true });
}
