/**
 * Simplified SM-2 spaced repetition algorithm.
 * grade: 1 = Again (fail), 3 = Hard, 5 = Easy
 */

/**
 * Growth applied to a card answered "Hard". Plain SM-2 has no separate Hard
 * step — every passing grade multiplies by the ease factor, so a card the user
 * keeps struggling with still reaches months-long intervals in a handful of
 * reviews. Growing hard cards by a small fixed factor instead keeps them in
 * circulation while the ease factor decays.
 */
const HARD_FACTOR = 1.2;

/** Second-review interval, in days: shorter for Hard than for Easy. */
const SECOND_INTERVAL_EASY = 6;
const SECOND_INTERVAL_HARD = 3;

/**
 * The ease factor a card starts at. Exported because four places have to agree
 * on it: the fallback below, the `difficult` filter in lib/words.js, the text
 * lib/mcp/instructions.js hands an MCP client, and the schema's own DEFAULT.
 *
 * It is *not* a marker for "never graded", however much it looks like one. A
 * card can accumulate back onto it: easy answers add 0.1 and hard ones take
 * 0.14, so seven easy per five hard cancels exactly, and Easy, Hard, Easy,
 * Hard, Easy, Hard, Easy, Easy, Easy, Hard, Easy, Hard leaves a twelve-review
 * card sitting here. All `ease_factor < DEFAULT_EASE_FACTOR` means is "has
 * lost ground overall", which is the only claim anything should make of it.
 */
export const DEFAULT_EASE_FACTOR = 2.5;

/** Below this a card would grow its interval barely at all, so SM-2 clamps. */
export const MIN_EASE_FACTOR = 1.3;

/**
 * How much one grade moves the ease factor, before clamping: +0.1 for Easy,
 * -0.14 for Hard, -0.54 for Again.
 *
 * SM-2's own expression, named so it can be *quoted* rather than restated:
 * lib/mcp/instructions.js interpolates easeDelta(1|3|5) into the text it hands
 * an MCP client, so tuning the algorithm updates its own documentation instead
 * of silently making that text a lie. calcSRS keeps the arithmetic inline for
 * the float reason noted there, and a test holds the two in step.
 */
export function easeDelta(grade) {
  return 0.1 - (5 - grade) * (0.08 + (5 - grade) * 0.02);
}

export function calcSRS(card, grade) {
  // Postgres FLOAT/INT columns can arrive as strings depending on the driver's
  // type parsers, and `"2.5" + 0.1` would concatenate rather than add.
  let ease_factor = Number(card.ease_factor ?? DEFAULT_EASE_FACTOR);
  let interval_days = Number(card.interval_days ?? 0);
  let review_count = Number(card.review_count ?? 0);

  if (grade < 3) {
    // Failed — reset to beginning
    interval_days = 1;
    review_count = 0;
  } else if (review_count === 0) {
    interval_days = 1;
    review_count = 1;
  } else if (review_count === 1) {
    interval_days = grade === 3 ? SECOND_INTERVAL_HARD : SECOND_INTERVAL_EASY;
    review_count = 2;
  } else if (grade === 3) {
    // Always at least one day further out, so a 1-day card still advances.
    interval_days = Math.max(interval_days + 1, Math.round(interval_days * HARD_FACTOR));
    review_count += 1;
  } else {
    interval_days = Math.round(interval_days * ease_factor);
    review_count += 1;
  }

  // Clamp ease factor to its floor.
  //
  // Spelled out rather than calling easeDelta(): `(ef + 0.1) - penalty` and
  // `ef + (0.1 - penalty)` disagree in the last bit of a float for about a
  // third of inputs, and there is no reason to shift values already stored in
  // the column for a tidier line. lib/__tests__/srs.test.js holds the two
  // expressions in step instead.
  ease_factor = Math.max(
    MIN_EASE_FACTOR,
    ease_factor + 0.1 - (5 - grade) * (0.08 + (5 - grade) * 0.02)
  );

  const next_review_at = new Date(Date.now() + interval_days * 24 * 60 * 60 * 1000);

  return { ease_factor, interval_days, next_review_at, review_count };
}
