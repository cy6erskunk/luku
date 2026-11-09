/**
 * The one model every /api/claude call uses: translations, AI OCR and new
 * examples alike. The client never chooses it.
 *
 * Sonnet 5 runs adaptive thinking when the request says nothing, which Sonnet
 * 4.6 did not; the route turns it off (THINKING) so short dictionary lookups
 * keep their latency and the callers' small max_tokens aren't spent on
 * thinking before the reply.
 *
 * Changing the model can change the tokenizer: Sonnet 5 counts the same text
 * as ~30% more tokens than 4.6, so the per-call max_tokens in app/lib/api.js
 * were raised with it, and claude_usage rows before and after the switch are
 * not comparable token for token.
 */
export const CLAUDE_MODEL = "claude-sonnet-5";
export const THINKING = { type: "disabled" };
