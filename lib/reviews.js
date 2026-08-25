/**
 * Shared review data access.
 *
 * Used by both the web app (app/api/reviews/route.js) and the Telegram bot, so
 * that a card graded in the chat and a card graded in the browser move the same
 * SRS state through the same code path.
 */
import { calcSRS } from "./srs.js";

/** Grades accepted by the review UI: Again / Hard / Easy. */
export const GRADES = [1, 3, 5];

export function isValidGrade(grade) {
  return GRADES.includes(grade);
}

/** words.id is SERIAL, so anything past int4 range errors in Postgres rather
 *  than simply not matching — reject it here as a 400 instead of a 500. */
export const MAX_WORD_ID = 2147483647;

export function isValidWordId(wordId) {
  return Number.isSafeInteger(wordId) && wordId > 0 && wordId <= MAX_WORD_ID;
}

export async function countDueWords(sql, userId) {
  const rows = await sql`
    SELECT count(*)::int AS count FROM words
    WHERE user_id = ${userId} AND next_review_at <= NOW()
  `;
  return rows[0]?.count ?? 0;
}

export async function listDueWords(sql, userId, limit = 50) {
  return sql`
    SELECT * FROM words
    WHERE user_id = ${userId} AND next_review_at <= NOW()
    ORDER BY next_review_at ASC
    LIMIT ${limit}
  `;
}

/** The single most-overdue card, or null when nothing is due. */
export async function nextDueWord(sql, userId) {
  const rows = await listDueWords(sql, userId, 1);
  return rows[0] ?? null;
}

export async function getWord(sql, userId, wordId) {
  const rows = await sql`
    SELECT * FROM words WHERE id = ${wordId} AND user_id = ${userId}
  `;
  return rows[0] ?? null;
}

/**
 * The schedule a caller saw, as a value Postgres can be asked to match.
 *
 * TIMESTAMPTZ keeps microseconds; a JS Date keeps milliseconds. The driver
 * truncates on the way out and sends milliseconds back on the way in, so the
 * value a caller read from a row is *not* equal to the row — a word still
 * carrying Postgres' own NOW() from `DEFAULT NOW()` (every word before its
 * first review) can never match itself. Milliseconds are therefore the only
 * resolution both sides share, and the resolution the compare-and-swap below
 * has to work at. It is also what the Telegram callback signature covers
 * (lib/telegram/callback.js hashes `Date.getTime()`), so the two guards agree.
 */
function scheduleGuard(value) {
  const at = value instanceof Date ? value : new Date(value);
  return Number.isNaN(at.getTime()) ? null : at.toISOString();
}

/**
 * Apply a grade to a card and persist the new schedule.
 * Returns the updated row, or null when the word doesn't exist for this user.
 */
export async function gradeWord(sql, userId, wordId, grade, { expectedNextReviewAt } = {}) {
  const card = await getWord(sql, userId, wordId);
  if (!card) return null;

  const { ease_factor, interval_days, next_review_at, review_count } = calcSRS(card, grade);

  // Compare-and-swap on the schedule this grade was computed from. The HTTP
  // driver has no transactions, so the read above cannot be held against the
  // write below; guarding on next_review_at is what makes a duplicate delivery
  // lose — the second update matches zero rows instead of grading twice.
  const guard = scheduleGuard(expectedNextReviewAt ?? card.next_review_at);
  // Only an unparseable caller-supplied guard gets here; the column is NOT NULL.
  if (!guard) return null;

  const rows = await sql`
    UPDATE words SET
      ease_factor    = ${ease_factor},
      interval_days  = ${interval_days},
      next_review_at = ${next_review_at},
      review_count   = ${review_count}
    WHERE id = ${wordId} AND user_id = ${userId}
      AND date_trunc('milliseconds', next_review_at) = ${guard}::timestamptz
    RETURNING *
  `;
  // Null now means "gone or already graded by a concurrent delivery"; callers
  // report both as the card having moved on.
  return rows[0] ?? null;
}
