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
  driver and `node:crypto` into the browser bundle.
- `app/api/` holds the route handlers.
- Code both the web app and the Telegram bot need lives in `lib/reviews.js`,
  so a card graded in either place moves through the same path.

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

- **The HTTP driver has no transactions.** Each tagged template is its own
  request, so a read cannot be held against a later write. Make multi-step
  writes safe half-completed, collapse them into one statement, or guard the
  write with a compare-and-swap on what you read.
- Migrations are appended to `db/schema.sql` by hand and run in the Neon SQL
  editor. Every statement must be idempotent (`IF NOT EXISTS`,
  `ADD COLUMN IF NOT EXISTS`) and safe to re-run against both a populated
  database and an empty one. Deploying does not migrate anything.
- Every query touching user data is scoped by `user.id`.
- Interpolate values through the tagged template — never concatenate them
  into SQL.

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

- Plain JavaScript, ES modules, named exports (default-export components only)
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
