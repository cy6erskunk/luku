/**
 * The columns a grade writes, and the only ones its reply carries.
 *
 * In lib/shared/ because both sides of /api/reviews need the same list: the
 * route projects its reply through it and useWords.applySchedule merges
 * through it, so the two cannot disagree. A column added to gradeWord's
 * UPDATE (lib/reviews.js) that the browser should see is added here. No
 * imports, per lib/shared/'s rule.
 */
export const SCHEDULE_FIELDS = ["ease_factor", "interval_days", "next_review_at", "review_count"];

/**
 * A grade's reply cut down to the word's id and its schedule. A field missing
 * from `row` is left out rather than set to undefined, so merging the result
 * never blanks a value the reply did not carry.
 */
export function pickSchedule(row) {
  const out = { id: row.id };
  for (const f of SCHEDULE_FIELDS) if (f in row) out[f] = row[f];
  return out;
}
