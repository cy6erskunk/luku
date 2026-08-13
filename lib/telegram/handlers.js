/**
 * Update routing for the Telegram bot.
 *
 * Authentication happened before we got here: the webhook route verified
 * Telegram's secret token, so `from.id` is asserted by Telegram rather than by
 * the sender. Everything below treats it as a lookup key and scopes each query
 * by the Luku user it resolves to.
 */
import { getDb } from "../db.js";
import { sendMessage } from "./api.js";
import {
  consumeLinkCode,
  createLink,
  deleteLinkByTelegramId,
  getLinkByTelegramId,
  touchLink,
} from "./link.js";

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

  try {
    await createLink(sql, { telegramUserId, userId, chatId, username });
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
  return sendMessage(
    chatId,
    [
      `✅ Connected${email ? ` to ${email}` : ""}.`,
      "",
      "I'll remind you once a day when words are due.",
      "Send /review to start a session now, or /help for everything else.",
    ].join("\n")
  );
}

async function handleMessage(message) {
  // Group chats would let one member review another's vocabulary; private only.
  if (message.chat?.type !== "private") return;
  const chatId = message.chat.id;
  const telegramUserId = message.from?.id;
  if (!telegramUserId) return;

  const sql = getDb();
  const { command, arg } = parseCommand(message.text);

  // Linking is the one thing that works without an existing link.
  if ((command === "/start" || command === "/link") && arg) {
    return handleLinkCommand(sql, { chatId, telegramUserId, username: message.from.username, code: arg });
  }

  if (command === "/help") return sendMessage(chatId, helpText());

  const link = await getLinkByTelegramId(sql, telegramUserId);
  if (!link) return sendMessage(chatId, connectPrompt());

  await touchLink(sql, telegramUserId);

  switch (command) {
    case "/start":
      return sendMessage(chatId, "You're already connected. Send /review to start a session, or /help to see everything.");

    case "/disconnect":
      await deleteLinkByTelegramId(sql, telegramUserId);
      return sendMessage(chatId, "Disconnected. Your words are untouched — reconnect any time from the Luku app.");

    default:
      return sendMessage(chatId, "Unknown command. Try /help.");
  }
}

export async function handleUpdate(update) {
  if (update?.message) return handleMessage(update.message);
  return null;
}
