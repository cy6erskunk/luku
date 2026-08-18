import * as Sentry from "@sentry/nextjs";
import { getDb } from "@/lib/db";
import { sha256, timingSafeEqualHex } from "@/lib/telegram/link";
import { sendReminders } from "@/lib/telegram/reminders";

/**
 * Authorizes the scheduler. Compared as hashes so the timing-safe path always
 * gets two equal-length inputs regardless of the token supplied.
 */
function isAuthorized(request) {
  const expected = process.env.TELEGRAM_CRON_SECRET;
  if (!expected) return false;

  const header = request.headers.get("authorization") || "";
  const provided = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!provided) return false;

  return timingSafeEqualHex(sha256(provided), sha256(expected));
}

export async function POST(request) {
  if (!isAuthorized(request)) return new Response(null, { status: 401 });

  try {
    const result = await sendReminders(getDb());
    return Response.json(result);
  } catch (e) {
    Sentry.captureException(e);
    return Response.json({ error: "Reminder run failed" }, { status: 500 });
  }
}
