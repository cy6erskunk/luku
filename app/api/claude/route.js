import { getAuth } from "@/lib/auth/server";

/**
 * Proxy for the Anthropic API.
 *
 * A request may carry the user's own key, or rely on this deployment's
 * ANTHROPIC_API_KEY for a personal install where nobody should have to type a
 * key in. That fallback is exactly what makes the session check below
 * mandatory: without it the route would be an open proxy spending the
 * deployment owner's credit for anyone who found the path.
 */
function deploymentKey() {
  return process.env.ANTHROPIC_API_KEY || "";
}

async function requireUser() {
  const { data: session } = await getAuth().getSession();
  return session?.user ?? null;
}

/** Lets the client skip the key screen when the deployment supplies a key. */
export async function GET() {
  const user = await requireUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  return Response.json({ serverKey: Boolean(deploymentKey()) });
}

export async function POST(request) {
  const user = await requireUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { apiKey, messages, system, maxTokens = 1500 } = await request.json();

    // The user's own key wins, so a personal key still works on a deployment
    // that has one of its own.
    const key = apiKey || deploymentKey();
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
