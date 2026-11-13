/**
 * The models /api/claude sends. The client never names one: it sends a `kind`
 * label and the server picks from this file, so the worst a modified client can
 * do is choose between these two on its own key.
 *
 * Sonnet 5 answers translations and new examples. AI OCR goes to Haiku 5.5,
 * which costs a twentieth as much per token ($0.10 / $0.50 per MTok against
 * $2 / $10) — transcribing a photo needs no Finnish judgement, and the image
 * is most of a scan's input tokens.
 *
 * Both run adaptive thinking when the request says nothing; the route turns it
 * off (THINKING) so short dictionary lookups keep their latency and the
 * callers' small max_tokens aren't spent on thinking before the reply. Haiku
 * 5.5 accepts "disabled" only at effort high or below; its default is medium,
 * so don't raise effort without revisiting this.
 *
 * Changing the model can change the tokenizer: Sonnet 5 counts the same text
 * as ~30% more tokens than 4.6, so the per-call max_tokens in app/lib/api.js
 * were raised with it, and claude_usage rows before and after a switch are
 * not comparable token for token. claude_usage records the model per row, so
 * OCR on the two models can still be compared.
 */
export const SONNET_MODEL = "claude-sonnet-5";
export const HAIKU_MODEL = "claude-haiku-5-5";
export const THINKING = { type: "disabled" };

/** The model for a call, by the client's `kind` label. */
export function modelFor(kind) {
  return kind === "ocr" ? HAIKU_MODEL : SONNET_MODEL;
}
