# Luku — AI Finnish Reader

Photograph a Finnish text, tap any word to get its translation and dictionary form, build a review list, and do a flashcard session.

## Deploy to Vercel (5 minutes)

1. Push this folder to a GitHub repo
2. Go to [vercel.com](https://vercel.com) → New Project → import your repo
3. Add the Neon integration, which provides `DATABASE_URL` and the Neon Auth
   variables, then run `db/schema.sql` once in the Neon SQL editor
4. Click Deploy

See `.env.local.example` for the full list of variables.

## Run locally

```bash
npm install
npm run dev
```

Open http://localhost:3000

## How it works

- Users enter their Anthropic API key on first load, kept in `localStorage`. It is sent to this deployment's own `/api/claude` route, which forwards it to Anthropic — so the server handling your traffic does see the key in transit; it is never stored server-side.
- The key is sent to `/api/claude` — a Next.js server route that forwards requests to Anthropic
- The API key is **never exposed in the browser bundle**
- OCR and word translation both go through this server route

## Telegram review bot (optional)

Review your saved words from a Telegram chat and get one reminder a day when
something is due. Grading in the chat writes to the same SRS schedule the web
app reads, so the two stay in sync. Reviewing needs no Anthropic key.

### 1. Create the bot

Talk to [@BotFather](https://t.me/BotFather) → `/newbot` → keep the token it
gives you.

### 2. Set the environment variables

These go in **two places** — the deployment runs the bot, but the setup script in
step 3 runs on your machine and cannot see your hosting provider's variables.

**In your deployment** (Vercel → Settings → Environment Variables), enabled for
the environment you are targeting — Production, Preview, or both:

```
TELEGRAM_BOT_TOKEN=123456:ABC-DEF...     # from BotFather
TELEGRAM_BOT_USERNAME=YourLukuBot        # without the leading @
TELEGRAM_WEBHOOK_SECRET=...              # openssl rand -hex 32
TELEGRAM_CRON_SECRET=...                 # openssl rand -hex 32
APP_URL=https://your-deployment.vercel.app
```

**On your machine**, so the setup script can reach the Bot API:

```bash
cp .env.local.example .env.local
# fill in TELEGRAM_BOT_TOKEN, TELEGRAM_BOT_USERNAME, TELEGRAM_WEBHOOK_SECRET
```

Use `-hex`, not `-base64`: Telegram restricts `TELEGRAM_WEBHOOK_SECRET` to
`A-Za-z0-9_-` (max 256 chars), and base64 output contains `+`, `/` and `=`, which
`setWebhook` rejects.

`.env.local` is gitignored. Only those three are needed locally —
`TELEGRAM_CRON_SECRET` and `APP_URL` are read by the running app, not the script.
`TELEGRAM_WEBHOOK_SECRET` must be **identical** to the deployment's: it is what
Telegram echoes back on every update, and a mismatch means the app rejects every
delivery and the bot silently does nothing.

Prefer not to keep a file? Pass them for a single run instead:

```bash
TELEGRAM_BOT_TOKEN=… TELEGRAM_BOT_USERNAME=… TELEGRAM_WEBHOOK_SECRET=… \
  npm run telegram:webhook -- https://your-deployment.vercel.app
```

> **The bot token is the most sensitive secret in this project.** Anyone holding
> it can re-point the webhook, read every message sent to the bot, and send
> messages as it. Keep it out of the repo, and rotate it via BotFather if it
> ever leaks.

### 3. Register the webhook

**Deploying does not do this.** Until it runs, Telegram holds no URL for your bot
and will never contact your app — the bot simply never replies. Run it once per
deployment URL:

```bash
npm run telegram:webhook -- https://your-deployment.vercel.app
```

This points Telegram at `/api/telegram/webhook`, attaches the secret token, and
registers the command list. It refuses to run if `TELEGRAM_BOT_USERNAME` doesn't
match the bot the token belongs to.

Pass a base URL; the endpoint path is appended for you, and any query string —
such as a protection-bypass token — is preserved. Re-running keeps whatever
Telegram has already queued; add `--reset` to discard pending updates instead.

To check what is currently registered, without changing anything:

```bash
npm run telegram:status
```

#### Testing against a preview deployment

Three things differ from production:

- **Use the branch alias**, the stable `…-git-<branch>-<scope>.vercel.app` URL —
  not the per-deployment URL, which changes on every push and leaves the webhook
  pointing at a dead deploy.
- **Deployment Protection is on by default for previews**, so Telegram's POST gets
  an authentication page instead of your route. `npm run telegram:status` reports
  this as `401 Unauthorized`. Either disable protection for previews, or enable
  Protection Bypass for Automation and register the webhook with the token in the
  query string, which Telegram preserves:
  `npm run telegram:webhook -- "https://<branch-alias>?x-vercel-protection-bypass=<token>"`
- **Scope the variables to Preview** — a variable set only for Production is
  absent from a preview deployment, and `DATABASE_URL` should point at the Neon
  branch you migrated.

#### When the bot doesn't answer

Work down this ladder; each step isolates one layer.

| Step | Proves |
|---|---|
| `npm run telegram:status` shows your URL and no last error | registration and reachability |
| `/help` replies | webhook secret, bot token, outgoing messages — no database |
| `/start` replies | `DATABASE_URL` and the migrated schema |

`/help` deliberately answers before touching the database, so if `/help` works and
`/start` is silent, the problem is the database connection. Anything that fails
after authentication is captured in Sentry, including a mismatched secret.

### 4. Schedule the reminders

Add two GitHub repository secrets — `LUKU_APP_URL` and `TELEGRAM_CRON_SECRET` —
and the `telegram-reminders` workflow will call the reminder endpoint hourly. It
runs hourly rather than daily so each user can pick their own reminder time and
timezone; the endpoint itself decides who is actually due and won't message
anyone twice in the same local day.

Prefer Vercel Cron? Add a `vercel.json` pointing at `/api/telegram/cron`
instead — but note the Hobby plan allows only one run per day, which means a
single reminder time for everyone.

### 5. Connect an account

Sign into Luku, tap **✈** in the header, and hit *Connect Telegram*. That opens
the bot with a one-time code; tapping **START** binds the two accounts. The bot
confirms with the email of the account it linked.

### Commands

| Command | Behaviour |
|---|---|
| `/review` | Start a review session |
| `/due` | How many words are waiting |
| `/settings` | Show the reminder schedule, timezone, and the current time there |
| `/pause`, `/resume` | Turn daily reminders off and on |
| `/settime 21` | Reminder hour, in your local time |
| `/settz Europe/Helsinki` | Set your timezone |
| `/disconnect` | Unlink the chat; your words are untouched |

## Personal use (skip the key screen)

If you don't want to enter a key each time, set one environment variable in
Vercel:

```
ANTHROPIC_API_KEY=sk-ant-...
```

That is the whole setup. `/api/claude` falls back to it, and the app skips the
key screen for signed-in users. A key someone enters in the UI still wins over
it, and the key screen stays reachable from the header menu.

The route requires a signed-in session, so the key is spendable only by people
who can sign into your deployment — but everyone who can sign in shares your
credit. On a deployment open to others, leave it unset and let people bring
their own key.
