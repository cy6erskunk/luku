/**
 * Update routing for the Telegram bot.
 *
 * Authentication happened before we got here: the webhook route verified
 * Telegram's secret token, so `from.id` is asserted by Telegram rather than by
 * the sender. Everything below treats it as a lookup key and scopes each query
 * by the Luku user it resolves to.
 */
import { getDb } from "../db.js";
import { countDueWords, getWord, gradeWord, isValidGrade, nextDueWord } from "../reviews.js";
import { answerCallbackQuery, editMessageText, sendMessage } from "./api.js";
import {
  ACTION_GRADE,
  ACTION_REVIEW,
  ACTION_SHOW,
  ACTION_STOP,
  parseCallback,
  verifyCard,
} from "./callback.js";
import {
  consumeLinkCode,
  createLink,
  deleteLinkByTelegramId,
  getLinkByTelegramId,
  isValidReminderHour,
  isValidTimezone,
  touchLink,
  updateLinkSettings,
} from "./link.js";
import {
  allCaughtUp,
  cardBack,
  cardFront,
  dueSummary,
  formatHour,
  receipt,
  sessionComplete,
  settings,
} from "./render.js";

export function appUrl() {
  return process.env.APP_URL || "https://luku.app";
}

/** Splits "/start@LukuBot payload" into its command and argument. */
export function parseCommand(text) {
  if (typeof text !== "string") return { command: null, arg: null };
  const trimmed = text.trim();
  if (!trimmed.startsWith("/")) return { command: null, arg: null };

  const [head, ...rest] = trimmed.split(/\s+/);
  const command = head.split("@")[0].toLowerCase();
  return { command, arg: rest.join(" ") || null };
}

const HELP_LINES = [
  "Luku — Finnish vocabulary review",
  "",
  "/review — start a review session",
  "/due — how many words are waiting",
  "/pause — stop daily reminders",
  "/resume — start them again",
  "/settings — your reminder schedule",
  "/settime 21 — reminder hour, your local time",
  "/settz Europe/Helsinki — set your timezone",
  "/disconnect — unlink this chat from your Luku account",
  "/help — this message",
];

export function helpText() {
  return HELP_LINES.join("\n");
}

export function connectPrompt() {
  return [
    "This chat isn't connected to a Luku account yet.",
    "",
    `Open ${appUrl()}, sign in, and tap the Telegram button to connect.`,
  ].join("\n");
}

/** Postgres unique_violation — the Luku account is already linked elsewhere. */
function isUniqueViolation(e) {
  return e?.code === "23505" || /duplicate key|unique constraint/i.test(e?.message ?? "");
}

async function accountEmail(sql, userId) {
  try {
    const rows = await sql`SELECT email FROM neon_auth.users_sync WHERE id = ${userId}`;
    return rows[0]?.email ?? null;
  } catch {
    // The confirmation is nicer with an email but must not fail without one.
    return null;
  }
}

async function handleLinkCommand(sql, { chatId, telegramUserId, username, code }) {
  const userId = await consumeLinkCode(sql, code);
  if (!userId) {
    return sendMessage(
      chatId,
      `That connection link has expired or was already used.\n\nOpen ${appUrl()} and tap Connect Telegram again.`
    );
  }

  let link;
  try {
    link = await createLink(sql, { telegramUserId, userId, chatId, username });
  } catch (e) {
    if (isUniqueViolation(e)) {
      return sendMessage(
        chatId,
        "That Luku account is already connected to a different Telegram account. Send /disconnect from that chat first, then try again."
      );
    }
    throw e;
  }

  const email = await accountEmail(sql, userId);

  // State the schedule now, while the user is paying attention: the defaults are
  // 09:00 Europe/Helsinki, and this is the cheapest moment to notice that is wrong.
  const schedule = link ? settings(link).text : null;

  const confirmation = [`✅ Connected${email ? ` to ${email}` : ""}.`];
  if (schedule) confirmation.push("", schedule);
  confirmation.push("", "Send /review to start a session now, or /help for everything else.");

  return sendMessage(chatId, confirmation.join("\n"), { parse_mode: "HTML" });
}

/**
 * Sends the next due card, or a closing message when the queue is empty.
 * The queue is derived from SQL each turn rather than stored: grading pushes a
 * card at least a day out, so it leaves the due set on its own.
 */
async function sendNextCard(sql, chatId, userId, { justGraded = false } = {}) {
  const word = await nextDueWord(sql, userId);
  if (!word) {
    const done = justGraded ? sessionComplete() : allCaughtUp(await countWords(sql, userId));
    return sendMessage(chatId, done.text, done);
  }

  const remaining = (await countDueWords(sql, userId)) - 1;
  const card = cardFront(chatId, word, { remaining });
  return sendMessage(chatId, card.text, card);
}

async function countWords(sql, userId) {
  const rows = await sql`SELECT count(*)::int AS count FROM words WHERE user_id = ${userId}`;
  return rows[0]?.count ?? 0;
}

async function handleShow(sql, { chatId, messageId, link, wordId, sig, callbackId }) {
  const word = await getWord(sql, link.user_id, wordId);
  if (!word || !verifyCard(sig, chatId, word)) {
    return answerCallbackQuery(callbackId, "This card has moved on.");
  }

  const back = cardBack(chatId, word);
  await editMessageText(chatId, messageId, back.text, back);
  return answerCallbackQuery(callbackId);
}

async function handleGrade(sql, { chatId, messageId, link, wordId, grade, sig, callbackId }) {
  if (!isValidGrade(grade)) return answerCallbackQuery(callbackId, "Unknown grade.");

  const word = await getWord(sql, link.user_id, wordId);
  // The signature covers the card's current schedule, so a replayed retry or a
  // tap on an older message fails here rather than grading the card twice.
  if (!word || !verifyCard(sig, chatId, word)) {
    return answerCallbackQuery(callbackId, "This card has moved on.");
  }

  const updated = await gradeWord(sql, link.user_id, wordId, grade);
  if (!updated) return answerCallbackQuery(callbackId, "That word is gone.");

  const done = receipt(updated, grade);
  await editMessageText(chatId, messageId, done.text, done);
  await answerCallbackQuery(callbackId);

  return sendNextCard(sql, chatId, link.user_id, { justGraded: true });
}

async function handleCallback(query) {
  const chatId = query.message?.chat?.id;
  const telegramUserId = query.from?.id;
  if (!chatId || !telegramUserId) return;

  const parsed = parseCallback(query.data);
  if (!parsed) return answerCallbackQuery(query.id);

  const sql = getDb();
  const link = await getLinkByTelegramId(sql, telegramUserId);
  if (!link) {
    await answerCallbackQuery(query.id);
    return sendMessage(chatId, connectPrompt());
  }

  const common = { chatId, messageId: query.message.message_id, link, callbackId: query.id };

  switch (parsed.action) {
    case ACTION_SHOW:
      return handleShow(sql, { ...common, wordId: parsed.wordId, sig: parsed.sig });
    case ACTION_GRADE:
      return handleGrade(sql, { ...common, wordId: parsed.wordId, grade: parsed.grade, sig: parsed.sig });
    case ACTION_REVIEW:
      await answerCallbackQuery(query.id);
      return sendNextCard(sql, chatId, link.user_id);
    case ACTION_STOP:
      return answerCallbackQuery(query.id, "Stopped. Send /review when you're ready.");
    default:
      return answerCallbackQuery(query.id);
  }
}

async function handleMessage(message) {
  // Group chats would let one member review another's vocabulary; private only.
  if (message.chat?.type !== "private") return;
  const chatId = message.chat.id;
  const telegramUserId = message.from?.id;
  if (!telegramUserId) return;

  const { command, arg } = parseCommand(message.text);

  // Answered before any database access, which makes /help a clean isolation
  // test: it exercises the webhook secret, the bot token and sendMessage and
  // nothing else. getDb() would throw here on a missing DATABASE_URL.
  if (command === "/help") return sendMessage(chatId, helpText());

  const sql = getDb();

  // Linking is the one thing that works without an existing link.
  if ((command === "/start" || command === "/link") && arg) {
    return handleLinkCommand(sql, { chatId, telegramUserId, username: message.from.username, code: arg });
  }

  const link = await getLinkByTelegramId(sql, telegramUserId);
  if (!link) return sendMessage(chatId, connectPrompt());

  await touchLink(sql, telegramUserId);

  switch (command) {
    case "/start":
      return sendMessage(chatId, "You're already connected. Send /review to start a session, or /help to see everything.");

    case "/settings": {
      // No extra query: `link` already carries every field this renders.
      const current = settings(link);
      return sendMessage(chatId, current.text, current);
    }

    case "/review":
      return sendNextCard(sql, chatId, link.user_id);

    case "/due": {
      const summary = dueSummary(await countDueWords(sql, link.user_id));
      return sendMessage(chatId, summary.text, summary);
    }

    case "/pause":
      await updateLinkSettings(sql, telegramUserId, { remindersEnabled: false });
      return sendMessage(chatId, "Daily reminders paused. Send /resume to turn them back on.");

    case "/resume":
      await updateLinkSettings(sql, telegramUserId, { remindersEnabled: true });
      return sendMessage(chatId, `Daily reminders on, at ${formatHour(link.reminder_hour)} ${link.timezone} time.`);

    case "/settime": {
      // Number(null) and Number("") are both 0, a valid hour — so a bare
      // /settime would otherwise silently schedule midnight.
      const hour = arg === null ? NaN : Number(arg);
      if (!isValidReminderHour(hour)) {
        return sendMessage(chatId, "Give me an hour from 0 to 23 — for example /settime 21.");
      }
      await updateLinkSettings(sql, telegramUserId, { reminderHour: hour, remindersEnabled: true });
      return sendMessage(chatId, `I'll remind you at ${formatHour(hour)} ${link.timezone} time.`);
    }

    case "/settz": {
      if (!isValidTimezone(arg)) {
        return sendMessage(chatId, "I don't know that timezone. Use an IANA name, for example /settz Europe/Helsinki.");
      }
      await updateLinkSettings(sql, telegramUserId, { timezone: arg });
      return sendMessage(chatId, `Timezone set to ${arg}. Reminders at ${formatHour(link.reminder_hour)} local time.`);
    }

    case "/disconnect":
      await deleteLinkByTelegramId(sql, telegramUserId);
      return sendMessage(chatId, "Disconnected. Your words are untouched — reconnect any time from the Luku app.");

    default:
      return sendMessage(chatId, "Unknown command. Try /help.");
  }
}

export async function handleUpdate(update) {
  if (update?.message) return handleMessage(update.message);
  if (update?.callback_query) return handleCallback(update.callback_query);
  return null;
}
