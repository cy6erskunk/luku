#!/usr/bin/env node
/**
 * One-off Telegram bot setup: point the webhook at a deployment and register
 * the command list.
 *
 *   node scripts/telegram-set-webhook.mjs https://luku.app
 *   node scripts/telegram-set-webhook.mjs --status
 *
 * Runs on your machine, not in the deployment, so it reads its configuration
 * from .env.local (see .env.local.example) or the ambient environment —
 * variables set in the Vercel dashboard are not visible here.
 * Re-running is safe.
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
const target = process.argv[2];
const statusOnly = target === "--status";

function fail(message) {
  console.error(`✗ ${message}`);
  process.exit(1);
}

// Names the variable, never its value: reflecting environment variables into
// output is how secrets end up in CI logs.
function requireEnv(value, name) {
  if (!value) {
    fail(`${name} is not set — add it to .env.local (see .env.local.example), or export it in your shell`);
  }
}

if (!target) {
  fail("Usage: node scripts/telegram-set-webhook.mjs <public-base-url> | --status");
}
if (!statusOnly && !/^https:\/\//.test(target)) {
  fail("Telegram only accepts https webhook URLs");
}

requireEnv(TELEGRAM_BOT_TOKEN, "TELEGRAM_BOT_TOKEN");
if (!statusOnly) {
  requireEnv(TELEGRAM_BOT_USERNAME, "TELEGRAM_BOT_USERNAME");
  requireEnv(TELEGRAM_WEBHOOK_SECRET, "TELEGRAM_WEBHOOK_SECRET");
}

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

function reportWebhook(info) {
  console.log(info.url ? `  url: ${info.url}` : "  url: (none — the webhook has never been registered)");
  console.log(`  pending updates: ${info.pending_update_count}`);
  if (info.last_error_message) {
    console.log(`⚠ last delivery error: ${info.last_error_message}`);
    console.log("  A 401 here means either the webhook secret differs from the deployment's,");
    console.log("  or the deployment is behind Vercel Deployment Protection.");
  }
}

const me = await tg("getMe");

if (statusOnly) {
  console.log(`@${me.username}`);
  reportWebhook(await tg("getWebhookInfo"));
  process.exit(0);
}

// Catch a mistyped username here rather than as a dead deep link at connect time.
// The message names the bot the token belongs to rather than echoing the configured
// value back, for the same reason requireEnv does not print values.
const expected = TELEGRAM_BOT_USERNAME.replace(/^@/, "");
if (me.username !== expected) {
  fail(`This token belongs to @${me.username}, which does not match TELEGRAM_BOT_USERNAME`);
}

const webhookUrl = `${target.replace(/\/$/, "")}/api/telegram/webhook`;

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

console.log(`✓ @${me.username} — webhook set, secret token attached, commands registered`);
reportWebhook(await tg("getWebhookInfo"));
console.log("\nNext: send /help to the bot. It should reply without touching the database.");
