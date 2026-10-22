# Pre-PR checklist

Questions, not rules — the rules are in `CLAUDE.md` and `PRACTICES.md`, cited
as `§n`. Answer each item in a selected section for the diff in hand. `F<n>`
tags point at the finding in `findings.md` that put the item here; an item
with no tag comes straight from the docs.

Sections are selected by the paths the diff touches. **Every change** and
**Proportion** always apply.

---

## Every change

- [ ] `npm run lint`, `npm test`, `npm run build` all pass on this HEAD (§13).
- [ ] The diff is only the change: no reformatting of untouched code, no
      lockfile metadata churn, no `coverage/` or `.next/`, no refactor folded
      into a fix (§1, §12, §13).
- [ ] Commit subjects are imperative sentences with no type prefix; anything
      non-trivial has a body saying what was wrong and why this fix (§12).
- [ ] A bug fix has a regression test, seen failing without the fix (§10).
- [ ] Changed a claim, a name or a piece of copy? Grep for every other
      copy — comments, `CLAUDE.md`, `PRACTICES.md`, `CONTRIBUTING.md`,
      README, UI text, MCP tool descriptions, test assertions — and change
      them together. A retracted claim surviving on the constant it describes
      is the copy most likely to be believed. (F12, F20, F22)
- [ ] Every number stated in prose is computed, not estimated — recounted
      from the code by listing the items, not adjusted from the old figure
      (F28); where a reader
      or a model acts on it, a test holds it (F20, §9).
- [ ] A guard, gate or "this prevents X" claim: every path that reaches X
      listed — tool calls, UI buttons, other clients, local vs remote state —
      and the docs claim only the paths it covers (F23).
- [ ] Claims about a third-party product (Claude Desktop, Telegram, Neon,
      Vercel) were checked against current docs or tried, not recalled (F12).
- [ ] Structure, an env var or a security property changed → `CLAUDE.md`
      updated in this PR; new env var also in `.env.local.example` (§16).
- [ ] New dependency → justified in the PR body with its cost (§14).

## Dependencies — `package.json`, `package-lock.json`

- [ ] A major version bump: the migration guide read against every option,
      hook and default the repo sets for that package. A removed or no-op
      option fails silently and mocked tests stay green, so the one visible
      error is not the whole list — ask especially of anything that keeps a
      credential out (`redactDeep` wiring, data-collection limits). `npm run
      build` is the only local check that loads `next.config.mjs`. (F24)

## Async UI — `app/components/**`, `app/hooks/**`, `app/page.jsx` with a fetch or a Claude call

The seven questions in `CLAUDE.md` § *Before pushing UI that waits on a
request*, answered here explicitly:

- [ ] What else writes this row while the request is out? The reply merges
      only the columns its write owns; the endpoint returns only those
      (`lib/shared/schedule.js` is the pattern). Never replace the row. (F7)
- [ ] Every way the reader can leave while it is out — grade, skip, delete,
      restart from header, stage switch, next pass, unmount — listed. A late
      success writes to nothing; a late failure still reaches `Notice` and
      lands on a screen it is true for. (F4, F6)
- [ ] What decides that this UI is open, and does one rule close it on every
      exit? Keyed on something that can't collide across passes. (F6)
- [ ] An effect that starts a billable request is cancellable before it is
      sent under Strict Mode (cleared zero-delay timer). (F8)
- [ ] Keys handled on the element, not `window`/`document`; nothing else
      (`HeaderMenu`, `useDialog`) hears the same key. Closing returns focus
      to the opener after the closing render. (F9)
- [ ] State lives as long as the promise the UI makes. (F21)
- [ ] Deleting or invalidating something clears every other place on screen
      that shows it. (F17 — open)

## Failure surfaces — any new `catch`, write, or route error path

- [ ] Every write that can fail leaves a line in `Notice`, or inside the
      dialog that raised it when one is open (F5).
- [ ] The message is true whether the write was refused or committed with
      its reply lost, and true for a row that already existed. It says what
      was lost, never why. (F3)
- [ ] Every browser-side `catch` calls `reportClientError()`; `console.error`
      alone reaches nobody (F2).
- [ ] Optimistic display (✓ Added) is withdrawn when the write fails.
- [ ] A fetch failure is swallowed only where the fallback is the whole
      answer (§7, `useServerKey` vs `useWords`).

## React state — `app/hooks/**`, `app/page.jsx`

- [ ] Nothing reads new state before React has applied it; persistence
      happens in an effect keyed on the state, and tests assert the stored
      value, not just what renders (F1).
- [ ] New state lives in `LukuApp` (keyed on `user.id`), not `Luku`.
- [ ] Per-account localStorage keys carry the user id.
- [ ] `page.jsx` gained composition only; feature logic went to a hook (§3).

## Accessibility — `app/components/**`

- [ ] Every declared ARIA role has the keyboard behaviour it promises (§11).
- [ ] Dialogs use `useDialog`; focus never falls to `<body>` on close.
- [ ] Controls have accessible names, and tests query by them.

## API routes — `app/api/**`

- [ ] Session routes open with the three lines: `getSession()`, 401, scope by
      `user.id` (§5). `/api/mcp` and the Telegram webhook do not call
      `getSession()` and never take a user id from the caller (§8, §9).
- [ ] Input validated before the first query; a rejected request issues no
      SQL, and a test says so (§5, §10).
- [ ] Status codes are honest: 400/401/404/409/503, no 500 for caller error.
- [ ] Every `await` that can throw — `getDb()`, auth/token lookup, the first
      query — sits inside the path that returns the route's error shape and
      reports it. Ask: what does this route return on a database that never
      ran this PR's migration? (F11)
- [ ] Protocol error codes and statuses are the ones the spec assigns (F15 —
      open).

## Database — `lib/**`, `db/schema.sql`

- [ ] No `BEGIN`/`COMMIT`; a multi-step write is safe half-done, collapsed
      into one statement, or guarded by a compare-and-swap (§4).
- [ ] What if this arrives twice? What if two arrive at once? (§13)
- [ ] Every user-data query is scoped by user id; values interpolated through
      the tagged template, never concatenated.
- [ ] Every `LIMIT 1` has an `ORDER BY` that makes it deterministic, and the
      match agrees with the uniqueness constraint it relies on (F14).
- [ ] Migrations appended, idempotent (`IF NOT EXISTS`), safe re-run against
      both a live and an empty database, with a comment naming who needs it.
- [ ] A new per-user table or list has a bound, enforced in one statement
      (F18 — open).
- [ ] Two lists that must agree (SET columns vs `SCHEDULE_FIELDS`) are held
      by a test, not a comment (F19).

## Boundary — imports in `app/**` or anything under `lib/shared/`

- [ ] No client file imports from `lib/` except `lib/shared/`, and no file in
      `lib/shared/` gained an import (§3). `serverOnlyBoundary.test.js`
      enforces the first; the second is on the reviewer.

## Telegram — `lib/telegram/**`, `app/api/telegram/**`

- [ ] The webhook still returns 200 once authenticated; the secret check is
      untouched (§8).
- [ ] `/help` still answers before `getDb()`.
- [ ] Callback data still signed over the card's current `next_review_at`.
- [ ] Reminders: claim before send; Telegram error releases, transport error
      keeps; 403 disables.

## MCP — `lib/mcp/**`, `app/api/mcp/**`, `lib/words.js`

- [ ] The writable surface is still the four columns, and the tool
      descriptions still say so; `words.test.js` holds it (§9).
- [ ] Auth seam still one function wide; tools take a `userId` only.
- [ ] Numbers in `instructions.js` / `SCHEDULE_FIELD_GUIDE` interpolated from
      `lib/srs.js`; anything a client must not misread is in both places.
- [ ] Refusals are `isError: true` results; JSON-RPC errors only for a broken
      envelope.
- [ ] `instructions` did not grow a sentence that changes nothing a model does.

## Tests — any `__tests__/**`

- [ ] Each test can fail for the reason its name gives: values meant to
      differ (request body vs stored row) differ in the fixture (§10).
- [ ] Fixtures are rows Postgres could return (`next_review_at` present).
- [ ] Negative space asserted: no SQL on rejection, nothing graded twice.
- [ ] Mocks only at the boundary (`fetch`, `fakeSql`); never the module under
      test.
- [ ] A test whose assertion was edited to match new behaviour was read, not
      just updated — it may be asserting the bug (F22).

## Docs — `README.md`, `*.md`, UI help text

- [ ] Each documented symptom is one this change can produce, and its
      likeliest failure is documented (F13).
- [ ] Code blocks reread as rendered; files written with the editor tools,
      not heredocs (F16 — open).
- [ ] Setup steps name the symptom of getting them wrong (§16).

---

## Proportion — what not to raise, or to raise only as a nit

From declined findings and `.github/copilot-instructions.md`. Trace a
realistic path from a real user action and state the worst outcome before
calling anything blocking.

- A race needing a sub-second request to outlast deliberate navigation
  (leave a stage, return, reveal the same card) or a multi-second Claude
  round trip, whose worst case is a stale screen until the next load with the
  database correct. (F10)
- Guards against model output exceeding limits the prompt and token budget
  already make unreachable, when the failure is reported anyway.
- A finding already declined on a thread with a traced reason, re-raised
  from another entry point without changing the worst outcome. (F10)
- Formatting; inline styles; the absence of TypeScript, an ORM, a CSS
  framework, a state library or a migration tool; `ANTHROPIC_API_KEY` being
  ignored in production.
