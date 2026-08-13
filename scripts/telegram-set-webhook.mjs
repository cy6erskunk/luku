#!/usr/bin/env node
/**
 * One-off Telegram bot setup: point the webhook at a deployment and register
 * the command list.
 *
 *   node scripts/telegram-set-webhook.mjs https://luku.app
 *
 * Reads TELEGRAM_BOT_TOKEN, TELEGRAM_BOT_USERNAME and TELEGRAM_WEBHOOK_SECRET
 * from the environment. Re-running is safe.
 */
import { readFileSync } from "node:fs";

// Minimal .env.local loader so this works without extra dependencies.
try {
  for (const line of readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (match && !process.env[match[1]]) {
      process.env[match[1]] = match[2].replace(/^["']|["']$/g, "");
    }
  }
} catch {
  // No .env.local — rely on the ambient environment.
}

const { TELEGRAM_BOT_TOKEN, TELEGRAM_BOT_USERNAME, TELEGRAM_WEBHOOK_SECRET } = process.env;
const baseUrl = process.argv[2];

function fail(message) {
  console.error(`✗ ${message}`);
  process.exit(1);
}

if (!baseUrl) fail("Usage: node scripts/telegram-set-webhook.mjs <public-base-url>");
if (!/^https:\/\//.test(baseUrl)) fail("Telegram only accepts https webhook URLs");
if (!TELEGRAM_BOT_TOKEN) fail("TELEGRAM_BOT_TOKEN is not set");
if (!TELEGRAM_BOT_USERNAME) fail("TELEGRAM_BOT_USERNAME is not set");
if (!TELEGRAM_WEBHOOK_SECRET) fail("TELEGRAM_WEBHOOK_SECRET is not set");

async function tg(method, payload) {
  const res = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload ?? {}),
  });
  const data = await res.json();
  if (!data.ok) fail(`${method}: ${data.description}`);
  return data.result;
}

const me = await tg("getMe");

// Catch a mistyped username here rather than as a dead deep link at connect time.
// The message names the bot the token belongs to rather than echoing the configured
// value back: the operator already knows what they set, and reflecting environment
// variables into logs is how secrets end up in CI output.
const expected = TELEGRAM_BOT_USERNAME.replace(/^@/, "");
if (me.username !== expected) {
  fail(`This token belongs to @${me.username}, which does not match TELEGRAM_BOT_USERNAME`);
}

const webhookUrl = `${baseUrl.replace(/\/$/, "")}/api/telegram/webhook`;

await tg("setWebhook", {
  url: webhookUrl,
  secret_token: TELEGRAM_WEBHOOK_SECRET,
  allowed_updates: ["message", "callback_query"],
  drop_pending_updates: true,
});

await tg("setMyCommands", {
  commands: [
    { command: "review", description: "Start a review session" },
    { command: "due", description: "How many words are waiting" },
    { command: "pause", description: "Stop daily reminders" },
    { command: "resume", description: "Resume daily reminders" },
    { command: "settime", description: "Set reminder hour (0-23, local)" },
    { command: "settz", description: "Set your timezone" },
    { command: "disconnect", description: "Unlink from your Luku account" },
    { command: "help", description: "Show the command list" },
  ],
});

const info = await tg("getWebhookInfo");

console.log(`✓ @${me.username} webhook → ${info.url}`);
console.log(`✓ secret token set, ${info.pending_update_count} updates pending, commands registered`);
if (info.last_error_message) {
  console.log(`⚠ last delivery error: ${info.last_error_message}`);
}
