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

export function isValidWordId(wordId) {
  return Number.isSafeInteger(wordId) && wordId > 0;
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
 * Apply a grade to a card and persist the new schedule.
 * Returns the updated row, or null when the word doesn't exist for this user.
 */
export async function gradeWord(sql, userId, wordId, grade) {
  const card = await getWord(sql, userId, wordId);
  if (!card) return null;

  const { ease_factor, interval_days, next_review_at, review_count } = calcSRS(card, grade);

  const rows = await sql`
    UPDATE words SET
      ease_factor    = ${ease_factor},
      interval_days  = ${interval_days},
      next_review_at = ${next_review_at},
      review_count   = ${review_count}
    WHERE id = ${wordId} AND user_id = ${userId}
    RETURNING *
  `;
  return rows[0] ?? null;
}
