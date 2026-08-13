/**
 * Daily reminder delivery.
 *
 * Called by an hourly cron. Selection happens in Postgres so each user's local
 * hour and timezone are honoured, and last_reminded_on keeps a re-run from
 * messaging anyone twice on the same local day.
 */
import { isBlockedError, sendMessage } from "./api.js";
import { reminder } from "./render.js";

export async function findDueReminders(sql) {
  return sql`
    SELECT l.telegram_user_id, l.chat_id, l.timezone,
           (SELECT count(*)::int FROM words w
            WHERE w.user_id = l.user_id AND w.next_review_at <= NOW()) AS due_count
    FROM telegram_links l
    WHERE l.reminders_enabled
      AND EXTRACT(hour FROM NOW() AT TIME ZONE l.timezone) = l.reminder_hour
      AND (l.last_reminded_on IS NULL
           OR l.last_reminded_on < (NOW() AT TIME ZONE l.timezone)::date)
  `;
}

/** Stamped only after a successful send, so a failure is retried next hour. */
async function markReminded(sql, telegramUserId) {
  await sql`
    UPDATE telegram_links
    SET last_reminded_on = (NOW() AT TIME ZONE timezone)::date
    WHERE telegram_user_id = ${telegramUserId}
  `;
}

async function disableReminders(sql, telegramUserId) {
  await sql`
    UPDATE telegram_links SET reminders_enabled = FALSE WHERE telegram_user_id = ${telegramUserId}
  `;
}

/**
 * Sends one reminder per eligible user. Sequential on purpose: Telegram allows
 * roughly 30 messages a second to distinct users, and this runs every hour.
 */
export async function sendReminders(sql) {
  const rows = await findDueReminders(sql);
  const result = { considered: rows.length, sent: 0, skipped: 0, blocked: 0, failed: 0 };

  for (const row of rows) {
    // Nothing due: leave last_reminded_on alone so a later hour can still catch them.
    if (!row.due_count) {
      result.skipped += 1;
      continue;
    }

    const message = reminder(row.due_count);
    try {
      await sendMessage(row.chat_id, message.text, message);
      await markReminded(sql, row.telegram_user_id);
      result.sent += 1;
    } catch (e) {
      if (isBlockedError(e)) {
        await disableReminders(sql, row.telegram_user_id);
        result.blocked += 1;
      } else {
        // One bad chat must not stop the rest of the run.
        result.failed += 1;
      }
    }
  }

  return result;
}
