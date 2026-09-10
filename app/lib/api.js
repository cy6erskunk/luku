import { SERVER_KEY } from "./utils.js";

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

// The example sentence is the *front* of a flashcard: the learner sees the
// dictionary form plus this sentence and tries to recall the meaning. A
// two-word sentence ("Hän juoksee.") gives the recall attempt nothing to hang
// on, so the rules below are what make the example worth storing at all. They
// live in the system prompt because they are the same on every call.
const TRANSLATE_SYSTEM = `You are a Finnish lexicographer writing flashcards for an English-speaking learner. Return only raw JSON, no markdown.

The "example" is the front of a flashcard: the learner sees the dictionary form and this sentence, then tries to recall what the word means. Write it so the sentence itself carries the meaning:

- Make the word recoverable from its surroundings. Someone who did not know it should be able to narrow it down from the rest of the sentence. "Hän tekee sitä." teaches nothing; "Isoäiti kutoo villasukkia lapsenlapselle." teaches kutoa.
- Use one concrete, picturable everyday situation: a specific person doing something specific somewhere specific. Avoid empty subjects and objects (se, asia, joku, jotain) unless the word itself is abstract.
- Anchor the word with the company it usually keeps. Verb: a natural subject and object, and the case the verb governs (pitää jostakin, odottaa jotakin). Noun: a verb or adjective it genuinely goes with. Adjective: a noun it plausibly describes. Adverb: the action it modifies.
- Illustrate the sense the word carries in the learner's sentence, not a different sense of the same word.
- Choose a different situation from the learner's sentence so the word gets a second, independent context. Never reuse that sentence or a lightly reworded copy of it.
- 4-8 words, one clause or two short ones, present tense unless the meaning needs otherwise. Every other word should be A1-A2 vocabulary, so the example is not harder than the word it explains.
- Keep the target word in whatever form is closest to the dictionary form that the sentence takes naturally.

"example_translation" renders that sentence as natural English, not a word-for-word gloss.`;

export async function translateWord(apiKey, word, context) {
  const raw = await callClaude(
    apiKey,
    [{ role: "user", content: `Finnish word: "${word}"\nSentence: "${context}"\n\nONLY raw JSON:\n{"base":"dictionary form","translations":["main English of the dictionary form","alt1","alt2"],"form_translation":"English of \\"${word}\\" exactly as inflected in the sentence","pos":"noun/verb/adj/adv/other","example":"Finnish example sentence following the rules above","example_translation":"English translation of example"}` }],
    TRANSLATE_SYSTEM,
    400
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
