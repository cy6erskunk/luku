import * as Sentry from "@sentry/nextjs";
import { handleUpdate } from "@/lib/telegram/handlers";
import { sha256, timingSafeEqualHex } from "@/lib/telegram/link";

const SECRET_HEADER = "x-telegram-bot-api-secret-token";

/**
 * Authenticates Telegram itself. Everything downstream trusts `from.id`
 * because of this check, so it is the one place that must not be lenient.
 * Compared as hashes so the timing-safe path gets two equal-length inputs.
 */
function isFromTelegram(request) {
  const expected = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!expected) return false;
  const provided = request.headers.get(SECRET_HEADER);
  if (!provided) return false;
  return timingSafeEqualHex(sha256(provided), sha256(expected));
}

export async function POST(request) {
  if (!isFromTelegram(request)) {
    return new Response(null, { status: 401 });
  }

  try {
    const update = await request.json();
    await handleUpdate(update);
  } catch (e) {
    // Always 200 below: a non-2xx makes Telegram redeliver the same update on
    // a schedule, which turns one bug into a retry storm.
    Sentry.captureException(e);
  }

  return new Response(null, { status: 200 });
}
