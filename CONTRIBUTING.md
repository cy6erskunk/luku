# Contributing to Luku

## Getting started

1. Clone the repository and run `npm install` (Node 24 — see `engines`)
2. Copy `.env.local.example` to `.env.local` and fill in at least
   `DATABASE_URL` and the Neon Auth URL — either `NEON_AUTH_BASE_URL`, or
   `VITE_NEON_AUTH_URL`, which is what the Vercel–Neon integration sets and
   which `lib/auth/server.js` copies across for you
3. Run `db/schema.sql` once against your database
4. `npm run dev` and open http://localhost:3000
5. Bring an [Anthropic API key](https://console.anthropic.com) — the app asks
   for one on first load and keeps it in `localStorage`. You can skip it and
   use local Tesseract OCR, but translation needs a key.

## Commands

```bash
npm run dev            # dev server
npm run build          # production build
npm run lint           # oxlint
npm test               # Vitest, single run
npm run test:watch     # Vitest, watch mode
npm run test:coverage  # coverage report
npm run telegram:status   # what webhook Telegram currently has registered
```

## How the code is laid out

`CLAUDE.md` has the full map and the reasoning behind it. In short:

- `app/page.jsx` is a thin orchestrator. It composes hooks and stage
  components and owns only the state that genuinely spans them.
- `app/hooks/` holds the domain state — one hook per concern (`useWords`,
  `useReview`, `useSession`, `useApiKey`, `useImageProcessing`, `useDialog`).
- `app/components/` holds presentation, one file per component.
- `app/lib/` is the client half of the utilities; `lib/` is **server-only**.
  Never import `lib/` from a client component — it would pull the database
  driver and `node:crypto` into the browser bundle. `npm run lint` catches the
  common shapes, and `lib/__tests__/serverOnlyBoundary.test.js` is the check
  that cannot be outrun: it resolves every client import and fails on anything
  landing in `lib/`, however deeply the file is nested.
- `lib/shared/` is the one exception: helpers that both halves genuinely need,
  under one condition — **no imports at all**. That is what makes them safe to
  bundle, and it is the line to watch: adding an import to a file in
  `lib/shared/` is what would breach the boundary, not putting a file there.
  `lib/shared/sampleRate.js` is the current occupant, read by the server, edge
  and browser Sentry configs alike.
- `app/api/` holds the route handlers.
- Code both the web app and the Telegram bot need lives in `lib/reviews.js`,
  so a card graded in either place moves through the same path.
- Word bundles live in `lib/bundles.js` (queries), `app/api/bundles/route.js`
  and `app/hooks/useBundles.js`. `CLAUDE.md` explains why membership is a join
  table and why every membership write scopes both sides in one statement.

## Making changes

- **UI**: edit the component under `app/components/`. Styles are inline
  objects; `Bp` (primary button) and `Bg` (ghost button) come from
  `app/lib/styles.js`.
- **Domain logic**: put it in the relevant hook, not in `page.jsx`.
- **Server behaviour**: `app/api/*/route.js`, with anything reusable in `lib/`.
- **A new stage**: add the stage number, the header stepper entry, and a
  component; render it from `page.jsx`.

### Database

Neon Postgres over HTTP, no ORM and no migration tool.

- **The HTTP driver has no *interactive* transactions.** `sql.transaction([...])`
  does exist and is atomic, but it takes a list of queries built before the
  call, so no statement in it can use an earlier one's result. A read cannot
  be held against a later write. Make multi-step writes safe half-completed,
  collapse them into one statement, or guard the write with a compare-and-swap
  on what you read. (`fakeSql` has no `.transaction`, so reaching for it means
  extending the helper too.)
- Migrations are appended to `db/schema.sql` by hand and run in the Neon SQL
  editor. Every statement must be idempotent (`IF NOT EXISTS`,
  `ADD COLUMN IF NOT EXISTS`) and safe to re-run against both a populated
  database and an empty one. Deploying does not migrate anything.
- Because of that, **a route reading a table added by a migration wraps its
  body in `withSchemaGuard()`** (`lib/db.js`), so a database that has not had
  the file re-run answers 503 with the fix instead of an unexplained 500. And
  **never swallow a failed load in a hook**: an empty list is the app's normal
  state, so a silent failure there looks exactly like success.
- Errors from the driver carry Postgres' SQLSTATE on `.code` (`NeonDbError`),
  which is what lets that guard key off `42P01` and `42703` exactly rather than
  matching on message text. Both, because migrations are appended as
  `ALTER TABLE ... ADD COLUMN` more often than as new tables: an older database
  usually has every table and only some of the columns.
- Every query touching user data is scoped by `user.id`.
- Interpolate values through the tagged template — never concatenate them
  into SQL.

#### The driver's other departures from a pooled client

- **Each tagged template is one HTTPS request.** An N+1 costs round trips, not
  just CPU, so prefer one statement that returns what you need — the word list
  gets its bundle membership from a subquery in the same `SELECT` for exactly
  this reason.
- **Errors carry Postgres' SQLSTATE on `.code`** (`NeonDbError`). That is what
  lets `withSchemaGuard()` key off `42P01` exactly, rather than matching on
  message text.
- **`TIMESTAMPTZ` loses microseconds on the way out.** A value read from a row
  is not equal to the row it came from; `scheduleGuard()` in `lib/reviews.js`
  explains what that costs the compare-and-swap.

#### Why a SQL claim can't be settled by reading the diff

Three things about this setup compound, and they make SQL the hardest thing
here to review:

- **The schema is not in the diff.** Queries live in `lib/`, tables and indexes
  in `db/schema.sql`. Whether `ON CONFLICT (user_id, lower(name))` is even
  valid depends on an index declared in another file, so a hunk of `lib/` is
  not enough to judge it.
- **The tests mock the driver.** `fakeSql` records the SQL text and returns
  canned rows; it never parses or executes anything. The suite goes green on
  SQL that Postgres would reject, so "the tests pass" is not evidence that a
  statement runs.
- **CI has no database**, so nothing in the pipeline executes a statement
  either.

A SQL claim — yours, or a review comment's — is therefore settled by running
it. A throwaway cluster costs about a minute:

```bash
initdb -D /tmp/luku-pg -U postgres --auth=trust
pg_ctl -D /tmp/luku-pg -o "-k /tmp/luku-pg -p 55432 -c listen_addresses=" -l /tmp/luku-pg/log start
createdb -h /tmp/luku-pg -p 55432 -U postgres luku

# Twice: every statement in the file has to be safe to re-run.
psql -h /tmp/luku-pg -p 55432 -U postgres -d luku -v ON_ERROR_STOP=1 -f db/schema.sql
psql -h /tmp/luku-pg -p 55432 -U postgres -d luku -v ON_ERROR_STOP=1 -f db/schema.sql

# ...then paste the statement under test, with two user ids, and check both
# that it does what you meant and that it cannot reach the other user's rows.

pg_ctl -D /tmp/luku-pg stop && rm -rf /tmp/luku-pg
```

#### Idioms here that look wrong and are not

Each of these has drawn a review comment, or is a plausible next one.

| Looks wrong | Why it stands |
|---|---|
| `WITH saved AS (INSERT …), attached AS (INSERT … FROM saved)` in `POST /api/words` | A data-modifying CTE is how two writes that depend on each other become one statement here. The driver has no interactive transaction, so the alternative is two requests with a window between them. Note the CTEs share one snapshot: a `SELECT` beside the second insert cannot see what it wrote. |
| `ON CONFLICT (user_id, lower(name))` | Index inference accepts a bare **function call**; this one names `bundles_user_name`. The parentheses the docs' grammar shows are only needed for operator expressions — `name \|\| ''` really is a syntax error, `lower(name)` is not. |
| `DO UPDATE SET name = bundles.name` — a no-op write | It makes the conflict path return a row. `DO NOTHING` returns none, which would make "already there" and "not yours" indistinguishable to the caller. |
| `INSERT ... SELECT ... WHERE w.user_id = ... AND b.user_id = ...` | The authorization check *is* the write. That is how a driver without interactive transactions still gets an atomic "attach this only if both rows are the caller's". |
| `${user.id}` inside a tagged template | A bind parameter, not string interpolation — the driver parameterizes it. Not an injection. |
| Two statements that "should" be one transaction | See the interactive-transaction note above; if the second needs the first's result, no transaction available here can help. |

### Secrets

- Secrets live in environment variables and are documented in
  `.env.local.example`. Never commit one, never log one, and name the
  variable rather than its value in error output.
- Compare secrets in constant time, hashing both sides first so the
  comparison gets equal-length inputs.
- The user's Anthropic key travels input → React state → `localStorage` →
  request body → `/api/claude` → Anthropic. It is never stored server-side.
- The Telegram bot token is the most sensitive secret here: it grants full
  control of the bot. See `README.md` before touching the bot setup.

## Code style

`npm run lint` is oxlint, and it checks correctness — hook rules, unused
identifiers — not style. There is no formatter, so consistency still comes
from matching the file you are in.

- Plain JavaScript, ES modules, named exports (default-export components only).
  The one exception is a standalone script written for another runtime:
  `scripts/valtown-reminder-cron.ts` is TypeScript because it is pasted into
  Val Town, which runs Deno. Nothing here builds, lints or imports it, so it
  costs the toolchain nothing. Code this repo actually runs stays JavaScript.
- Server-side imports use the `@/` alias (`@/lib/db`)
- Inline styles; no CSS files, no CSS framework
- No state management library — hooks and props have been enough
- Don't reformat code you aren't otherwise changing

Comments explain **why**, especially where the code could look simpler than it
needs to be. If a guard exists because of a race, a driver quirk or a
Telegram retry, say so — that is what lets the next person tell whether it is
still needed.

## Accessibility

If you declare an ARIA role, implement the keyboard behaviour it promises. A
`role="menu"` owes focus management, arrow keys, Home/End and Escape; a dialog
owes a focus trap and focus restoration (use the `useDialog` hook). A role
without its keys is worse than a plain button, because a screen reader has
promised something that does not work.

## Tests

Vitest, with `@testing-library/react` for components.

- Put tests in a `__tests__/` directory beside the code.
- Component tests start with `// @vitest-environment jsdom` and query by role
  and accessible name.
- Mock only at the boundary: `vi.stubGlobal("fetch", …)` for the network and
  `fakeSql()` from `lib/__tests__/helpers/fakeSql.js` for the query function.
  `fakeSql` records each call's SQL and values, so assert on those.
- Route tests mock `@/lib/auth/server` and `@/lib/db` through `vi.hoisted()`,
  then `await import()` the route.
- Name tests as behaviour ("rejects a non-numeric grade instead of writing
  NaN"), and assert the negative space too — that a rejected request issued no
  SQL, that a duplicate delivery graded nothing.
- Every bug fix gets a regression test.

## Commits and pull requests

- Everything lands on `main` through a pull request. CI runs `npm ci`,
  `npm run lint` and `npm test` on every PR.
- Run `npm run lint`, `npm test` and `npm run build` before pushing.
- Commit subjects are imperative sentences describing the effect, with no type
  prefix and no trailing period — *"Stop 'Hard' pushing cards months into the
  future"*. Write a body for anything non-trivial: what was wrong, why the
  obvious fix doesn't work, what this does instead. Reference issues with
  `Closes #123`.
- Keep a commit about one thing. Don't fold in a refactor, and don't commit
  lockfile churn that isn't a real dependency change.
- Update `CLAUDE.md` in the same PR when you change the structure, add an
  environment variable, or change a security property.
- New dependencies need a justification in the PR body. The project runs on
  seven runtime dependencies and intends to keep it that way.
