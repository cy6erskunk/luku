# Luku — Project Practices

How this codebase is written, reviewed, deployed and kept alive. It is
descriptive: everything below is already the practice in the repository, and
most rules exist because something once went wrong. `CLAUDE.md` says *what the
project is*; this says *how we work on it*.

Where a rule has a reason, the reason is the rule — if the reason stops
applying, change the rule rather than working around it.

---

## 1. Code style

`npm run lint` is oxlint, and it checks correctness, not style: hook rules,
unused identifiers, the mistakes that survive careful reading. There is no
formatter, so consistency still comes from matching the surrounding file rather
than from a tool.

Two React rules are deliberately off in `.oxlintrc.json` —
`react/set-state-in-effect` and `react/refs` — because they flag four call
sites this codebase chose and documents. The config says which and why, since
that is where someone would otherwise "fix" them. Turn either back on with the
code change that makes it pass, not on its own.

**Do**

- Write plain JavaScript. No TypeScript, no build-time codegen. The one
  exception is a script written for someone else's runtime:
  `scripts/valtown-reminder-cron.ts` is TypeScript because it is pasted into
  Val Town, which runs Deno. Nothing here builds, lints or imports it, so it
  costs the toolchain nothing. Code this repo actually runs stays JavaScript.
- Use ES modules with named exports; default-export only React components.
- Import server-side modules through the `@/` alias (`@/lib/db`), which
  `jsconfig.json` maps to the repo root and `vitest.config.js` mirrors for Vite.
- Keep functions small and pure where the work allows it — `lib/srs.js`,
  `lib/telegram/render.js` and `app/lib/utils.js` are pure and are tested
  directly because of it.
- Use inline style objects, and reach for the shared `Bp` (primary) and `Bg`
  (ghost) button styles in `app/lib/styles.js` before inventing a button.
- Keep the dark palette: background `#0f1117`, primary gradient
  `#4a7c9e → #2d5a7a`, and the part-of-speech colours already in use.

**Don't**

- Don't add a CSS file, a CSS-in-JS library, or a UI framework.
- Don't add a state management library. Component state, custom hooks and props
  have been sufficient; if they stop being sufficient, that is a discussion, not
  a drive-by dependency.
- Don't reformat code you aren't otherwise changing. A diff should be readable
  as a change of behaviour.

---

## 2. Comments

This repo comments unusually heavily, and deliberately: almost every non-obvious
line carries the constraint that forced it. Look at `lib/reviews.js`,
`lib/redact.js` or `app/hooks/useDialog.js` for the register.

**Do**

- Explain *why*, especially when the code looks like it could be simpler.
  "Postgres FLOAT columns can arrive as strings, and `"2.5" + 0.1` would
  concatenate" is worth five lines; "increment the counter" is worth none.
- Put a module-level docblock on anything with a security or concurrency
  contract, stating what it guarantees and what it assumes.
- Name the failure that a guard prevents, so a later reader can tell whether the
  guard is still needed.

**Don't**

- Don't restate the code in prose.
- Don't delete a comment because the code around it changed — decide whether the
  constraint still holds, and update it.

---

## 3. Architecture boundaries

- `app/page.jsx` is an orchestrator only. Domain state lives in `app/hooks/*`;
  presentation lives in `app/components/*`. Actions that touch two hooks are
  composed in `page.jsx` — that is the only place cross-hook coupling belongs.
- `lib/` is server-only. `app/lib/` is the client half. Never import from `lib/`
  into a client component: it would drag `node:crypto`, the database driver and
  secrets into the browser bundle.
- Anything both the web app and the bot need goes in a shared module.
  `lib/reviews.js` exists precisely so a card graded in Telegram and a card
  graded in the browser move through the same code.
- New UI stage: add the stage number, the header stepper entry, and a component
  under `app/components/`.

**Don't** grow `page.jsx` with feature logic, and don't reimplement SRS reads or
writes anywhere other than `lib/reviews.js`.

---

## 4. Database

Neon Postgres over HTTP, no ORM, no migration tool. Two properties dominate
every decision here.

### The HTTP driver has no transactions

Each tagged template is its own request. A read cannot be held against a
subsequent write.

**Do**

- Make multi-step writes safe when half-completed, or collapse them into one
  statement. `claimCodeAndLink()` claims the code and inserts the link in a
  single CTE so a constraint violation rolls the claim back with it — that is
  what makes the bot's "disconnect and try again" message actually true.
- Guard updates with a compare-and-swap on the state you read.
  `gradeWord()` matches on `next_review_at` so a Telegram redelivery grades the
  card zero times rather than twice.
- Push concurrency invariants into the schema. The partial unique index
  `telegram_link_codes_active` is what stops two concurrent mints leaving two
  redeemable deep links; a delete-then-insert pair could not.
- Claim before you act on an external system. `sendReminders()` stamps
  `last_reminded_on` first, so the loser of a race skips instead of double
  messaging.

**Don't**

- Don't write read-then-write sequences that assume nothing moved in between.
- Don't use `BEGIN`/`COMMIT`. They will not do what you expect on this driver.

### Migrations are appended to `db/schema.sql`, by hand

**Do**

- Write every statement idempotently: `CREATE TABLE IF NOT EXISTS`,
  `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`.
- Guard backfills that reference columns a fresh install never had (see the
  `DO $$ ... information_schema` block around the `forms` backfill).
- Assume the file is re-run whole against a live database and against an empty
  one, and that both must succeed.
- Add a comment saying which deployments a migration is for.

**Don't** rewrite history in the file, and don't introduce a migration tool
without also solving how the existing hand-run deployments adopt it.

### Query rules

- Every query touching user data is scoped by `user.id`. No exceptions.
- Use tagged-template interpolation for values — it parameterises. Never
  concatenate a value into SQL.
- Validate ids before they reach Postgres. `isValidWordId()` rejects anything
  past int4 range so an oversized id is a 400 rather than a 500.

---

## 5. API routes

Every protected route starts with the same three lines, in this order:

```js
const { data: session } = await getAuth().getSession();
const user = session?.user;
if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
```

**Do**

- Validate input before the first query, and return 400 with a specific message.
  The route tests assert that a rejected request issues *no* SQL at all.
- Use honest status codes: 401 unauthenticated, 400 malformed, 404 not yours or
  not there, 409 conflict, 503 not configured.
- Initialise clients lazily (`getDb()`, `getAuth()`), so a missing env var fails
  a request rather than the build.

**Don't**

- Don't return a 500 for something the caller got wrong.
- Don't let an endpoint accept an identity from the caller. The Telegram
  `from.id` is trustworthy *only* because the webhook secret authenticated
  Telegram itself; an endpoint taking a Telegram user id from anyone else would
  be an account-takeover primitive.

---

## 6. Secrets and security

The bot token is the most sensitive secret in the project: it grants full
control of the bot, including reading every message sent to it.

**Do**

- Keep secrets in environment variables, documented in `.env.local.example` with
  a note on how to generate them and what breaks when they are wrong.
- Generate webhook and cron secrets as hex (`openssl rand -hex 32`) — Telegram
  restricts `secret_token` to `A-Za-z0-9_-` and rejects base64.
- Compare secrets in constant time, and hash both sides first so the comparison
  always gets equal-length inputs (`timingSafeEqualHex(sha256(a), sha256(b))`).
- Store only hashes of anything bearer-shaped. Link codes are hashed because the
  nightly `pg_dump` would otherwise carry live credentials for the whole
  retention window.
- Sign anything replayable. Inline-keyboard `callback_data` carries an HMAC over
  the card's current `next_review_at`, so grading a card invalidates its own
  buttons.
- Give codes a TTL and single use — link codes are 10 minutes, one claim.
- Name environment variables in error output, never their values.

**Don't**

- Don't log a secret, echo one into script output, or put one in a commit.
- Don't loosen the webhook secret check — it is the only authentication step in
  the bot, and everything downstream depends on it.
- Don't persist the user's Anthropic key server-side. Its only path is
  input → React state → `localStorage` → fetch body → `/api/claude` → Anthropic.

---

## 7. Error reporting

Sentry runs with `tracesSampleRate: 1` and `sendDefaultPii: true`, so request
context — headers, full URLs — travels with every event.

**Do**

- Keep `redactDeep()` wired into `beforeSend` and `beforeSendTransaction` on
  both the server and edge configs, and extend it when a new credential appears
  in a URL or header.
- Rate-limit anything an anonymous caller can trigger. The webhook reports a
  secret mismatch at most once per five minutes per instance, because the path
  is guessable and an unbounded report is an unbounded bill.
- Report the failures that are otherwise invisible. A stale webhook secret makes
  the bot go silent with no other symptom, so that specific mismatch is worth a
  warning; a request with no secret header at all is just a scanner and stays
  silent.

**Don't** add a Sentry integration that captures request bodies without checking
what the redactor does with them.

---

## 8. Telegram bot invariants

Documented in `CLAUDE.md` and repeated here because they are easy to break:

- The webhook returns 200 once authenticated, always. A non-2xx makes Telegram
  redeliver on a schedule and turns one bug into a retry storm.
- `/help` is answered before `getDb()` is called, so it stays a database-free
  connectivity test. Keep it that way — the documented debugging ladder depends
  on `/help` working while `/start` doesn't.
- A chat review session stores no state; the next card is derived from SQL each
  turn. The web app's same-session requeue of failed cards is therefore not
  reproduced in chat, on purpose.
- Reminder delivery distinguishes a Telegram-level error (message definitely not
  sent — release the claim, retry later) from a transport failure (may have been
  accepted — keep the claim; a missed reminder beats a duplicate).
- Treat a blocked chat (403) as a reason to disable reminders, not to retry.

---

## 9. Testing

Vitest, run with `npm test`. Coverage is collected for `app/**` excluding
`layout.jsx` — the metadata shell — and test directories. `page.jsx` is
included: it owns the cross-hook actions, which is exactly the part no single
hook's suite can reach.

**Do**

- Mock at the boundary, and only there: `vi.stubGlobal("fetch", ...)` for the
  network, `fakeSql()` from `lib/__tests__/helpers/fakeSql.js` for the query
  function. `fakeSql` records `text` and `values` per call, so assert on the
  values a query was given and on the fragment of SQL that matters.
- Mock `@/lib/auth/server` and `@/lib/db` in route tests via `vi.hoisted()`, and
  import the route module afterwards with a top-level `await import()`.
- Name tests as behaviour: "rejects a non-numeric grade instead of writing NaN",
  not "test grade validation".
- Assert the negative space — that a rejected request issued no SQL, that a
  second delivery grades nothing, that a closed menu leaves focus somewhere
  usable.
- Use fixtures that could actually come out of Postgres. A card fixture without
  `next_review_at` is not a row the guarded update can see, and a test built on
  one proves nothing.
- Put component tests under `__tests__/` beside the component, with
  `// @vitest-environment jsdom` at the top, and query by role and accessible
  name via Testing Library.
- Add a regression test with every bug fix.

**Don't**

- Don't test implementation details of a hook where a rendered assertion will
  do, and don't reach into internals a user cannot reach.
- Don't mock the module under test.

---

## 10. Accessibility

Recent work has been mostly accessibility repair, so the bar is now explicit.

**Do**

- Make the ARIA role you declare true. If a menu says `role="menu"`, it owes the
  menu-button pattern: focus moves in on open, roving tabindex, arrow keys walk
  and wrap, Home/End jump, Escape closes.
- Give every dialog the `useDialog` hook — it traps Tab, handles Escape, moves
  focus in and restores it on close, which is what `aria-modal` promises.
- Return focus somewhere deliberate when a control unmounts. Focus falling to
  `<body>` restarts the next Tab from the top of the document.
- Label controls with an accessible name, and drive tests through that name.

**Don't** declare a role you haven't implemented the keyboard behaviour for; it
is worse than a plain button, because the screen reader has now promised
something that doesn't work.

---

## 11. Git and commits

Not Conventional Commits. Subjects read as sentences describing the change's
effect.

**Do**

- Write the subject in the imperative, capitalised, no type prefix, no trailing
  period: *"Stop 'Hard' pushing cards months into the future"*, *"Keep focus off
  `<body>` when an outside press closes the menu"*.
- Write a body for anything non-trivial: what was wrong, why the obvious fix
  doesn't work, what this does instead. Wrap at ~76 columns.
- Reference the issue with `Closes #79` when there is one.
- Keep commits about one thing. A branch that touched `package-lock.json` while
  installing the test runner gets a follow-up commit dropping that churn — it
  has nothing to do with the change and makes the diff harder to read.
- Branch names: `claude/<topic>-<suffix>` for assisted work, plain descriptive
  slugs otherwise. Renovate owns `renovate/*`.

**Don't** commit a lockfile change that is metadata churn rather than a real
dependency change, and don't mix a refactor into a fix.

---

## 12. Pull requests and review

- Everything lands on `main` through a PR; `main` is not pushed to directly.
  Feature branches are merged rather than squashed, so the individual commits
  and their messages survive — which is only worth doing if each commit was
  written to be read. Renovate's PRs are squashed.
- CI (`.github/workflows/test.yml`) runs `npm ci`, `npm run lint` and
  `npm test` on Node 24.19.0 for every PR and every push to `main`. A red PR is
  not ready.
- Run `npm run lint`, `npm test` and `npm run build` before pushing.
- Never commit generated output. `coverage/` and `.next/` are ignored for a
  reason: a coverage report committed by accident is unreadable in review and
  carries its own vendored code, which the security scanner will rightly flag.
- Review findings get fixed in follow-up commits on the same branch, each with
  its own explanatory message, rather than an amend that hides the exchange.
- Each PR gets a Neon preview branch; `delete-neon-branch.yaml` removes it when
  the PR closes. If a change needs a migration, run it against the preview
  branch and confirm `db/schema.sql` is still safe to re-run from scratch.
- Reviewing the bot or the database layer, ask specifically: what happens if
  this request arrives twice, and what happens if two of them arrive at once?

---

## 13. Dependencies

Seven runtime dependencies and six dev dependencies. That is the point.

**Do**

- Pin exact versions in `package.json` — the repo uses no `^` ranges.
- Let Renovate propose updates; the shared config auto-merges patch runtime
  updates and minor/patch dev updates, and includes supply-chain-security
  presets. Everything larger is reviewed by hand.
- Pin GitHub Actions to a version tag, and third-party actions to a commit SHA
  with a comment naming the version (see `b2-backup.yml`).
- Justify a new dependency in the PR body, and say what it costs. The Telegram
  client is a thin `fetch` wrapper rather than a bot framework because long
  polling, middleware and session storage — the bulk of what a framework
  provides — would go unused on a serverless webhook. oxlint was chosen over
  ESLint on the same grounds: 20 packages against 55 for the rules that
  actually matter here.

**Don't** add a dependency for something a dozen lines of standard library can
do.

---

## 14. Infrastructure

| Concern | How it works | Watch out for |
|---|---|---|
| Hosting | Vercel, deploying from `main` | Preview deployments have Deployment Protection on by default |
| Database | Neon Postgres; `db/schema.sql` run by hand in the SQL editor | A deploy does **not** migrate anything |
| Auth | Neon Auth; the Vercel integration sets `VITE_NEON_AUTH_URL`, which `lib/auth/server.js` copies to `NEON_AUTH_BASE_URL` | |
| Backups | `b2-backup.yml`, daily 05:00 UTC `pg_dump` to Backblaze B2, 7-day retention | Anything stored unhashed lives in backups for a week |
| Reminders | A Val Town scheduled val (`scripts/valtown-reminder-cron.ts`), hourly, calls `/api/telegram/cron` with a bearer token | It lived in GitHub Actions and delivered as few as 1–2 of 24 runs a day. Do not move it back |
| Webhook | Registered by hand: `npm run telegram:webhook -- <url>` | Deploying does not register it; a new deployment URL means re-running it |
| Errors | Sentry, with source maps uploaded at build and a `/monitoring` tunnel route | |

**Do**

- Set `permissions: {}` on workflows that need no repository access.
- Pass secrets to workflow steps through `env:`, and check they are non-empty
  before using them.
- Re-run `npm run telegram:status` after any webhook change; it reports
  Telegram's view, including a preview deployment's `401`.

**Don't** point a webhook at a per-deployment preview URL — use the branch
alias, or it dies with the next push.

**Don't** put the reminder cron back on a GitHub Actions `schedule:`. That is
where it started, and GitHub dropped most of its runs under load — enough to
miss a user's whole reminder window, with no failed run to show for it. A
scheduler that skips leaves an absence, not an error, which is why the val
throws on a non-2xx: a swallowed 401 from a rotated secret looks exactly like
an hour with nobody due. Delivery is idempotent per user per local day, so
adding a second trigger is safe; replacing this one with Actions is not.

---

## 15. Documentation

- `CLAUDE.md` is the architectural map and is expected to stay accurate; update
  it in the same PR that changes structure, adds an environment variable, or
  changes a security property.
- `CONTRIBUTING.md` is the short path in for a new contributor — layout, the
  database constraints, the secret rules, testing and commit conventions. It
  drifted badly once, describing a single-file app long after that stopped
  being true; a claim about how the project works belongs there only while
  someone keeps it honest.
- `README.md` carries setup and the debugging ladders. When a step has a failure
  mode, document the symptom, not just the step ("a mismatched secret means the
  bot silently does nothing").
- `.env.local.example` lists every variable, including optional ones, with a
  comment on what it is for and how to generate it.

---

## 16. Known gaps

Honest list, so nobody mistakes these for intent. Accurate as of the current
`main`; one has an open pull request.

- **Sentry's `tracesSampleRate: 1` and `sendDefaultPii: true`** are development
  defaults carried into production; the redactor is what makes them tolerable.
  (PR #91 makes the sampling configurable and leaves the PII decision alone.)
- **`/api/claude` is unthrottled.** A signed-in user can drive it as hard as
  they like. The key is theirs, so the cost is theirs, but the deployment is
  the relay and nothing bounds the traffic.
- **`app/layout.jsx` is excluded from coverage.** Deliberate — it is the
  metadata shell — but it does mean the app's outermost frame is untested.
- **`telegram_links.secret_hash` needs its migration run by hand.** The code
  stopped writing the column when #89 merged, and the `ALTER TABLE ... DROP
  COLUMN` at the end of `db/schema.sql` has to be run in the Neon SQL editor.
  Until it is, the old `NOT NULL` column rejects every new account link. This
  is the standing cost of hand-run migrations, not an oversight in that PR.

Recently closed, in case this document is read next to an older copy: the stale
`CONTRIBUTING.md`, the absence of a linter, `page.jsx` being excluded from
coverage, the `.DS_Store` files tracked under `app/`, the unread
`ANTHROPIC_API_KEY` (now development-only, with `/api/claude` requiring a
session), and the write-only `secret_hash` column.
