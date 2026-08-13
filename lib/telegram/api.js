/**
 * Minimal Telegram Bot API client.
 *
 * Deliberately a thin fetch wrapper rather than a bot framework: the webhook
 * runs serverless, so long polling, middleware and session storage — the bulk
 * of what those libraries provide — would go unused.
 */
const API_BASE = "https://api.telegram.org";

function botToken() {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error("TELEGRAM_BOT_TOKEN is not set");
  return token;
}

export async function tgCall(method, payload = {}) {
  const res = await fetch(`${API_BASE}/bot${botToken()}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  const data = await res.json();
  if (!data.ok) {
    const err = new Error(data.description || `Telegram ${method} failed`);
    err.code = data.error_code;
    err.method = method;
    throw err;
  }
  return data.result;
}

/** True when the user has blocked the bot or deleted the chat. */
export function isBlockedError(err) {
  return err?.code === 403;
}

export function sendMessage(chatId, text, extra = {}) {
  return tgCall("sendMessage", { chat_id: chatId, text, ...extra });
}

export function editMessageText(chatId, messageId, text, extra = {}) {
  return tgCall("editMessageText", { chat_id: chatId, message_id: messageId, text, ...extra });
}

export function answerCallbackQuery(callbackQueryId, text) {
  return tgCall("answerCallbackQuery", {
    callback_query_id: callbackQueryId,
    ...(text ? { text } : {}),
  });
}

export function deleteMessage(chatId, messageId) {
  return tgCall("deleteMessage", { chat_id: chatId, message_id: messageId });
}

export function inlineKeyboard(rows) {
  return { reply_markup: { inline_keyboard: rows } };
}
