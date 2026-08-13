/**
 * Update routing for the Telegram bot.
 *
 * Authentication happened before we got here: the webhook route verified
 * Telegram's secret token, so `from.id` is asserted by Telegram rather than by
 * the sender. Everything below treats it as a lookup key and scopes each query
 * by the Luku user it resolves to.
 */
import { sendMessage } from "./api.js";

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

async function handleMessage(message) {
  // Group chats would let one member review another's vocabulary; private only.
  if (message.chat?.type !== "private") return;
  const chatId = message.chat.id;

  const { command } = parseCommand(message.text);

  switch (command) {
    case "/start":
      return sendMessage(chatId, connectPrompt());
    case "/help":
      return sendMessage(chatId, helpText());
    default:
      return sendMessage(chatId, `Unknown command. Try /help.`);
  }
}

export async function handleUpdate(update) {
  if (update?.message) return handleMessage(update.message);
  return null;
}
