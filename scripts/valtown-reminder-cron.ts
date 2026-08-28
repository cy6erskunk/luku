/**
 * Val Town scheduled val: hourly trigger for the reminder endpoint.
 *
 * Paste this into a new val at https://val.town, set its type to "Cron" with
 * the schedule `7 * * * *`, and add two environment variables to your Val Town
 * account (Settings -> Environment Variables):
 *
 *   LUKU_APP_URL          https://your-deployment.vercel.app
 *   TELEGRAM_CRON_SECRET  the same value the deployment has
 *
 * This exists because GitHub Actions silently drops scheduled runs under load —
 * observed gaps of 9-11 hours on an hourly schedule, which is long enough to
 * skip a user's whole reminder window. Val Town runs crons on a dedicated
 * scheduler and emails you when one throws, so a failure is visible instead of
 * being an absence of logs.
 *
 * The endpoint is idempotent per user per local day (`last_reminded_on`), so
 * running this alongside the GitHub Actions workflow cannot double-message
 * anyone. Belt and braces is the point: two unreliable triggers miss far less
 * than one.
 */

/** Retries transport failures only. An HTTP error is a real answer — surface it. */
async function postWithRetry(url: string, init: RequestInit, attempts = 3): Promise<Response> {
  let lastError: unknown;

  for (let i = 0; i < attempts; i++) {
    try {
      return await fetch(url, init);
    } catch (e) {
      lastError = e;
      if (i < attempts - 1) await new Promise((r) => setTimeout(r, 2000 * 2 ** i));
    }
  }

  throw lastError;
}

export default async function () {
  const appUrl = Deno.env.get("LUKU_APP_URL");
  const secret = Deno.env.get("TELEGRAM_CRON_SECRET");

  // Names the variable, never its value: a thrown message lands in the run log.
  if (!appUrl) throw new Error("LUKU_APP_URL is not set");
  if (!secret) throw new Error("TELEGRAM_CRON_SECRET is not set");

  const response = await postWithRetry(`${appUrl.replace(/\/$/, "")}/api/telegram/cron`, {
    method: "POST",
    headers: { Authorization: `Bearer ${secret}` },
  });

  const body = await response.text();

  // Throwing is what makes a broken deployment visible: Val Town marks the run
  // as errored and notifies, where a 401 or 500 swallowed here would look
  // exactly like a quiet day with nobody due.
  if (!response.ok) {
    throw new Error(`Reminder run failed: HTTP ${response.status} ${body}`);
  }

  console.log(`HTTP ${response.status} ${body}`);
  return body;
}
