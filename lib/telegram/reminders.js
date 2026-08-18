/**
 * Daily reminder delivery.
 *
 * Called by an hourly cron. Selection happens in Postgres so each user's local
 * hour and timezone are honoured, and last_reminded_on keeps a re-run from
 * messaging anyone twice on the same local day.
 */
import { isBlockedError, sendMessage } from "./api.js";
import { reminder } from "./render.js";

/**
 * Everyone whose reminder time has *passed* today and who hasn't been reminded
 * yet. Deliberately `>=` rather than `=`: GitHub Actions schedules drift and are
 * occasionally skipped, and a DST spring-forward can remove the matching hour
 * entirely — an exact match would silently cost that user the whole day.
 * last_reminded_on still holds it to once per local day.
 */
export async function findDueReminders(sql) {
  return sql`
    SELECT l.telegram_user_id, l.chat_id, l.timezone, l.last_reminded_on,
           (SELECT count(*)::int FROM words w
            WHERE w.user_id = l.user_id AND w.next_review_at <= NOW()) AS due_count
    FROM telegram_links l
    WHERE l.reminders_enabled
      AND EXTRACT(hour FROM NOW() AT TIME ZONE l.timezone) >= l.reminder_hour
      AND (l.last_reminded_on IS NULL
           OR l.last_reminded_on < (NOW() AT TIME ZONE l.timezone)::date)
  `;
}

/**
 * Stamps today's date only if nobody else has, and reports whether this caller
 * won. Re-checks reminders_enabled too: the eligibility read happened before the
 * loop, so a /pause partway through a run must still take effect. Claiming *before* sending is what stops two overlapping cron runs from
 * both messaging the same user: the loser sees zero updated rows and skips.
 */
async function claimReminder(sql, telegramUserId) {
  const rows = await sql`
    UPDATE telegram_links
    SET last_reminded_on = (NOW() AT TIME ZONE timezone)::date
    WHERE telegram_user_id = ${telegramUserId}
      AND reminders_enabled
      AND (last_reminded_on IS NULL
           OR last_reminded_on < (NOW() AT TIME ZONE timezone)::date)
    RETURNING telegram_user_id
  `;
  return rows.length > 0;
}

/** Hands the claim back after a definitive rejection, so a later run retries today. */
async function releaseReminder(sql, telegramUserId, previous) {
  await sql`
    UPDATE telegram_links SET last_reminded_on = ${previous ?? null}
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
  const result = { considered: rows.length, sent: 0, skipped: 0, raced: 0, blocked: 0, failed: 0 };

  for (const row of rows) {
    // Nothing due: leave last_reminded_on alone so a later hour can still catch them.
    if (!row.due_count) {
      result.skipped += 1;
      continue;
    }

    if (!(await claimReminder(sql, row.telegram_user_id))) {
      result.raced += 1;
      continue;
    }

    const message = reminder(row.due_count);
    try {
      await sendMessage(row.chat_id, message.text, message);
      result.sent += 1;
    } catch (e) {
      if (isBlockedError(e)) {
        // Keep the claim: there is no point retrying a blocked chat today.
        await disableReminders(sql, row.telegram_user_id);
        result.blocked += 1;
      } else if (e?.code) {
        // Telegram answered with an error, so the message definitely was not
        // delivered — safe to hand the claim back for a later run.
        await releaseReminder(sql, row.telegram_user_id, row.last_reminded_on);
        result.failed += 1;
      } else {
        // Transport failure: Telegram may already have accepted it. Keep the
        // claim — a missed reminder beats a duplicate one.
        result.failed += 1;
      }
    }
  }

  return result;
}
