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

export function calcSRS(card, grade) {
  // Postgres FLOAT/INT columns can arrive as strings depending on the driver's
  // type parsers, and `"2.5" + 0.1` would concatenate rather than add.
  let ease_factor = Number(card.ease_factor ?? 2.5);
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

  // Clamp ease factor to minimum 1.3
  ease_factor = Math.max(
    1.3,
    ease_factor + 0.1 - (5 - grade) * (0.08 + (5 - grade) * 0.02)
  );

  const next_review_at = new Date(Date.now() + interval_days * 24 * 60 * 60 * 1000);

  return { ease_factor, interval_days, next_review_at, review_count };
}
