export async function callClaude(apiKey, messages, system, maxTokens = 1500) {
  const res = await fetch("/api/claude", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ apiKey, messages, system, maxTokens }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
  return data.content.find((b) => b.type === "text")?.text ?? "";
}

export async function ocrImage(apiKey, base64, mediaType) {
  return callClaude(
    apiKey,
    [{ role: "user", content: [
      { type: "image", source: { type: "base64", media_type: mediaType, data: base64 } },
      { type: "text", text: "Extract ALL text from this image exactly as written. Return only the raw text, nothing else. Preserve paragraph breaks." },
    ]}],
    "You are an OCR assistant. Extract text from images with high accuracy.",
    1500
  );
}

export async function translateWord(apiKey, word, context) {
  const raw = await callClaude(
    apiKey,
    [{ role: "user", content: `Finnish word: "${word}"\nSentence: "${context}"\n\nONLY raw JSON:\n{"base":"dictionary form","translations":["main English","alt1","alt2"],"pos":"noun/verb/adj/adv/other"}` }],
    "You are a Finnish linguist. Return only raw JSON, no markdown.",
    250
  );
  try { return JSON.parse(raw.replace(/```json|```/g, "").trim()); }
  catch { return { base: word, translations: ["(unavailable)"], pos: "?" }; }
}
