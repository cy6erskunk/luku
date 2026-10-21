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

The reminder endpoint is called hourly rather than daily so each user can pick
their own reminder time and timezone. The endpoint decides who is actually due
and stamps `last_reminded_on`, so it won't message anyone twice in the same
local day — which means extra or overlapping triggers are harmless.

Use **Val Town**:

1. Create a new val at [val.town](https://val.town) and paste in
   [`scripts/valtown-reminder-cron.ts`](scripts/valtown-reminder-cron.ts).
2. Set its type to **Cron** with the schedule `7 * * * *`.
3. Under *Settings → Environment Variables*, add `LUKU_APP_URL` and
   `TELEGRAM_CRON_SECRET`.

Both hold the same values the deployment already has: `LUKU_APP_URL` is the
deployment's `APP_URL`, and `TELEGRAM_CRON_SECRET` is verbatim the same secret.
The `LUKU_` prefix is there because a Val Town account is a single namespace
shared by every val you own, so `APP_URL` alone would be ambiguous — inside the
deployment the variable keeps its unprefixed name.

The val throws on any non-2xx response. That matters: Val Town emails you when a
cron throws, so a 401 from a rotated secret surfaces instead of looking exactly
like a quiet hour with nobody due.

<details>
<summary>Alternatives that were tried and rejected</summary>

**GitHub Actions — do not use.** This repo ran the reminder cron from a
`schedule:` workflow and it did not work. GitHub deprioritizes scheduled
workflows on the shared runner pool and, past a point, drops runs outright
rather than queueing them. Measured over three days on an hourly schedule: 15
runs one day, **2** the next, **1** by mid-afternoon of the third — against 24
requested. One 9.6-hour gap covered a user's entire reminder window, so no
reminder was sent at all that day.

The failure mode is worse than the rate. Every run that *did* execute finished
green, and a skipped run leaves no record whatsoever — no failed job, no log,
just an absence. There is nothing to alert on. If you are debugging a missing
reminder and reach for the Actions tab, note that a clean history is not
evidence the endpoint was called.

The workflow was a single `curl` step. This is it verbatim, on the schedule the
measurements above were taken under:

```yaml
name: telegram-reminders

on:
  schedule:
    - cron: "5 * * * *"
  workflow_dispatch:

permissions: {}

jobs:
  remind:
    runs-on: ubuntu-latest

    steps:
      - name: Trigger reminder run
        env:
          APP_URL: ${{ secrets.LUKU_APP_URL }}
          CRON_SECRET: ${{ secrets.TELEGRAM_CRON_SECRET }}
        run: |
          set -euo pipefail

          if [ -z "${APP_URL}" ] || [ -z "${CRON_SECRET}" ]; then
            echo "LUKU_APP_URL or TELEGRAM_CRON_SECRET is not configured" >&2
            exit 1
          fi

          status=$(curl -sS --fail-with-body \
            --retry 3 --retry-delay 5 --retry-all-errors \
            -o response.json -w '%{http_code}' \
            -X POST "${APP_URL%/}/api/telegram/cron" \
            -H "Authorization: Bearer ${CRON_SECRET}")

          echo "HTTP ${status}"
          cat response.json
```

It needs `LUKU_APP_URL` and `TELEGRAM_CRON_SECRET` as repository secrets. Since
the endpoint is idempotent per user per local day, adding this back alongside
Val Town would be safe — it just is not worth the maintenance for a scheduler
that misses most of its runs.

Minute `:05` is a contended slot, and moving to an odd minute is the usual
advice. Do not expect it to rescue this: a shortfall from 24 runs to 1 is an
order of magnitude beyond what slot contention explains, and the runs that
survived were themselves scattered across the hour rather than landing near
:05, which is what a queue being shed looks like rather than one being
delayed.

**Vercel Cron.** A fine fit on Pro, but the Hobby plan allows only one run per
day, which collapses everyone onto a single reminder time and defeats the point
of per-user `reminder_hour` and timezone.

</details>

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

## Refining word cards with Claude (optional)

A card is created from one tap on one word, so some come out thin: a translation
the model guessed from the wrong sense, a part of speech that never parsed, an
example sentence that pins the word to nothing. Luku runs an MCP server so you
can point Claude at your own vocabulary and have it fix those in bulk — *"go
through my cards, correct any translation that looks wrong, and give the ones
with no example a good one."*

Nothing to deploy: the server is `/api/mcp`, and it needs no environment
variables. Run `db/schema.sql` if you have not since this landed — the
`mcp_tokens` table is where the credential lives.

### Connect a client

Sign into Luku, tap **☰** in the header and pick **Refine with Claude**. Name
what is connecting, hit *Create a token*, and copy it — the server stores only a
hash, so the panel cannot show it to you twice. Then:

```bash
claude mcp add --transport http luku https://your-app.vercel.app/api/mcp \
  --header "Authorization: Bearer luku_mcp_..."
```

`/mcp` in Claude Code should then list five tools: `list_words`, `get_word`,
`update_word`, `list_skills` and `read_skill`. The panel will show you that command with the token already in
it, so it is one copy rather than two.

**Claude Desktop, claude.ai and mobile** take the endpoint directly, through a
custom connector rather than a config file — `claude_desktop_config.json` only
launches local stdio servers. Go to **Customize → Connectors → Add custom
connector** and give it:

| Field | Value |
|---|---|
| MCP server URL | `https://your-app.vercel.app/api/mcp` |
| Authentication | **No sign-in** |
| Request headers | name `authorization`, value `Bearer luku_mcp_...` |

"No sign-in" is the right answer even though the server does require a token:
it means *no OAuth*, and the token travels in the header instead. Enter the
value with `Bearer ` and the trailing space included — Claude sends the header
verbatim and adds no scheme of its own, so a bare token arrives as
`Authorization: luku_mcp_...` and is refused.

Three things that will bite otherwise:

- **Request headers is in beta**, for a limited set of organizations. If the
  section is not in the dialog, your account cannot use it yet — see the
  `mcp-remote` fallback below.
- **Authentication settings cannot be edited afterwards.** Rotating a token
  means removing the connector and adding it again.
- **The connection comes from Anthropic's servers**, not your machine
  (egress `160.79.104.0/21`), so the URL has to be publicly reachable. A
  `localhost` URL works in Claude Code, which runs on your machine, and cannot
  work as a connector.

If the **Request headers** section is missing, bridge the endpoint locally with
[`mcp-remote`](https://www.npmjs.com/package/mcp-remote) in
`claude_desktop_config.json` instead:

```json
{
  "mcpServers": {
    "luku": {
      "command": "npx",
      "args": [
        "-y", "mcp-remote",
        "https://your-app.vercel.app/api/mcp",
        "--header", "Authorization: Bearer luku_mcp_..."
      ]
    }
  }
}
```

Check the flags against `mcp-remote`'s own README — they have moved before.

### What it can and cannot change

It writes four columns: `translations`, `pos`, `example` and
`example_translation`. It **cannot** move a card's review schedule, rename its
base form, touch its recorded inflections, or delete anything — so a refining
pass never costs you progress on a word you have been drilling. `update_word`
names those four columns and no others, and there is a test that fails if that
stops being true.

Three filters are there for the cards most likely to need work:
`filter: "suspect"` finds the ones whose translation or part of speech failed to
save (`(unavailable)`, or a `pos` of `?`), `filter: "missing_example"` the
ones with no example sentence, `filter: "difficult"` everything you have lost
ground on — hardest first, which may be most of the list — and
`filter: "lapsed"` the narrower set you failed at their *last* review, which is
the one to use for "what should I work on now".

### Skills it shares

The server also publishes [Agent Skills](https://agentskills.io/): workflows
for practising with your cards rather than editing them. There is one so far,
`luku-story-practice`, which builds a read-aloud story from your most overdue
words and then sets translation sentences from it. Ask for *"a story from my
due words"* and Claude picks it up.

They live in `skills/` as ordinary skill folders, and reach a client two ways,
because support differs between clients:

- **As tools**, `list_skills` and `read_skill`. Every client shows a model its
  tools, so this works everywhere today.
- **Through the MCP Skills extension**
  ([SEP-2640](https://github.com/modelcontextprotocol/modelcontextprotocol/blob/main/seps/2640-skills-extension.md)):
  each file is a `skill://` resource, and `skills/list` and `skills/get` return
  each skill's frontmatter with a digest for every file. A client that loads MCP
  skills natively uses this route instead.

To add one, put a folder with a `SKILL.md` under `skills/`. The folder name must
match the `name` in its frontmatter, and the frontmatter is flat `key: "value"`
lines; the tests refuse anything else, because a client checks it against its
own parse. The same folder zips up as-is for uploading to claude.ai.

### What it knows about your reviews

Cards come back with `review_count`, `ease_factor` and `next_review_at`, and the
server explains all three at connect time so you do not have to. Two of them are
easy to misread, which is the reason the explanation exists:

- **`review_count` is a streak, not a tally.** It counts *consecutive* passes.
  Answering *Again* resets it to 0 along with the interval, so a word you have
  drilled for months reads `0` the moment you fail it — identical to a word you
  have never seen. It also comes back in 10 minutes rather than tomorrow, so
  its `next_review_at` reads as due again almost at once.
- **`ease_factor` is how hard a card has proved overall.** 2.5 to begin with,
  `+0.1` for Easy, `-0.14` for Hard,
  `-0.54` for Again, floored at 1.3 and uncapped upwards. Under 2.5 means the
  card has lost ground overall, which is what `filter: "difficult"` returns,
  sorted. The reverse does not hold — a card you have answered easily sits
  *above* 2.5, and a long enough mix lands back on it exactly, since seven
  Easy cancel five Hard — so 2.5 is not a reliable sign of a card you have
  never reviewed.
  What is reliable: `review_count` of 0 together with an ease factor under 2.5
  means you failed that card last time.
- **`lapses` counts failures**, which is the one thing neither of the others
  can. It exists because the ease factor *saturates*: an *Again* costs 0.54, so
  three failures reach the 1.3 floor and every later one moves nothing. On a
  333-card collection that left about 170 cards sitting at the floor,
  indistinguishable from each other — so `difficult` sorts by ease factor and
  then by `lapses` to separate them. It started counting when the column was
  added and **cannot be back-filled**: each failure had already overwritten the
  only count there was.

So *"which words do I keep forgetting?"* is answerable now, and *"how many times
have I pressed Again on this one?"* becomes answerable as you review from here
on. For everything before the `lapses` column it stays unanswerable, and no
migration can recover it.

### When it does not work

- **`404 Not Found` on every call.** That is the URL, not the token. The usual
  cause is a connector still pointed at a preview deployment — the
  `…-git-<branch>-….vercel.app` alias dies with the branch it was named after,
  so merging and deleting a branch takes its alias with it. Point the connector
  at production. Authentication settings cannot be edited after the fact, so
  this means removing the connector and adding it again.

- **The server vanishes from `/mcp`, with no error.** That is a `401`: the token
  is wrong, or it has been revoked. A client treats an unauthorised server as
  one that is simply not there, so check the panel rather than looking for a
  message. `curl` tells you plainly:

  ```bash
  curl -s -o /dev/null -w '%{http_code}\n' https://your-app.vercel.app/api/mcp \
    -H 'content-type: application/json' \
    -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
  # 401 with no Authorization header; 200 with a good one
  ```

- **Every request fails, `initialize` included,** with a JSON-RPC error whose
  code is `-32603`. That is `db/schema.sql` not having been re-run: without
  `mcp_tokens` the token lookup throws before any tool is reached, so nothing
  works rather than some things working. The cause is in Sentry.

- **A card you refined still looks wrong in the browser.** An MCP write does not
  reach an open tab; reload it.

- **The connector dialog has no Request headers section.** That part is in beta
  and not on every account yet. Use the `mcp-remote` bridge above, or Claude
  Code, which takes the header directly.

- **"Couldn't reach the MCP server" from a connector, while `curl` works.** The
  request comes from Anthropic's egress range rather than your machine, so a
  URL only you can reach — `localhost`, a VPN, a preview deployment with
  protection on — fails there and succeeds locally.

Revoking a token in the panel takes effect on the client's next call.

## Skipping the key screen while developing

Put your key in `.env.local` and the app stops asking for it locally:

```
ANTHROPIC_API_KEY=sk-ant-...
```

`/api/claude` falls back to it, the key screen is skipped for signed-in users,
and a key entered in the UI still wins over it. The key screen stays reachable
from the header menu.

**This works in development only** — `NODE_ENV=production` ignores the variable
entirely, so setting it in Vercel does nothing. That is deliberate: a deployed
fallback is spent by whoever is signed in rather than by whoever owns the key,
with no per-user visibility and no limit. Locally, the key, the browser and the
person paying are the same person.

On a deployment, everyone brings their own key. If you want a shared one badly
enough to pay for it, the honest version is a per-user quota and a bill you can
read — not this variable.
