/**
 * The one model every /api/claude call uses: translations, AI OCR and new
 * examples alike. The client never chooses it.
 *
 * Sonnet 5 runs adaptive thinking when the request says nothing, which Sonnet
 * 4.6 did not; the route turns it off (THINKING) so short dictionary lookups
 * keep their latency and their 1500-token budget isn't spent before the reply.
 */
export const CLAUDE_MODEL = "claude-sonnet-5";
export const THINKING = { type: "disabled" };
