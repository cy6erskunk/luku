/**
 * Token usage of /api/claude calls, one row per call, for later cost analysis.
 *
 * Tokens rather than dollars: prices change, and a stored dollar figure would
 * go stale silently. Cost is computed at query time from `model` and the four
 * counts, which are Anthropic's own `usage` block copied as is.
 *
 * No prompt text and no reply is stored — a row says that a reader translated
 * something and what it cost, never which word.
 */

/**
 * What a call was for. The browser names it, so it is a label, not a fact:
 * anything outside this list is stored as "other" rather than refused, since
 * a mislabelled row only misleads the reader's own analysis.
 */
export const USAGE_KINDS = ["translate", "ocr", "example"];

const count = (n) => (Number.isInteger(n) && n >= 0 ? n : 0);

export async function recordUsage(sql, { userId, kind, model, usage }) {
  await sql`
    INSERT INTO claude_usage (
      user_id, kind, model,
      input_tokens, output_tokens,
      cache_creation_input_tokens, cache_read_input_tokens
    ) VALUES (
      ${userId}, ${USAGE_KINDS.includes(kind) ? kind : "other"}, ${model},
      ${count(usage?.input_tokens)}, ${count(usage?.output_tokens)},
      ${count(usage?.cache_creation_input_tokens)}, ${count(usage?.cache_read_input_tokens)}
    )
  `;
}
