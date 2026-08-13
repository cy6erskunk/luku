/**
 * Flashcard rendering for the chat.
 *
 * Mirrors the card in app/components/ReviewStage.jsx: base form and example on
 * the front, part of speech, translations, example translation and the
 * inflections seen while scanning on the back.
 *
 * Pure — every function returns { text, ...extra } ready to hand to sendMessage.
 */
import { gradeData, showData, ACTION_REVIEW, ACTION_STOP } from "./callback.js";

/** Telegram renders raw text; only these three characters need escaping in HTML mode. */
export function escapeHtml(value) {
  return String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function forms(word) {
  return Array.isArray(word?.forms) ? word.forms : [];
}

function keyboard(rows) {
  return { parse_mode: "HTML", reply_markup: { inline_keyboard: rows } };
}

export function cardFront(chatId, word, { remaining } = {}) {
  const lines = [`🇫🇮 <b>${escapeHtml(word.base)}</b>`];
  if (word.example) lines.push("", `<i>${escapeHtml(word.example)}</i>`);
  if (remaining > 0) lines.push("", `<i>${remaining} more after this</i>`);

  return {
    text: lines.join("\n"),
    ...keyboard([
      [{ text: "Show answer", callback_data: showData(chatId, word) }],
      [{ text: "Stop", callback_data: ACTION_STOP }],
    ]),
  };
}

export function cardBack(chatId, word) {
  const lines = [`🇫🇮 <b>${escapeHtml(word.base)}</b>`];
  if (word.example) lines.push("", `<i>${escapeHtml(word.example)}</i>`);

  lines.push("", "———");
  if (word.pos) lines.push(`<i>${escapeHtml(word.pos)}</i>`);

  const translations = Array.isArray(word.translations) ? word.translations : [];
  if (translations.length > 0) {
    lines.push(`<b>${escapeHtml(translations[0])}</b>`);
    for (const t of translations.slice(1)) lines.push(escapeHtml(t));
  }
  if (word.example_translation) lines.push("", `<i>${escapeHtml(word.example_translation)}</i>`);

  const seen = forms(word);
  if (seen.length > 0) {
    lines.push("", "<i>seen in text:</i>");
    for (const f of seen) {
      lines.push(f.translation ? `· ${escapeHtml(f.word)} — ${escapeHtml(f.translation)}` : `· ${escapeHtml(f.word)}`);
    }
  }

  return {
    text: lines.join("\n"),
    ...keyboard([
      [
        { text: "Again", callback_data: gradeData(chatId, word, 1) },
        { text: "Hard", callback_data: gradeData(chatId, word, 3) },
        { text: "Easy", callback_data: gradeData(chatId, word, 5) },
      ],
    ]),
  };
}

const GRADE_LABELS = { 1: "Again", 3: "Hard", 5: "Easy" };

export function formatInterval(days) {
  const d = Number(days);
  if (!Number.isFinite(d) || d < 1) return "today";
  if (d === 1) return "tomorrow";
  if (d < 30) return `in ${Math.round(d)}d`;
  const months = Math.round(d / 30);
  return months === 1 ? "in 1mo" : `in ${months}mo`;
}

/** Replaces a graded card's message, leaving a compact receipt and no buttons. */
export function receipt(word, grade) {
  return {
    text: `✓ <b>${escapeHtml(word.base)}</b> · ${GRADE_LABELS[grade] ?? grade} · ${formatInterval(word.interval_days)}`,
    parse_mode: "HTML",
  };
}

/**
 * Shown after the last due card is graded. The session has no stored state, so
 * there is no card count to report — the queue is simply empty now.
 */
export function sessionComplete() {
  return { text: "🎉 Session complete — nothing else is due today." };
}

export function allCaughtUp(totalWords) {
  const lines = ["✓ All caught up — nothing due right now."];
  if (totalWords > 0) lines.push("", `You have ${totalWords} ${totalWords === 1 ? "word" : "words"} saved.`);
  return { text: lines.join("\n") };
}

export function dueSummary(count) {
  if (count === 0) return allCaughtUp(0);
  return {
    text: `📚 ${count} ${count === 1 ? "word is" : "words are"} due.`,
    reply_markup: { inline_keyboard: [[{ text: "Start review", callback_data: ACTION_REVIEW }]] },
  };
}

export function reminder(count) {
  return {
    text: `📚 ${count} ${count === 1 ? "word is" : "words are"} due in Luku.`,
    reply_markup: {
      inline_keyboard: [[
        { text: "Start review", callback_data: ACTION_REVIEW },
        { text: "Later", callback_data: ACTION_STOP },
      ]],
    },
  };
}
