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
│   ├── useApiKey.js            # Saved API key, in per-account localStorage
│   ├── useSession.js           # Per-scan translation session, in per-account localStorage
│   ├── useWords.js             # DB word list: fetch, save, update, remove/restore
│   ├── useReview.js            # Flashcard queue: grading, self-correction, reset
│   └── useImageProcessing.js  # File pick, crop UI, Tesseract OCR, AI rescan
├── components/
│   ├── ScanStage.jsx           # Stage 0 — image upload / crop UI
│   ├── ReadStage.jsx           # Stage 1 — tappable text + TranslationPopup
│   ├── ReviewStage.jsx         # Stage 2 — flashcard review
│   ├── ExamplePicker.jsx       # Answer-side popup: request / accept / reject a new example
│   ├── TranslationPopup.jsx    # Absolutely-positioned word popup (inside ReadStage)
│   ├── WordList.jsx            # Full word-list overlay (all stages)
│   ├── ApiKeyScreen.jsx        # API key entry screen
│   ├── TelegramConnect.jsx     # Telegram link/unlink overlay
│   ├── McpConnect.jsx          # MCP token mint/revoke overlay
│   ├── HeaderMenu.jsx          # Header overflow menu (Telegram / MCP / key / sign out)
│   ├── Notice.jsx              # One-line banner for a write that did not land
│   ├── SignIn.jsx              # Auth screen
│   └── LukuLogo.jsx            # SVG logo
└── api/
    ├── claude/route.js         # Server proxy for Anthropic API
    ├── words/route.js          # CRUD for saved vocabulary (PATCH replaces a word's example)
    ├── reviews/route.js        # SRS grading endpoint
    ├── mcp/route.js            # MCP server (bearer-token authenticated, NOT a session)
    ├── mcp/tokens/route.js     # Mint / list / revoke MCP tokens (session authenticated)
    ├── auth/[...path]/route.js # Neon Auth catch-all
    └── telegram/
        ├── webhook/route.js    # Telegram updates (secret-token authenticated)
        ├── link/route.js       # Mint link code / status / unlink (session authenticated)
        └── cron/route.js       # Hourly reminder pass (bearer authenticated)

lib/                            # Server-only (except shared/); app/lib/ is the client half
                                #   boundary enforced by lib/__tests__/serverOnlyBoundary.test.js
├── shared/                     # The one isomorphic tier — no imports, so it is safe to bundle
│   ├── sampleRate.js           # Sentry sample-rate parsing, used by server, edge and browser configs
│   ├── schedule.js             # The columns a grade writes: /api/reviews' reply and applySchedule's merge
│   └── exampleGuide.js         # What makes an example memorable; shared by api.js prompts and MCP tool descriptions
├── db.js                       # getDb() -> neon(DATABASE_URL)
├── srs.js                      # calcSRS() — simplified SM-2; also easeDelta/DEFAULT_EASE_FACTOR, quoted by the MCP instructions
├── reviews.js                  # Due-word queries + gradeWord, shared by web and bot
├── words.js                    # Word *content*: list/get/update the four meaning columns, shared by PATCH and MCP
├── usage.js                    # recordUsage(): token counts of each /api/claude call into claude_usage (no text)
├── auth/server.js              # getAuth()
├── mcp/
│   ├── protocol.js             # JSON-RPC envelope and method dispatch (hand-rolled, no SDK)
│   ├── instructions.js         # What the server tells a client about its SRS, at handshake time
│   ├── tools.js                # list_words / get_word / update_word
│   └── tokens.js               # Bearer tokens: mint, resolve, revoke (hashed)
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

`page.jsx` splits in two: `Luku` is the auth gate and holds no state at all,
and `LukuApp` — keyed on `user.id` — holds everything else. That split is
load-bearing rather than cosmetic. State declared above a gate outlives the
gate closing, so reader state declared in `Luku` would survive a sign-out and
be inherited by whoever signed in next; held in `LukuApp` it is unmounted
instead. Keep new state inside `LukuApp`.

All domain state lives in custom hooks:

| Hook | Owns |
|------|------|
| `useApiKey` | `savedKey` + localStorage persistence, under `luku_api_key:<userId>` |
| `useSession` | Per-scan translation cache + localStorage persistence, under `luku_session:<userId>` |
| `useWords` | `dbWords`, `loadingWords`, `loadError`, word CRUD |
| `useReview` | `queue`, `revIdx`, `showAnswer`, `grading`, SRS grading logic |
| `useImageProcessing` | `busy`, `step`, `err`, `preview`, `ocrProgress`, `ocrSource`, all crop state |

Cross-cutting actions that touch two hooks (`handleAddWord`, `handleDeleteWord`, `handleStartReview`, `handleScanAnother`, `onWord`) are composed in `page.jsx`.

### Key utility functions (`app/lib/`)

| Function | Purpose |
|----------|---------|
| `callClaude()` (`api.js`) | Generic wrapper for Claude API calls via `/api/claude` |
| `ocrImage()` (`api.js`) | Extracts text from image using Claude Vision |
| `translateWord()` (`api.js`) | Gets dictionary form, translations, and part of speech |
| `suggestExample()` (`api.js`) | A fresh example for a saved word, avoiding the ones already seen; shares its memorability guide with `translateWord()` |
| `ocrLocal()` (`ocr.js`) | Tesseract.js OCR with progress callbacks |
| `fileToBase64()` (`image.js`) | Client-side image resize/compress (max 1024px, ≤400KB) |
| `getCroppedImg()` (`image.js`) | Crops a canvas region to base64 |
| `tokenize()` (`utils.js`) | Splits text into words, punctuation, spaces, and line breaks. A word hyphenated across a line break keeps both halves visible but gives each the whole word in `w` and a shared key, so tapping either translates the whole word |
| `dehyphenate()` (`utils.js`) | Rejoins words split across lines; `sentenceOf()` runs it first so context is a whole sentence |
| `sentenceOf()` (`utils.js`) | Finds the sentence containing a given word for context |
| `wordForms()` (`utils.js`) | Array-guarded accessor for a word's recorded inflections |
| `findExistingWord()` (`utils.js`) | Case-insensitive match on a base form or any recorded inflection |
| `savedWordEntry()` (`utils.js`) | Shapes a saved word into popup fields, so tapping a word already on the list shows its stored translation immediately — while the form lookup runs, or without an API key at all |
| `reportClientError()` (`report.js`) | Sends a browser-side failure to Sentry, which `onRequestError` cannot see; skipped while actually offline |
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
  SQL each turn. The web app's same-session requeue of failed cards
  (`useReview.js`) is approximated by the schedule instead: *Again* makes a
  card due in `AGAIN_DELAY_MINUTES` (10, `lib/srs.js`), so it comes round
  again in a chat session still going by then; a session that runs out first
  ends by saying how many are coming back. That applies to web grades too.

### MCP server

Optional, and the second non-session entry point after the Telegram webhook.
`/api/mcp` exposes the signed-in user's vocabulary to an MCP client (Claude
Desktop, Claude Code) so cards can be refined in a chat — translations, part of
speech and example sentences. Setup is in the README; the security model is
what matters when changing it:

- **The bearer token is the only authentication step.** An MCP client is not a
  browser and carries no Neon Auth cookie, so `getAuth().getSession()` cannot
  authenticate it and this route deliberately does not call it. That check is
  what makes the `user_id` it resolves trustworthy downstream, exactly as the
  webhook secret is what makes Telegram's `from.id` trustworthy. Never add an
  endpoint here that takes a user id from a caller.
- **The identity is still the web app's.** A token is minted by
  `/api/mcp/tokens`, which *is* session-authenticated, and the `user_id` frozen
  into the row is whatever `getSession()` reported at that moment. Signing in
  with Google is what decides whose vocabulary a token reaches.
- **Keep the auth seam one function wide.** The route's only auth step is
  "header → `user_id`". Neither `lib/mcp/protocol.js` nor `lib/mcp/tools.js`
  knows how the caller was identified; they take a `userId`. An OAuth issuer, if
  one is ever wanted, resolves through the same call and changes nothing else.
- Tokens are stored **hashed**, never expire, and are revoked. Only
  `left(token_hash, 8)` ever reaches the browser, so the panel can list and
  revoke without being handed a credential.
- **The writable surface is four columns**: `translations`, `pos`, `example`,
  `example_translation`. `updateWordContent` names those and no more, so
  refining a card cannot reschedule it, rename its base form or touch its
  recorded inflections. That is the promise the tool descriptions make to the
  reader, and `lib/__tests__/words.test.js` is what holds it.
- The protocol is **hand-rolled** (`lib/mcp/protocol.js`) rather than taken from
  `@modelcontextprotocol/sdk` — a tools-only server is five JSON-RPC methods,
  and sessions, SSE and sampling would all go unused. The cost is ours:
  `PROTOCOL_VERSION` is what we claim to speak, and a spec revision is a
  deliberate change.
- **The server describes its own scheduling, twice over.**
  `lib/mcp/instructions.js` is returned as `InitializeResult.instructions`, the
  spec's slot for "how to use this server", and `SCHEDULE_FIELD_GUIDE` in
  `lib/mcp/tools.js` restates the field semantics in the `list_words` and
  `get_word` descriptions. The duplication is deliberate: `instructions` support
  is uneven across clients, while a tool description always arrives. What both
  exist to prevent is a specific wrong guess — Luku is **simplified SM-2, not
  FSRS**, and `review_count` is a streak of consecutive passes that *Again*
  resets to 0, not a lifetime total, so a client left to assume reads a
  just-failed card as a brand new one.
- **Every number in that text is interpolated from `lib/srs.js`**, never typed:
  `easeDelta`, `DEFAULT_EASE_FACTOR` and `MIN_EASE_FACTOR` exist to be quoted.
  Tuning the algorithm then updates its own documentation, and
  `lib/mcp/__tests__/instructions.test.js` fails if a number is pasted in as a
  literal. `calcSRS` keeps the ease arithmetic inline rather than calling
  `easeDelta` — regrouping it shifts the result by one float bit for about a
  third of inputs, and values already in the column are not worth moving for a
  tidier line; a test in `lib/__tests__/srs.test.js` holds the two in step.
- **`ease_factor` is returned although nothing can write it**, which reverses the
  first cut's judgement that it was noise. Nothing counts lapses and every
  failure resets `review_count`, so it is the only durable record of difficulty
  there was — `filter: "difficult"` orders by it and returns only cards below the
  starting value, i.e. ones that have lost ground. Don't invert that into "the
  default means never graded": easy answers push the factor above it, and a
  long mix accumulates back onto it exactly — seven Easy cancel five Hard. It is not a new
  disclosure: `SCHEDULE_FIELDS` already sends it to the browser on every grade.
- **`lapses` exists because `ease_factor` saturates.** An *Again* costs 0.54, so
  three failures put a card on the 1.3 floor and every later failure moves
  nothing; on a real 333-card collection that left ~170 cards pinned there and
  mutually indistinguishable, which is what made `difficult` rank poorly. So
  `lapses` is the **tiebreak within an ease level**
  (`ORDER BY ease_factor ASC, lapses DESC, …`), not the leading term — leading
  with it would let a card failed once since the column existed outrank one
  failed twenty times before it. It counts from its migration forward and
  cannot be back-filled, because each failure overwrote the only count there
  was. It *is* in `SCHEDULE_FIELDS`: the word list loads with `SELECT *` and so
  already carries the column, and a grade that did not return it would leave
  the browser's copy one behind.
- **`filter: "lapsed"` is the sharp question.** `difficult` answers "has ever
  lost ground", which on a well-used collection is most of the list (270 of 333
  on the author's). `review_count = 0 AND ease_factor < DEFAULT` is "failed at
  its last review" — `review_count` reaches 0 only after a failure or before
  the first review, and the ease condition rules the second out.
- **`filter: "due"` orders by `next_review_at`**, every card, so one ascending
  sort gives both "most overdue" and "coming due soonest". It also returns
  `due_now`, the count already due against the database's `NOW()`, because a
  chat client has no reliable clock to say where overdue ends.
- A tool that refuses or finds nothing answers with `isError: true` inside a
  successful result, because the model is meant to read it and try again. Only a
  broken envelope is a JSON-RPC error.
- **Every Claude surface can reach it**, by two different routes, which is why
  the panel names both. Claude Code takes the `Authorization` header on the
  command line. Claude Desktop, claude.ai and mobile take it as a *custom
  connector* with authentication "No sign-in" and the token under **Request
  headers** — "no sign-in" there means no OAuth, not no credential. Their
  config files only launch local stdio servers, so the connector dialog is the
  route, and where its **Request headers** section is missing (it is in beta)
  the `mcp-remote` bridge stands in. The README has both and the failure
  symptoms.
- A connector's requests come from **Anthropic's egress range**
  (`160.79.104.0/21`), not the reader's machine, so the deployment has to be
  publicly reachable. `localhost` works in Claude Code and cannot work as a
  connector — worth knowing before debugging a connector against `npm run dev`.
- An MCP write does **not** invalidate an open browser tab: a refined card shows
  stale until the next load. `useReview` self-corrects for a word deleted
  elsewhere; an edited one is not worth a subscription.

### API Key Handling

- Users enter their Anthropic API key on first load
- Key is persisted to `localStorage` (not server-side), under a key carrying
  the account's own id. Both hooks take a `userId` for that reason: one shared
  name handed the key to whoever signed in next on a shared browser, and every
  translation was then billed to its owner with nothing on screen to say so.
  The pre-scoping name is cleared rather than adopted on load — the next person
  to sign in is not necessarily the key's owner
- The server route (`route.js`) receives the key per-request and forwards it to Anthropic
- Optional, **development only**: set `ANTHROPIC_API_KEY` in `.env.local` and
  `/api/claude` falls back to it, while `useServerKey` (a `GET` on the same
  route) lets the client skip the key screen. The browser never sees the key:
  `callClaude()` simply omits `apiKey`, which the `SERVER_KEY` sentinel in
  `app/lib/utils.js` stands for client-side.
- `route.js` reads that variable only when `NODE_ENV !== "production"`, so a
  deployment ignores it however it is set. Don't "fix" that: a deployed
  fallback is spent by whoever is signed in, not by whoever owns the key, and
  the owner gets no per-user visibility or limit. If a shared key is ever
  wanted, it needs a per-user quota, not this variable.
- Each successful call's `usage` token counts go to `claude_usage`
  (`lib/usage.js`), written in `after()` so a failed insert never costs the
  reply. Tokens, not dollars — compute cost at query time. `kind` is a
  client-supplied label (`translate` / `ocr` / `example`, else `other`); no
  prompt or reply text is stored.
- **`/api/claude` requires a session** regardless, which stops the route being
  an open relay to Anthropic for anyone who finds the path.

### Styling Conventions

- Dark theme with background `#0f1117`
- Primary color gradient: `#4a7c9e` → `#2d5a7a`
- Part-of-speech colors: verb=green, noun=warm, adjective=blue, adverb=purple
- All styles are inline objects (no CSS files or CSS-in-JS library)
- Two shared button style objects (`Bp` = primary, `Bg` = ghost) are imported from `app/lib/styles.js`

## Common Patterns

- No external state management (no Redux, Zustand, etc.)
- Claude API responses for translations are parsed as JSON with a regex fallback for markdown fences
- Optimistic UI updates for word add/delete with server-side rollback on
  failure. The rollback covers the *display* too: the popup's "✓ Added to
  review" is withdrawn when the save is refused, because the word list is the
  only other place the reader would find out
- Every write that fails leaves a line in `Notice` — what the reader lost,
  never why, and never what the `catch` cannot know: a refusal and a response
  lost after the write committed are indistinguishable there. A failure raised
  inside a dialog is reported by that dialog (`WordList` owns its delete
  error), because a page-level banner beneath an `aria-modal` overlay is
  unreachable and unannounced. The cause goes to Sentry through `reportClientError()`
  (`app/lib/report.js`), which the browser needs because `onRequestError` only
  sees requests that reached a route handler. A deployment whose database never
  had `db/schema.sql` re-run fails exactly this way, and `SELECT *` names no
  columns — so a half-applied schema serves the word list happily and rejects
  every insert, which is why the withdrawn "✓" matters
- `useReview` self-corrects the queue when a word is deleted externally (e.g. another tab)
- SRS reads and writes go through `lib/reviews.js` so the web app and the bot share one path
- Tests mock at the boundary: `vi.stubGlobal("fetch", ...)` for network, and
  `lib/__tests__/helpers/fakeSql.js` for the tagged-template query function

## Before opening or pushing to a PR

Run `/pre-pr-review` (`.claude/skills/pre-pr-review/`). It walks
`checklist.md` — these practices turned into questions, selected by the paths
the diff touches — plus `/code-review`, fixes what it finds, and records the
pass for the commit. A `PreToolUse` hook (`.claude/hooks/require-review.mjs`)
refuses Claude's own PR-creation tool calls from a commit with no recorded
pass. It cannot see the Claude app's **Create PR** button or GitHub's UI, so
a PR opened that way has not been reviewed: run the skill on it. After a PR's review
lands, `/pre-pr-review learn <PR>` reads the threads and adds what the
checklist missed to `findings.md`, promoting a pattern into the checklist once
it recurs; declined findings become its *Proportion* lines.

## Before pushing UI that waits on a request

Every one of these came up in review on #137, one per round, when they could
all have been answered before the first push. Answer each one for the change
in hand; `/pre-pr-review` asks them again as its *Async UI* section.

- **What else writes this row while my request is out?** A reply must update
  only the fields its own write owns. Grading once answered with the whole
  row, and a reply swapped in whole put back an example saved in the meantime.
  Return only the columns the write touched (`/api/reviews` projects through
  `lib/shared/schedule.js`), merge only those, and never replace the local row.
- **What if the component unmounts mid-request?** A reply arriving after it
  is gone must write to nothing, and a *failure* arriving after it is gone
  must still be told. If the popup was the only place an error is shown, hand
  it to `Notice` when the popup is gone (see `onSaveLost` in `ExamplePicker`).
  Don't let the reader close the one place a pending failure would appear.
- **What decides whether this UI is open, and does every way out reset it?**
  State tied to "the current card" must clear on every path off that card:
  grade, skip, delete, a pass restarted from the header, a stage switch. Keying
  on queue position alone collides when the same word comes back at the
  same index. Prefer one rule ("closes whenever the answer hides") to wrapping
  each exit.
- **Does it survive Strict Mode?** The App Router runs every effect
  setup → cleanup → setup in development. An effect that *starts* a paid
  request must be cancellable before it is sent (a cleared zero-delay timer),
  not merely have its reply ignored.
- **Keyboard: where does focus go, and who else hears this key?** Closing
  something that holds focus must return focus to what opened it, after
  the closing render, since a still-disabled button cannot take focus. Handle
  keys on the element, not `window`: `HeaderMenu` already listens for Escape
  on `document`, so a second global listener closes two things with one
  press. (`useDialog` catches Escape on `document` in the capture phase and
  stops it, which is the one global handler that is meant to win.)
- **Does the state live as long as the UI's promise?** "Never offers the same
  example twice" needs a list that outlives the popup it was shown in.
- **Can each test fail for the reason its name gives?** Values that are meant
  to differ (request body vs stored row) must differ in the fixture, and a new
  test should be seen failing without the change it covers.

Not every finding a reviewer raises is worth code. Before building a fix for
a race, trace a realistic path to it: a sub-second request that has to outlast
deliberate human navigation, with a worst case of a stale screen until the
next load, is not worth a lifted lock or a versioned write. Say so on the
thread instead.

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | Neon pooled connection string |
| `NEON_AUTH_BASE_URL` | Yes | Neon Auth base URL. The Vercel–Neon integration sets `VITE_NEON_AUTH_URL` instead, which `lib/auth/server.js` copies across |
| `NEON_AUTH_COOKIE_SECRET` | Yes | Signs Neon Auth's session-cache cookie; at least 32 characters (`openssl rand -base64 32`). Without it every session route returns 500 and `/api/auth` says why |
| `ANTHROPIC_API_KEY` | No | **Development only.** `/api/claude` falls back to it and the client skips the key screen; a key the user typed still wins. Ignored when `NODE_ENV=production`, so a deployment never spends one key on every signed-in user |
| `TELEGRAM_BOT_TOKEN` | No | Telegram bot only. The most sensitive secret here — it grants full control of the bot |
| `TELEGRAM_BOT_USERNAME` | No | Telegram bot only; used to build the `t.me` deep link |
| `TELEGRAM_WEBHOOK_SECRET` | No | Telegram bot only; also derives the callback signing key |
| `TELEGRAM_CRON_SECRET` | No | Telegram bot only; bearer token for `/api/telegram/cron` |
| `APP_URL` | No | Public base URL, used in bot messages |
| `SENTRY_TRACES_SAMPLE_RATE` | No | Server/edge trace sampling, 0–1. Defaults to 1 outside production, 0.1 in it |
| `NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE` | No | The browser's copy of the same, inlined at build time |

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
