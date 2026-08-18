/**
 * Signed inline-keyboard callback data.
 *
 * callback_data is client-supplied and replayable: Telegram retries undelivered
 * updates, and nothing stops a user scrolling up and tapping a week-old card's
 * "Easy" button. Each card's buttons therefore carry an HMAC over the card's
 * *current* schedule, so grading a card invalidates its own buttons.
 */
import { createHash, createHmac } from "node:crypto";
import { timingSafeEqualHex } from "./link.js";

export const ACTION_SHOW = "s";
export const ACTION_GRADE = "g";
export const ACTION_STOP = "x";
export const ACTION_REVIEW = "r";

const SIG_LENGTH = 12;

function callbackKey() {
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!secret) throw new Error("TELEGRAM_WEBHOOK_SECRET is not set");
  return createHash("sha256").update(`${secret}|cb`).digest();
}

/** Identifies the exact card state the buttons were rendered for. */
function cardFingerprint(chatId, word) {
  const dueMs = new Date(word.next_review_at).getTime();
  return `${chatId}|${word.id}|${dueMs}`;
}

export function signCard(chatId, word) {
  return createHmac("sha256", callbackKey()).update(cardFingerprint(chatId, word)).digest("hex").slice(0, SIG_LENGTH);
}

export function verifyCard(sig, chatId, word) {
  if (typeof sig !== "string" || sig.length !== SIG_LENGTH) return false;
  return timingSafeEqualHex(sig, signCard(chatId, word));
}

export function showData(chatId, word) {
  return `${ACTION_SHOW}:${word.id}:${signCard(chatId, word)}`;
}

export function gradeData(chatId, word, grade) {
  return `${ACTION_GRADE}:${grade}:${word.id}:${signCard(chatId, word)}`;
}

/**
 * Parses callback_data into a normalized shape, or null when it is malformed.
 * Telegram caps callback_data at 64 bytes, which every form here stays inside.
 */
export function parseCallback(data) {
  if (typeof data !== "string" || data.length === 0 || data.length > 64) return null;
  const parts = data.split(":");

  switch (parts[0]) {
    case ACTION_SHOW: {
      const [, wordId, sig] = parts;
      if (parts.length !== 3) return null;
      const id = Number(wordId);
      if (!Number.isSafeInteger(id)) return null;
      return { action: ACTION_SHOW, wordId: id, sig };
    }
    case ACTION_GRADE: {
      const [, grade, wordId, sig] = parts;
      if (parts.length !== 4) return null;
      const g = Number(grade);
      const id = Number(wordId);
      if (!Number.isSafeInteger(g) || !Number.isSafeInteger(id)) return null;
      return { action: ACTION_GRADE, grade: g, wordId: id, sig };
    }
    case ACTION_STOP:
      return parts.length === 1 ? { action: ACTION_STOP } : null;
    case ACTION_REVIEW:
      return parts.length === 1 ? { action: ACTION_REVIEW } : null;
    default:
      return null;
  }
}
