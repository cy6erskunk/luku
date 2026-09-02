import { getAuth } from "@/lib/auth/server";

/**
 * Proxy for the Anthropic API.
 *
 * A request carries the user's own key. The one exception is local
 * development, where ANTHROPIC_API_KEY from .env.local stands in so nobody has
 * to paste a key into the UI on every fresh browser profile.
 *
 * Deliberately not available in production. A deployed fallback would be spent
 * by whoever is signed in rather than by whoever owns the key, and the owner
 * would have no per-user visibility or limit — a bill, not a feature. Locally
 * the key, the browser and the person paying are all the same.
 *
 * The session check below is independent of this: it stops the route being an
 * open relay to Anthropic for anyone who finds the path.
 */
function developmentKey() {
  if (process.env.NODE_ENV === "production") return "";
  return process.env.ANTHROPIC_API_KEY || "";
}

async function requireUser() {
  const { data: session } = await getAuth().getSession();
  return session?.user ?? null;
}

/** Lets the client skip the key screen when a development key is available. */
export async function GET() {
  const user = await requireUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  return Response.json({ serverKey: Boolean(developmentKey()) });
}

export async function POST(request) {
  const user = await requireUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { apiKey, messages, system, maxTokens = 1500 } = await request.json();

    // The user's own key always wins, so a real key works in development too.
    const key = apiKey || developmentKey();
    if (!key) {
      return Response.json({ error: "API key required" }, { status: 400 });
    }

    const body = {
      model: "claude-sonnet-4-6",
      max_tokens: maxTokens,
      messages,
    };
    if (system) body.system = system;

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "anthropic-version": "2023-06-01",
        "x-api-key": key,
      },
      body: JSON.stringify(body),
    });

    const data = await res.json();
    if (!res.ok) {
      return Response.json({ error: data?.error?.message || "API error" }, { status: res.status });
    }
    return Response.json(data);
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
