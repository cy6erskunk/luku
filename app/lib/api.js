import { SERVER_KEY } from "./utils.js";

export async function callClaude(apiKey, messages, system, maxTokens = 1500, model) {
  const res = await fetch("/api/claude", {
    method: "POST",
    headers: { "content-type": "application/json" },
    // SERVER_KEY is a marker, not a credential: dropping the field is what
    // tells the route to use the deployment's own key. JSON.stringify omits
    // undefined for us — which is also how an unset model asks for the
    // default rather than naming it here.
    body: JSON.stringify({ apiKey: apiKey === SERVER_KEY ? undefined : apiKey, messages, system, maxTokens, model }),
  });
  let data;
  try { data = await res.json(); } catch { data = {}; }
  if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
  return data?.content?.find((b) => b.type === "text")?.text ?? "";
}

export async function ocrImage(apiKey, base64, mediaType, model) {
  return callClaude(
    apiKey,
    [{ role: "user", content: [
      { type: "image", source: { type: "base64", media_type: mediaType, data: base64 } },
      { type: "text", text: "Extract ALL text from this image exactly as written. Return only the raw text, nothing else. Preserve paragraph breaks." },
    ]}],
    "You are an OCR assistant. Extract text from images with high accuracy.",
    1500,
    model
  );
}

export async function translateWord(apiKey, word, context, model) {
  const raw = await callClaude(
    apiKey,
    [{ role: "user", content: `Finnish word: "${word}"\nSentence: "${context}"\n\nONLY raw JSON:\n{"base":"dictionary form","translations":["main English of the dictionary form","alt1","alt2"],"form_translation":"English of \\"${word}\\" exactly as inflected in the sentence","pos":"noun/verb/adj/adv/other","example":"short 2-3 word Finnish sentence using the base form","example_translation":"English translation of example"}` }],
    "You are a Finnish linguist. Return only raw JSON, no markdown.",
    400,
    model
  );
  try {
    const d = JSON.parse(raw.replace(/```json|```/g, "").trim());
    return {
      base: d.base,
      translations: d.translations,
      formTranslation: d.form_translation ?? null,
      pos: d.pos,
      example: d.example ?? null,
      example_translation: d.example_translation ?? null,
    };
  }
  catch { return { base: word, translations: ["(unavailable)"], formTranslation: null, pos: "?", example: null, example_translation: null }; }
}
