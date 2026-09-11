# CLAUDE.md — Onboarding for Claude Code

## Project Overview

**Luku** is an AI-powered Finnish language learning app. Users photograph Finnish text, tap words for instant translations, group them into named bundles, and review vocabulary with flashcards.

## Tech Stack

- **Framework**: Next.js 16 (App Router)
- **UI**: React 19, plain JavaScript (no TypeScript)
- **Styling**: Inline CSS (no CSS framework)
- **AI**: Anthropic Claude API (claude-sonnet-4-6) via server-side proxy
- **Database**: Neon Postgres over HTTP (`@neondatabase/serverless`). No ORM, no migration tool — `db/schema.sql` is run by hand and migrations are appended to it as idempotent `ALTER TABLE ... IF NOT EXISTS` statements. **The HTTP driver has no *interactive* transactions**: `sql.transaction([...])` runs a fixed list of statements atomically, but every query is built before the call, so no statement can use an earlier one's result. A read-then-decide-then-write therefore needs a compare-and-swap, and multi-step writes must be safe half-completed. `CONTRIBUTING.md` has the driver's other departures from a pooled client, and how to actually run a statement.
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
│   ├── useWords.js             # DB word list: fetch, save, update, remove/restore, bundle membership
│   ├── useBundles.js           # Named word bundles + the active one (localStorage)
│   ├── useReview.js            # Flashcard queue: grading, self-correction, reset
│   └── useImageProcessing.js  # File pick, crop UI, Tesseract OCR, AI rescan
├── components/
│   ├── ScanStage.jsx           # Stage 0 — image upload / crop UI
│   ├── ReadStage.jsx           # Stage 1 — tappable text + TranslationPopup
│   ├── ReviewStage.jsx         # Stage 2 — flashcard review
│   ├── TranslationPopup.jsx    # Absolutely-positioned word popup (inside ReadStage)
│   ├── WordList.jsx            # Full word-list overlay (all stages), filtered by bundle
│   ├── BundlePicker.jsx        # Select or create the bundle words are collected into
│   ├── BundleReview.jsx        # Start a review of one bundle by name
│   ├── ApiKeyScreen.jsx        # API key entry screen
│   ├── TelegramConnect.jsx     # Telegram link/unlink overlay
│   ├── HeaderMenu.jsx          # Header overflow menu (Telegram / key / sign out)
│   ├── SignIn.jsx              # Auth screen
│   └── LukuLogo.jsx            # SVG logo
└── api/
    ├── claude/route.js         # Server proxy for Anthropic API
    ├── words/route.js          # CRUD for saved vocabulary (PATCH edits bundle membership)
    ├── bundles/route.js        # List / create / delete word bundles
    ├── reviews/route.js        # SRS grading endpoint
    ├── auth/[...path]/route.js # Neon Auth catch-all
    └── telegram/
        ├── webhook/route.js    # Telegram updates (secret-token authenticated)
        ├── link/route.js       # Mint link code / status / unlink (session authenticated)
        └── cron/route.js       # Hourly reminder pass (bearer authenticated)

lib/                            # Server-only (except shared/); app/lib/ is the client half
                                #   boundary enforced by lib/__tests__/serverOnlyBoundary.test.js
├── shared/                     # The one isomorphic tier — no imports, so it is safe to bundle
│   ├── sampleRate.js           # Sentry sample-rate parsing, used by server, edge and browser configs
│   └── bundle.js               # Bundle name/id rules, so the client cannot hold a value the route rejects
├── db.js                       # getDb() -> neon(DATABASE_URL), plus withSchemaGuard()
├── srs.js                      # calcSRS() — simplified SM-2
├── reviews.js                  # Due-word queries + gradeWord, shared by web and bot
├── bundles.js                  # Bundle CRUD and word_bundles membership writes
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
| `useWords` | `dbWords`, `loadingWords`, `wordsError`, word CRUD, bundle membership |
| `useBundles` | `bundles`, `loadingBundles`, `bundlesError`, `activeBundleId` (localStorage), create/delete |
| `useReview` | `queue`, `revIdx`, `showAnswer`, `grading`, SRS grading logic |
| `useImageProcessing` | `busy`, `step`, `err`, `preview`, `ocrProgress`, `ocrSource`, all crop state |

Cross-cutting actions that touch two hooks (`handleAddWord`, `handleDeleteWord`, `handleStartReview`, `handleStartBundleReview`, `handleDeleteBundle`, `handleScanAnother`, `onWord`) are composed in `page.jsx`. `bundleStats` — each bundle plus its word and due counts — is derived there from `dbWords` rather than fetched, so an optimistic add or delete moves the counts at once and a bundle review always offers exactly what it will walk.

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
| `wordBundleIds()` / `inBundle()` (`utils.js`) | Array-guarded accessor for a word's bundles, and a membership test that treats "no bundle" as matching nothing |
| `responseError()` (`utils.js`) | Turns a not-ok response into an Error carrying the server's own `error` message, or the status when there is no readable body |
| `shuffled()` (`utils.js`) | Fisher-Yates on a copy, for the practice passes |
| `findExistingWord()` (`utils.js`) | Case-insensitive match on a base form or any recorded inflection |
| `savedWordEntry()` (`utils.js`) | Shapes a saved word into popup fields, so tapping a word already on the list shows its stored translation immediately — while the form lookup runs, or without an API key at all |
| `Bp` / `Bg` (`styles.js`) | Shared primary and ghost button styles |
| `authClient` (`authClient.js`) | Neon Auth browser client |

### Word bundles

A bundle is a named group of words — normally "the words from this page".

- Membership is **many-to-many** (`word_bundles`), not a column on `words`.
  Words are unique per `(user_id, base)`, so a word met again on a second page
  has to join that page's bundle without leaving the first.
- The picker sets an *active* bundle, remembered in `localStorage` **under a
  key namespaced by account** (`luku_bundle:<userId>`). A bundle is one
  account's row, not a browser preference: a shared key would leave one
  account's id live under the next one's session until their list loaded, and
  if that load failed, indefinitely. Every word added while a bundle is set
  goes in, in the same **statement** that saves the word: `POST /api/words`
  takes an optional `bundleId` and attaches it in a data-modifying CTE, so the
  membership cannot be separated from the word it belongs to. Two statements
  left a window in which the reader could take the tag off between them, only
  for the attach to put it back. The CTEs share one snapshot, so the returned
  `bundle_ids` cannot see the row inserted beside it — the route unions the
  attached id in. The selection outlives the list that names it — it is
  read from `localStorage` before `/api/bundles` answers, and survives a failed
  load — so `BundlePicker` gives it an option of its own while it is
  unresolved. Without one the `<select>` has no option carrying its value and
  reads as unselected, while saves keep quoting the remembered id.
- Names are unique per user **case-insensitively**, enforced by the expression
  index `bundles_user_name`. That index is also the `ON CONFLICT` target that
  makes "create a bundle called X" one idempotent statement: the driver has no
  interactive transaction, so a select-then-insert pair could otherwise produce
  two bundles with the same name. (A bare function call is a valid inference
  target — see the idioms table in `CONTRIBUTING.md` before "fixing" it.)
- Both membership writes scope *both* sides to the caller in the same statement
  as the write. A forged bundle id must not be able to attach someone else's
  word, and there is no transaction to check ownership in beforehand. The
  insert uses a no-op `DO UPDATE` rather than `DO NOTHING`, so "already a
  member" still returns a row and stays distinguishable from "not yours". The
  delete would be safe scoping the word alone — a caller can only reach rows
  hanging off their own words — but it scopes both anyway, because "both sides,
  always" is a rule a reader can check at a glance.
- **A load's merge respects what this session has already deleted.** A bundle
  can be created and deleted while the initial GET is still out, and that
  snapshot was taken before the delete. `useBundles` keeps the ids it has
  confirmed deleted since the load began and filters them out of the merge, or
  the row comes back as a ghost that every later delete can only 404 on. The
  same tombstone refuses a *create* that answers with a deleted id: its insert
  ran while the name was still taken, so the row it names is gone. A genuine
  re-create of that name gets a new id, which is what tells the two apart.
- **A membership edit names one membership at every step** — the optimistic
  update, the reconcile against the response, and the rollback. The PATCH
  answers with the word's whole `bundle_ids`, and applying all of it would let
  a slow answer about one bundle resurrect another that a faster request had
  already removed. Edits to the *same* membership are chained
  (`serializePerMembership` in `useWords`), because a PATCH is several
  statements with no transaction around them: run in parallel, an add and a
  remove of the same pair can land in the wrong order. Different memberships
  still go in parallel.
- Deleting a bundle deletes the grouping only; the words keep their
  translations, their SRS schedule and any other bundle. `ON DELETE CASCADE` on
  both foreign keys is what makes the single-statement deletes complete.
- Reviewing a bundle is a client-side filter over `dbWords`, so it needs no new
  query. Due cards go through the normal SRS pass; a bundle with nothing due
  gets a practice pass instead. Words added this session are held out of the
  bundle's due count and queue exactly as they are from the whole-vocabulary
  one — they are due the moment they are saved, and grading them before the
  keep-or-remove pass would schedule a word the reader has not kept yet. They
  do take part in the practice pass, which writes no schedule.
- **The Telegram bot is bundle-unaware** — it reviews everything that is due,
  as before. Scoping a chat session to a bundle would need selection state the
  stateless review flow deliberately does not keep.

### When the schema has not been run

Nothing deploys `db/schema.sql`; it is run by hand. A deployment pointed at a
database that predates the last appended migration is therefore a normal way to
be wrong, and it used to be **invisible**: the query threw, Next answered 500
with no body of ours, `useWords` swallowed it, and the app rendered an account
with no saved words — which is exactly what a new account looks like. The only
hint was a missing word-count chip.

These rules keep that from happening again:

- **A route that can hit a not-yet-created table wraps its body in
  `withSchemaGuard()`** (`lib/db.js`). It turns Postgres' `42P01` into a 503
  naming `db/schema.sql`, and rethrows everything else so a real bug stays a
  500. Bundles widen what that covers: membership is part of the word list
  now, so a missing `word_bundles` takes the whole vocabulary down with it and
  `/api/words` needs the guard on the read, the save and the membership edit
  alike. DELETE stays unguarded — it names only `words`, and cannot be reached
  before the list has loaded.
- **A failed load is never swallowed.** `useWords` and `useBundles` expose
  `wordsError` / `bundlesError`, read through `responseError()` so the
  server's message is what the reader sees, and `page.jsx` renders them in one
  banner. This matters most for lists whose empty state is unremarkable: any
  silent failure there is indistinguishable from success. A load error is not
  dismissible (it describes the state of the screen); a failed action is.
- **A request that answers after the account changed is dropped.** Both list
  hooks take the `cancelled` flag `useServerKey` uses. Signing out and back in
  as someone else overlaps two loads, and without it the first account's data
  — or its error — can land under the second account's session. The writes
  need the same guard and cannot use that flag, since they do not belong to
  the effect: `useBundles` compares against `accountRef`, so a create that
  answers late cannot drop one account's bundle into the next one's list.
- **A write withholds its result from the caller too, not just from the
  state.** `createBundle` and `saveWord` return null when the account moved
  while they were in flight: `BundlePicker` selects whatever `createBundle`
  hands back and `page.jsx` files whatever `saveWord` hands back under the
  session's new words, and the hooks holding both are still mounted after a
  switch. Guarding only the `setState` leaves the stale row travelling by
  return value. **A failure is withheld on the same terms as a success**:
  `saveWord`, `createBundle` and `deleteBundle` return rather than throw when
  the account moved under them, because `page.jsx` and `BundlePicker` both
  outlive the switch — a catch there would roll back a popup belonging to the
  old session, raise its error in the new one's banner, or clear the name the
  next account is typing.
- **The page's own guards compare a screen counter, not the account id.**
  Signing out and back in as the *same* account restores the id, so an id
  comparison cannot tell that work apart from work the current screen started
  — and the screen was reset in between. `screenRef` in `page.jsx` moves on
  every account change and is what every handler there captures. The hooks
  keep comparing ids deliberately: they ask whose *list* a row belongs in, and
  that answer does not change across a sign-out and back.
- **A reset stops the work, not just the drawing.** `useImageProcessing.reset()`
  and `useReview.reset()` bump a run counter that every async completion
  checks — including the `finally` clauses, which were clearing the busy and
  grading flags out from under whatever the next account had started. Without
  it an OCR pass outlived the screen that began it and called `onTextReady`,
  putting the previous account's photographed page in front of the next one.
- **A confirmed delete reasserts itself against the list as it stands.** The
  optimistic removal is not the last word: until the DELETE lands the name is
  still taken server-side, so creating a bundle by that name in the meantime
  answers with the very row on its way out (the insert is idempotent by name)
  and puts it back — selected. `deleteBundle` therefore filters the id out
  again on success and clears the selection if it has been reclaimed.
- **A rollback undoes its own optimistic change and nothing else.** Deleting
  the active bundle clears the selection, so a refused delete restores it —
  but only if nothing has claimed it since, or a failure would overwrite a
  choice the reader made while the request was in flight. `activeRef` follows
  the latest *call* rather than the latest render, because a rollback runs in
  the same tick as the clear it is undoing.
- **A list snapshot never overwrites a mutation made while it was in flight.**
  The bundle picker stays usable while the list loads, so a bundle can be
  created before the initial GET answers. `useBundles` empties the list before
  fetching, which is what makes the merge exact: anything present when the
  snapshot lands was necessarily created since, so it is kept alongside the
  rows. Replacing wholesale would erase a bundle the server has, and the
  stale-selection sweep would then drop it as the active one too.
- **An empty list after a *failed* load means nothing.** It is not evidence the
  rows are gone, so nothing may be pruned on the strength of it: `useBundles`
  gates its stale-selection cleanup on `bundlesError`, or a dropped connection
  would silently discard the reader's active bundle and its localStorage entry.
- **An error is rendered where the action was taken.** `WordList` declares
  `aria-modal` over a backdrop above `page.jsx`'s banner, so a failure from
  inside that overlay reported by the page reaches nobody — invisible behind
  the dialog and hidden from assistive technology by the modal semantics. The
  overlay renders its own copy and the page suppresses its banner while it is
  open.
- **An optimistic update is rolled back when the write fails.** The same trap
  in a different shape: `handleAddWord` marks a word added before the save
  lands, and the popup swaps its Add button for "✓ Added to review". Left up
  after a failure that tells the reader the word is saved *and* takes away
  their way to retry, so the catch restores both and reports why.

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
