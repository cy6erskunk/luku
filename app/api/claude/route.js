export async function POST(request) {
  try {
    const { apiKey, messages, system, maxTokens = 1500 } = await request.json();

    if (!apiKey) {
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
        "x-api-key": apiKey,
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
