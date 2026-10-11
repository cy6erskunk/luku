import { SERVER_KEY } from "./utils.js";
// Shared with the MCP server's tool description, so a card refined in a chat
// client and one regenerated in ExamplePicker are held to the same standard.
import { EXAMPLE_GUIDE } from "../../lib/shared/exampleGuide.js";

export async function callClaude(apiKey, messages, system, maxTokens = 1500) {
  const res = await fetch("/api/claude", {
    method: "POST",
    headers: { "content-type": "application/json" },
    // SERVER_KEY is a marker, not a credential: dropping the field is what
    // tells the route to use the deployment's own key. JSON.stringify omits
    // undefined for us.
    body: JSON.stringify({ apiKey: apiKey === SERVER_KEY ? undefined : apiKey, messages, system, maxTokens }),
  });
  let data;
  try { data = await res.json(); } catch { data = {}; }
  if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
  return data?.content?.find((b) => b.type === "text")?.text ?? "";
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
    [{ role: "user", content: `Finnish word: "${word}"\nSentence: "${context}"\n\n${EXAMPLE_GUIDE}\n\nONLY raw JSON:\n{"base":"dictionary form","translations":["main English of the dictionary form","alt1","alt2"],"form_translation":"English of \\"${word}\\" exactly as inflected in the sentence","pos":"noun/verb/adj/adv/other","example":"memorable Finnish example sentence","example_translation":"English translation of example"}` }],
    "You are a Finnish linguist. Return only raw JSON, no markdown.",
    500
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

/**
 * A fresh example for a saved word. `avoid` lists the examples the reader has
 * already seen for it — the stored one and any rejected in this popup — so
 * "another" is actually another. Throws when the reply holds no usable
 * example: unlike a translation, there is no fallback worth showing.
 */
export async function suggestExample(apiKey, word, avoid = []) {
  const meaning = [word.pos, (word.translations || []).join(", ")].filter(Boolean).join(": ");
  const seen = avoid.filter(Boolean);
  const raw = await callClaude(
    apiKey,
    [{ role: "user", content: `Finnish word: "${word.base}"${meaning ? ` (${meaning})` : ""}\n` +
      (seen.length ? `Do not repeat or closely paraphrase these examples:\n${seen.map((e) => `- ${e}`).join("\n")}\n` : "") +
      `\nWrite one new example. ${EXAMPLE_GUIDE}\n\nONLY raw JSON:\n{"example":"Finnish example sentence","example_translation":"English translation of example"}` }],
    "You are a Finnish teacher writing flashcard examples. Return only raw JSON, no markdown.",
    300
  );
  let d;
  try { d = JSON.parse(raw.replace(/```json|```/g, "").trim()); }
  catch { throw new Error("Unreadable example"); }
  if (typeof d?.example !== "string" || !d.example.trim()) throw new Error("Unreadable example");
  return {
    example: d.example.trim(),
    example_translation: typeof d.example_translation === "string" ? d.example_translation.trim() || null : null,
  };
}
