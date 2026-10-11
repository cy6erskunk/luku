/**
 * Word *content* — the columns that describe what a word means, as opposed to
 * when it is next due.
 *
 * The limits live here rather than in the route that enforces them so a second
 * caller cannot arrive with its own copy: two versions of `isExampleText` with
 * different caps would let one path store what the other refuses.
 */

/** Longer than any example worth keeping; a cap so a body cannot store an essay. */
export const MAX_EXAMPLE = 500;
export const isExampleText = (v) => typeof v === "string" && v.trim() !== "" && v.length <= MAX_EXAMPLE;

/**
 * An example's translation may be cleared, so `null` is a value here rather
 * than an absence. Whether the field was supplied at all is decided by the
 * caller, before this is reached.
 */
export const isExampleTranslation = (v) =>
  v === null || (typeof v === "string" && v.length <= MAX_EXAMPLE);
