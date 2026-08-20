/**
 * Flashcard rendering for the chat.
 *
 * Mirrors the card in app/components/ReviewStage.jsx: base form and example on
 * the front, part of speech, translations, example translation and the
 * inflections seen while scanning on the back.
 *
 * Pure — every function returns { text, ...extra } ready to hand to sendMessage.
 */
import { gradeData, showData, ACTION_LATER, ACTION_REVIEW, ACTION_STOP } from "./callback.js";

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
 * A DATE column as YYYY-MM-DD. The driver returns these as a string on some
 * paths and as a Date on others, and both have to compare against a local date.
 */
function dateOnly(value) {
  if (!value) return null;
  return value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10);
}

/**
 * Local hour and calendar date in an IANA zone, or null when the zone is
 * unusable — same defensive reason as localTimeIn above.
 */
function zoneNow(timezone, now) {
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
    }).formatToParts(now);
    const get = (type) => parts.find((p) => p.type === type)?.value;
    return { hour: Number(get("hour")), date: `${get("year")}-${get("month")}-${get("day")}` };
  } catch {
    return null;
  }
}

/**
 * When the reminder cron will next reach this user, in the same terms
 * lib/telegram/reminders.js selects them: their local hour has to have reached
 * reminder_hour, and their local date has to be past last_reminded_on.
 *
 * "today" and "tomorrow" mean the reminder hour on that day; "soon" is the
 * window where today's reminder is already owed but the hourly pass has not run
 * yet. Null when the stored zone is unusable.
 */
export function nextReminderDay(link, { now = new Date() } = {}) {
  const local = zoneNow(link.timezone || "Europe/Helsinki", now);
  if (!local || !Number.isFinite(local.hour)) return null;

  if (dateOnly(link.last_reminded_on) === local.date) return "tomorrow";
  return local.hour < (link.reminder_hour ?? 9) ? "today" : "soon";
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

  const stamp = dateOnly(link.last_reminded_on);
  if (stamp) lines.push(`📮 Last reminded: ${stamp}`);

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
 * One line placing the next reminder, so a session that ends — by choice or by
 * running out of cards — says when the bot will speak up again. Reminders only
 * go out when something is due, so with an empty queue the standing schedule is
 * all this can honestly promise.
 */
export function reminderLine(link, { due = 0, now = new Date() } = {}) {
  if (!link?.reminders_enabled) return "⏰ Reminders are paused — /resume to turn them back on.";

  const hour = formatHour(link.reminder_hour ?? 9);
  const timezone = link.timezone || "Europe/Helsinki";
  if (due === 0) return `⏰ Reminders on, daily at ${hour} ${timezone} time — whenever something is due.`;

  const day = nextReminderDay(link, { now });
  if (!day) return `⏰ Reminders on, daily at ${hour}.`;
  if (day === "soon") return "⏰ Next reminder: within the hour.";
  return `⏰ Next reminder: ${day} at ${hour} ${timezone} time.`;
}

/**
 * Replaces the card when the user taps Stop: the message the button was
 * attached to becomes the closing summary, which is what takes the word being
 * reviewed off the screen. `later` covers the reminder's Later button, where no
 * session was under way to stop.
 */
export function sessionStopped(link, { due = 0, later = false, now = new Date() } = {}) {
  const lines = [later ? "👍 Later, then." : "⏹ Review stopped.", ""];

  lines.push(due > 0 ? `📚 ${due} ${due === 1 ? "word is" : "words are"} still due.` : "✓ Nothing else is due right now.");
  lines.push(reminderLine(link, { due, now }));

  if (due === 0) return { text: lines.join("\n") };

  return {
    text: lines.join("\n"),
    reply_markup: {
      inline_keyboard: [[{ text: later ? "Start review" : "Resume review", callback_data: ACTION_REVIEW }]],
    },
  };
}

/**
 * Shown after the last due card is graded. The session has no stored state, so
 * there is no card count to report — the queue is simply empty now.
 */
export function sessionComplete(link, { now = new Date() } = {}) {
  const lines = ["🎉 Session complete — nothing else is due today."];
  if (link) lines.push("", reminderLine(link, { due: 0, now }));
  return { text: lines.join("\n") };
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
        { text: "Later", callback_data: ACTION_LATER },
      ]],
    },
  };
}
