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

- Users enter their Anthropic API key on first load (kept in `localStorage`, never sent anywhere but Anthropic)
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

```
TELEGRAM_BOT_TOKEN=123456:ABC-DEF...     # from BotFather
TELEGRAM_BOT_USERNAME=YourLukuBot        # without the leading @
TELEGRAM_WEBHOOK_SECRET=...              # openssl rand -base64 32
TELEGRAM_CRON_SECRET=...                 # openssl rand -base64 32
APP_URL=https://your-deployment.vercel.app
```

> **The bot token is the most sensitive secret in this project.** Anyone holding
> it can re-point the webhook, read every message sent to the bot, and send
> messages as it. Keep it out of the repo, and rotate it via BotFather if it
> ever leaks.

### 3. Register the webhook

Run once per deployment URL:

```bash
node scripts/telegram-set-webhook.mjs https://your-deployment.vercel.app
```

This points Telegram at `/api/telegram/webhook`, attaches the secret token, and
registers the command list. It refuses to run if `TELEGRAM_BOT_USERNAME` doesn't
match the bot the token belongs to.

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
| `/pause`, `/resume` | Turn daily reminders off and on |
| `/settime 21` | Reminder hour, in your local time |
| `/settz Europe/Helsinki` | Set your timezone |
| `/disconnect` | Unlink the chat; your words are untouched |

## Personal use (skip the key screen)

If you want to hardcode your own key so you don't have to enter it each time, set an environment variable in Vercel:

```
ANTHROPIC_API_KEY=sk-ant-...
```

Then update `app/api/claude/route.js` to fall back to it:

```js
const key = apiKey || process.env.ANTHROPIC_API_KEY;
```

And update `app/page.js` to skip the key screen when no input is needed (e.g. auto-set savedKey on load).
