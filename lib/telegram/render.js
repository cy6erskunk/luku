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

/**
 * Telegram rejects sendMessage over 4096 characters. base, example and
 * translations are unbounded TEXT and forms grows with every scan, so an
 * oversized card would fail to send, stay due, and wedge the session on it
 * forever. Bounding each field keeps the assembled message comfortably inside
 * the limit without ever cutting through an HTML tag.
 */
const LIMITS = {
  base: 120,
  pos: 40,
  example: 400,
  translation: 120,
  translations: 6,
  formWord: 60,
  formTranslation: 100,
  forms: 8,
};

function clip(value, max) {
  const text = String(value ?? "");
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

/** Telegram renders raw text; only these three characters need escaping in HTML mode. */
export function escapeHtml(value) {
  return String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function forms(word) {
  return Array.isArray(word?.forms) ? word.forms.slice(0, LIMITS.forms) : [];
}

function keyboard(rows) {
  return { parse_mode: "HTML", reply_markup: { inline_keyboard: rows } };
}

export function cardFront(chatId, word, { remaining } = {}) {
  const lines = [`🇫🇮 <b>${escapeHtml(clip(word.base, LIMITS.base))}</b>`];
  if (word.example) lines.push("", `<i>${escapeHtml(clip(word.example, LIMITS.example))}</i>`);
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
  const lines = [`🇫🇮 <b>${escapeHtml(clip(word.base, LIMITS.base))}</b>`];
  if (word.example) lines.push("", `<i>${escapeHtml(clip(word.example, LIMITS.example))}</i>`);

  lines.push("", "———");
  if (word.pos) lines.push(`<i>${escapeHtml(clip(word.pos, LIMITS.pos))}</i>`);

  const translations = (Array.isArray(word.translations) ? word.translations : []).slice(0, LIMITS.translations);
  if (translations.length > 0) {
    lines.push(`<b>${escapeHtml(clip(translations[0], LIMITS.translation))}</b>`);
    for (const t of translations.slice(1)) lines.push(escapeHtml(clip(t, LIMITS.translation)));
  }
  if (word.example_translation) {
    lines.push("", `<i>${escapeHtml(clip(word.example_translation, LIMITS.example))}</i>`);
  }

  const seen = forms(word);
  if (seen.length > 0) {
    lines.push("", "<i>seen in text:</i>");
    for (const f of seen) {
      const w = escapeHtml(clip(f.word, LIMITS.formWord));
      lines.push(f.translation ? `· ${w} — ${escapeHtml(clip(f.translation, LIMITS.formTranslation))}` : `· ${w}`);
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

export function formatHour(hour) {
  return `${String(hour).padStart(2, "0")}:00`;
}

/**
 * Current wall-clock time in an IANA zone, or null when the zone is unusable.
 * isValidTimezone() guards new values, but a row written before that check — or
 * a zone this Node build lacks data for — must not take the command down.
 */
function localTimeIn(timezone, now) {
  try {
    return new Intl.DateTimeFormat("en-GB", {
      timeZone: timezone,
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(now);
  } catch {
    return null;
  }
}

/**
 * Reminder schedule as it currently stands. Naming the zone is not enough to
 * tell whether it is the *right* zone, so the current time there is shown
 * alongside it — that is what makes a wrong default obvious.
 */
export function settings(link, { now = new Date() } = {}) {
  const lines = [];

  // Both columns are NOT NULL with these defaults in db/schema.sql, so the
  // fallbacks only matter for a partially-built row — but "undefined:00" must
  // never reach a user.
  const hour = link.reminder_hour ?? 9;
  const timezone = link.timezone || "Europe/Helsinki";

  lines.push(
    link.reminders_enabled
      ? `⏰ Reminders on — daily at ${formatHour(hour)}`
      : "⏰ Reminders are paused — /resume to turn them back on"
  );

  const localTime = localTimeIn(timezone, now);
  lines.push(`🌍 ${escapeHtml(timezone)}${localTime ? ` — ${localTime} there right now` : ""}`);

  if (link.last_reminded_on) {
    const stamp = link.last_reminded_on instanceof Date
      ? link.last_reminded_on.toISOString().slice(0, 10)
      : String(link.last_reminded_on).slice(0, 10);
    lines.push(`📮 Last reminded: ${stamp}`);
  }

  lines.push("");
  lines.push(
    link.reminders_enabled
      ? "Change with /settime 9 or /settz Europe/Berlin · /pause to stop"
      : "Change with /settime 9 or /settz Europe/Berlin"
  );

  return { text: lines.join("\n"), parse_mode: "HTML" };
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
    text: `✓ <b>${escapeHtml(clip(word.base, LIMITS.base))}</b> · ${GRADE_LABELS[grade] ?? grade} · ${formatInterval(word.interval_days)}`,
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
