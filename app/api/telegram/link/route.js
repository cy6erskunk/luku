import { getAuth } from "@/lib/auth/server";
import { getDb } from "@/lib/db";
import { createLinkCode, deleteLinkByUserId, getLinkByUserId } from "@/lib/telegram/link";

async function requireUser() {
  const { data: session } = await getAuth().getSession();
  return session?.user ?? null;
}

function botUsername() {
  return (process.env.TELEGRAM_BOT_USERNAME || "").replace(/^@/, "");
}

/**
 * Linking needs all three: the username builds the deep link, the webhook
 * secret lets the bot receive /start, and the token lets it reply. With only
 * some of them set the panel would offer Connect and mint a live code that
 * cannot complete — and if the token alone is missing, the webhook still
 * authenticates and createLink succeeds, leaving the account linked while the
 * user sees no confirmation at all.
 */
function botConfigured() {
  return Boolean(process.env.TELEGRAM_BOT_TOKEN && botUsername() && process.env.TELEGRAM_WEBHOOK_SECRET);
}

function serialize(link) {
  const configured = botConfigured();
  if (!link) return { linked: false, configured };
  return {
    linked: true,
    configured,
    username: link.username ?? null,
    remindersEnabled: link.reminders_enabled,
    reminderHour: link.reminder_hour,
    timezone: link.timezone,
  };
}

export async function GET() {
  const user = await requireUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const link = await getLinkByUserId(getDb(), user.id);
  return Response.json(serialize(link));
}

/**
 * Mints a one-time code and returns the deep link carrying it. The plaintext
 * code exists only in this response and the URL — only its hash is stored.
 */
export async function POST() {
  const user = await requireUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  if (!botConfigured()) {
    return Response.json({ error: "Telegram bot is not configured" }, { status: 503 });
  }
  const bot = botUsername();

  const sql = getDb();
  if (await getLinkByUserId(sql, user.id)) {
    return Response.json({ error: "Already connected" }, { status: 409 });
  }

  const code = await createLinkCode(sql, user.id);
  return Response.json({ url: `https://t.me/${bot}?start=${code}`, code });
}

export async function DELETE() {
  const user = await requireUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const removed = await deleteLinkByUserId(getDb(), user.id);
  if (!removed) return Response.json({ error: "Not found" }, { status: 404 });
  return Response.json({ ok: true });
}
