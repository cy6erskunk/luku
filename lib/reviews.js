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

/**
 * Cards not due yet but due within `minutes` — in practice the ones just
 * failed, which Again schedules a few minutes out. A session that runs out of
 * due cards says these are coming rather than that nothing is left today.
 */
export async function countDueWithin(sql, userId, minutes) {
  const rows = await sql`
    SELECT count(*)::int AS count FROM words
    WHERE user_id = ${userId} AND next_review_at > NOW()
      AND next_review_at <= NOW() + (${minutes} || ' minutes')::interval
  `;
  return rows[0]?.count ?? 0;
}

/**
 * How long a failed card counts as failed "in this sitting" — long enough to
 * cover the AGAIN_DELAY_MINUTES it waits plus a slow session after it, short
 * enough that a card failed yesterday and never touched since is back among
 * the rest.
 */
export const SITTING_MINUTES = 60;

/**
 * Due cards in random order, apart from cards failed in this sitting, which
 * come last and in the order they were failed.
 *
 * Random, because cards graded in one sitting are scheduled seconds apart and
 * so come due together, in the same order, review after review; oldest-first
 * replayed that order every time. Drawing at random each turn is still a
 * proper shuffle without any stored session: a graded card leaves the due set,
 * so nothing is drawn twice.
 *
 * A just-failed card is recognised from what Again writes — interval_days 0
 * and one more lapse, due AGAIN_DELAY_MINUTES out — and held back so it comes
 * round once the rest are answered, as it did under oldest-first. A card that
 * has never been graded also has interval_days 0, but no lapse. Its
 * next_review_at is the failure time plus the delay, so ordering on it keeps
 * failures in the order they happened.
 */
export async function listDueWords(sql, userId, limit = 50) {
  return sql`
    SELECT * FROM words
    WHERE user_id = ${userId} AND next_review_at <= NOW()
    ORDER BY
      CASE
        WHEN interval_days = 0 AND lapses > 0
          AND next_review_at > NOW() - (${SITTING_MINUTES} || ' minutes')::interval
        THEN next_review_at
      END ASC NULLS FIRST,
      random()
    LIMIT ${limit}
  `;
}

/** One due card, drawn as listDueWords orders them, or null when nothing is due. */
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

  const { ease_factor, interval_days, next_review_at, review_count, lapses } = calcSRS(card, grade);

  // Compare-and-swap on the schedule this grade was computed from. The HTTP
  // driver has no transactions, so the read above cannot be held against the
  // write below; guarding on next_review_at is what makes a duplicate delivery
  // lose — the second update matches zero rows instead of grading twice.
  const guard = scheduleGuard(expectedNextReviewAt ?? card.next_review_at);
  // Only an unparseable caller-supplied guard gets here; the column is NOT NULL.
  if (!guard) return null;

  // The whole row comes back for the bot's receipt. The browser gets only the
  // columns in lib/shared/schedule.js, so a column added to this SET that the
  // browser should see goes in that list too — `lapses` included, because the
  // word list is loaded with `SELECT *` and so already holds that column; a
  // grade that did not return it would leave the cached copy one behind. The
  // compare-and-swap below is also what stops a duplicate delivery counting
  // one failure twice.
  const rows = await sql`
    UPDATE words SET
      ease_factor    = ${ease_factor},
      interval_days  = ${interval_days},
      next_review_at = ${next_review_at},
      review_count   = ${review_count},
      lapses         = ${lapses}
    WHERE id = ${wordId} AND user_id = ${userId}
      AND date_trunc('milliseconds', next_review_at) = ${guard}::timestamptz
    RETURNING *
  `;
  // Null now means "gone or already graded by a concurrent delivery"; callers
  // report both as the card having moved on.
  return rows[0] ?? null;
}
