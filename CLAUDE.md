# CLAUDE.md — Onboarding for Claude Code

## Project Overview

**Luku** is an AI-powered Finnish language learning app. Users photograph Finnish text, tap words for instant translations, and review vocabulary with flashcards.

## Tech Stack

- **Framework**: Next.js 16 (App Router)
- **UI**: React 19, plain JavaScript (no TypeScript)
- **Styling**: Inline CSS (no CSS framework)
- **AI**: Anthropic Claude API (claude-sonnet-4-6) via server-side proxy
- **Database**: Neon Postgres over HTTP (`@neondatabase/serverless`). No ORM, no migration tool — `db/schema.sql` is run by hand and migrations are appended to it as idempotent `ALTER TABLE ... IF NOT EXISTS` statements. **The HTTP driver has no transactions**: each tagged template is its own request, so multi-step writes must be safe half-completed.
- **Auth**: Neon Auth (`@neondatabase/auth`). Every protected route starts with the same three lines — `getAuth().getSession()`, then 401 if there's no user, then scope every query by `user.id`.
- **Bot**: optional Telegram bot for reviews and reminders (`lib/telegram/`)

## Quick Start

```bash
npm install
npm run dev
# Open http://localhost:3000
```

## Available Commands

```bash
npm run dev    # Start dev server
npm run build  # Production build
npm start      # Start production server (run build first)
npm run lint   # oxlint (correctness and hook rules, not formatting)
npm test       # Run test suite (Vitest)
```

## Project Structure

```
app/
├── page.jsx                    # Root orchestrator — composes hooks and stage components
├── layout.jsx                  # Root layout (metadata, lang="fi")
├── hooks/
│   ├── useApiKey.js            # Saved API key with localStorage sync
│   ├── useSession.js           # Per-scan translation session with localStorage sync
│   ├── useWords.js             # DB word list: fetch, save, update, remove/restore
│   ├── useReview.js            # Flashcard queue: grading, self-correction, reset
│   └── useImageProcessing.js  # File pick, crop UI, Tesseract OCR, AI rescan
├── components/
│   ├── ScanStage.jsx           # Stage 0 — image upload / crop UI
│   ├── ReadStage.jsx           # Stage 1 — tappable text + TranslationPopup
│   ├── ReviewStage.jsx         # Stage 2 — flashcard review
│   ├── TranslationPopup.jsx    # Absolutely-positioned word popup (inside ReadStage)
│   ├── WordList.jsx            # Full word-list overlay (all stages)
│   ├── ApiKeyScreen.jsx        # API key entry screen
│   ├── TelegramConnect.jsx     # Telegram link/unlink overlay
│   ├── HeaderMenu.jsx          # Header overflow menu (Telegram / key / sign out)
│   ├── SignIn.jsx              # Auth screen
│   └── LukuLogo.jsx            # SVG logo
└── api/
    ├── claude/route.js         # Server proxy for Anthropic API
    ├── words/route.js          # CRUD for saved vocabulary
    ├── reviews/route.js        # SRS grading endpoint
    ├── auth/[...path]/route.js # Neon Auth catch-all
    └── telegram/
        ├── webhook/route.js    # Telegram updates (secret-token authenticated)
        ├── link/route.js       # Mint link code / status / unlink (session authenticated)
        └── cron/route.js       # Hourly reminder pass (bearer authenticated)

lib/                            # Server-only; app/lib/ is the client half
├── db.js                       # getDb() -> neon(DATABASE_URL)
├── srs.js                      # calcSRS() — simplified SM-2
├── reviews.js                  # Due-word queries + gradeWord, shared by web and bot
├── auth/server.js              # getAuth()
└── telegram/
    ├── api.js                  # tgCall() and message helpers
    ├── handlers.js             # Update routing: commands and callbacks
    ├── link.js                 # Link codes, link CRUD, hashing
    ├── callback.js             # Signed callback_data
    ├── render.js               # Card and message text (pure)
    └── reminders.js            # Daily reminder selection and delivery
```

## Architecture

### Three-Stage Workflow

1. **Scan (stage 0)** — Upload or photograph a Finnish text image; optionally crop; OCR runs locally via Tesseract or via Claude Vision
2. **Read (stage 1)** — OCR-extracted text displayed as tappable tokens; tap any word to translate; add words to the review list
3. **Review (stage 2)** — SRS flashcard session for saved words

### State organisation

`page.jsx` is a thin orchestrator. All domain state lives in custom hooks:

| Hook | Owns |
|------|------|
| `useApiKey` | `savedKey` + localStorage persistence |
| `useSession` | Per-scan translation cache + localStorage persistence |
| `useWords` | `dbWords`, `loadingWords`, word CRUD |
| `useReview` | `queue`, `revIdx`, `showAnswer`, `grading`, SRS grading logic |
| `useImageProcessing` | `busy`, `step`, `err`, `preview`, `ocrProgress`, `ocrSource`, all crop state |

Cross-cutting actions that touch two hooks (`handleAddWord`, `handleDeleteWord`, `handleStartReview`, `handleScanAnother`, `onWord`) are composed in `page.jsx`.

### Key utility functions (`app/lib/`)

| Function | Purpose |
|----------|---------|
| `callClaude()` (`api.js`) | Generic wrapper for Claude API calls via `/api/claude` |
| `ocrImage()` (`api.js`) | Extracts text from image using Claude Vision |
| `translateWord()` (`api.js`) | Gets dictionary form, translations, and part of speech |
| `ocrLocal()` (`ocr.js`) | Tesseract.js OCR with progress callbacks |
| `fileToBase64()` (`image.js`) | Client-side image resize/compress (max 1024px, ≤400KB) |
| `getCroppedImg()` (`image.js`) | Crops a canvas region to base64 |
| `tokenize()` (`utils.js`) | Splits text into words, punctuation, spaces, and line breaks. A word hyphenated across a line break keeps both halves visible but gives each the whole word in `w` and a shared key, so tapping either translates the whole word |
| `dehyphenate()` (`utils.js`) | Rejoins words split across lines; `sentenceOf()` runs it first so context is a whole sentence |
| `sentenceOf()` (`utils.js`) | Finds the sentence containing a given word for context |
| `wordForms()` (`utils.js`) | Array-guarded accessor for a word's recorded inflections |
| `findExistingWord()` (`utils.js`) | Case-insensitive match on a base form or any recorded inflection |
| `Bp` / `Bg` (`styles.js`) | Shared primary and ghost button styles |
| `authClient` (`authClient.js`) | Neon Auth browser client |

### Telegram bot

Optional. Setup lives in the README; the security model is what matters when
changing it:

- The webhook route's `X-Telegram-Bot-Api-Secret-Token` check is the **only**
  authentication step. It authenticates *Telegram*, not the user — which is
  what makes `from.id` trustworthy as a lookup key downstream. Never add an
  endpoint that accepts a Telegram user id from an untrusted caller.
- Inline-keyboard `callback_data` is signed with an HMAC over the card's
  *current* `next_review_at`, so grading a card invalidates its own buttons.
  That is what makes the stateless review flow safe against Telegram's retries
  and against taps on old messages.
- Link codes are single-use, 10-minute, and stored hashed.
- The webhook always returns 200 once authenticated; a non-2xx makes Telegram
  redeliver the same update on a schedule.
- `/help` is answered before `getDb()` is called, so it stays a database-free
  connectivity test when a deployment is misconfigured. Keep it that way.
- A review session keeps **no** stored state — the next card is derived from
  SQL each turn. Consequently the web app's same-session requeue of failed
  cards (`useReview.js`) is not reproduced in chat.

### API Key Handling

- Users enter their Anthropic API key on first load
- Key is persisted to `localStorage` (not server-side)
- The server route (`route.js`) receives the key per-request and forwards it to Anthropic
- Optional: set `ANTHROPIC_API_KEY` for a personal deployment. `/api/claude`
  then falls back to it, and `useServerKey` (a `GET` on the same route) lets the
  client skip the key screen. The browser never sees the key: `callClaude()`
  simply omits `apiKey`, which the `SERVER_KEY` sentinel in `app/lib/utils.js`
  stands for client-side.
- **`/api/claude` requires a session.** That is what keeps the fallback from
  turning the route into an open proxy spending the owner's credit.

### Styling Conventions

- Dark theme with background `#0f1117`
- Primary color gradient: `#4a7c9e` → `#2d5a7a`
- Part-of-speech colors: verb=green, noun=warm, adjective=blue, adverb=purple
- All styles are inline objects (no CSS files or CSS-in-JS library)
- Two shared button style objects (`Bp` = primary, `Bg` = ghost) are imported from `app/lib/styles.js`

## Common Patterns

- No external state management (no Redux, Zustand, etc.)
- Claude API responses for translations are parsed as JSON with a regex fallback for markdown fences
- Optimistic UI updates for word add/delete with server-side rollback on failure
- `useReview` self-corrects the queue when a word is deleted externally (e.g. another tab)
- SRS reads and writes go through `lib/reviews.js` so the web app and the bot share one path
- Tests mock at the boundary: `vi.stubGlobal("fetch", ...)` for network, and
  `lib/__tests__/helpers/fakeSql.js` for the tagged-template query function

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | Neon pooled connection string |
| `NEON_AUTH_BASE_URL` | Yes | Neon Auth base URL. The Vercel–Neon integration sets `VITE_NEON_AUTH_URL` instead, which `lib/auth/server.js` copies across |
| `ANTHROPIC_API_KEY` | No | Deployment-wide Anthropic key. When set, `/api/claude` falls back to it and the client skips the key screen; a key the user typed still wins |
| `TELEGRAM_BOT_TOKEN` | No | Telegram bot only. The most sensitive secret here — it grants full control of the bot |
| `TELEGRAM_BOT_USERNAME` | No | Telegram bot only; used to build the `t.me` deep link |
| `TELEGRAM_WEBHOOK_SECRET` | No | Telegram bot only; also derives the callback signing key |
| `TELEGRAM_CRON_SECRET` | No | Telegram bot only; bearer token for `/api/telegram/cron` |
| `APP_URL` | No | Public base URL, used in bot messages |

## Deployment

Designed for Vercel — connect the GitHub repo, add the Neon integration, and run
`db/schema.sql` once in the Neon SQL editor. The Telegram bot additionally needs
its webhook registered (`npm run telegram:webhook -- <url>`; `npm run
telegram:status` shows what is currently registered) and a trigger for the
reminder cron.

The reminder cron is triggered by a Val Town scheduled val
(`scripts/valtown-reminder-cron.ts`), which needs `LUKU_APP_URL` and
`TELEGRAM_CRON_SECRET` set in the Val Town account. **Do not move this back to a
GitHub Actions `schedule:` workflow** — that is where it used to live and it
failed badly: GitHub drops scheduled runs under load, delivering as few as 1-2
of 24 requested runs a day, which is enough to miss a user's reminder window
entirely. The README records the measurements and the old workflow. The val
throws on a non-2xx so Val Town's failure notification fires; keep that, because
a swallowed 401 is indistinguishable from an hour with nobody due.

When debugging a missing reminder, first establish that a run actually
*happened*. Reminder delivery is idempotent per user per local day
(`sendReminders` claims each user via `last_reminded_on` before sending), so
extra triggers are safe to add, but a scheduler that skipped leaves no failed
run — just an absence.
