/**
 * Simplified SM-2 spaced repetition algorithm.
 * grade: 1 = Again (fail), 3 = Hard, 5 = Easy
 */
export function calcSRS(card, grade) {
  let { ease_factor = 2.5, interval_days = 0, review_count = 0 } = card;

  if (grade < 3) {
    // Failed — reset to beginning
    interval_days = 1;
    review_count = 0;
  } else if (review_count === 0) {
    interval_days = 1;
    review_count = 1;
  } else if (review_count === 1) {
    interval_days = 6;
    review_count = 2;
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
