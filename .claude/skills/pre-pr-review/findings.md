# Review findings log

What reviews of Luku PRs actually found, kept so the pre-PR review can ask
the question next time instead of a reviewer asking it after the push.
`SKILL.md` (*Mode: learn*) says how entries are added and promoted.

**Learned from:** #107, #108, #109, #120, #137, #140, #152, #153, #155, #156, #161, #165

Status is one of:

- `promoted` — its check is in `checklist.md`, which cites this number
- `open` — seen once, not yet a checklist item; the review still reads it
- `declined` — not worth code; it lives on as a **Proportion** line

Entry format:

```
## F<n> — <the pattern, in a line>
PR #<n> · <reviewer> · <area> · <fixed|declined|wrong> · <status>
What happened: <the concrete defect and its worst outcome>
Missed because: <why the author didn't see it>
Check: <the question that would have caught it, phrased for the class of bug>
```

---

## F1 — A persisted value read before React computed it
PR #107 · Copilot · hooks / localStorage · fixed · promoted
What happened: `useSession` wrote to localStorage inside its setter wrapper,
before React ran the functional updater, so it stored the literal string
`"undefined"` and every scan's cache was lost on reload.
Missed because: in-memory state was always right; only the stored copy was
wrong, and no test parsed it back.
Check: is anything derived from new state read before React has applied it?
Persist from an effect keyed on the state, and test what was stored, not what
is rendered.

## F2 — A client-side catch that reaches nobody
PR #109 · Copilot · client error reporting · fixed (4 sites) · promoted
What happened: client catches only called `console.error`; the browser config
has no console integration and `onRequestError` never sees a fetch that
failed in the browser, so the failures the PR promised to report weren't.
Missed because: the docs said they were reported.
Check: does every new browser-side `catch` call `reportClientError()`?

## F3 — A failure message that asserts what the catch cannot know
PR #109 · Copilot · Notice wording · fixed · promoted
What happened: "it is not on your list" shown when the base form was already
saved (`wasPreexisting`); "the card stays due" and an invitation to retry
when the response, not the write, may be what was lost — a retry then grades
twice.
Missed because: the message was written for the refusal case only.
Check: for each failure message, is it true both if the write was refused and
if it committed and the reply was lost? Is it true for an already-saved row?

## F4 — A late reply writes onto a screen the reader has left
PR #109 · Copilot · async UI · fixed · promoted
What happened: a failed grade's notice appeared on the scan screen after the
reader moved on; the save path was guarded against a new scan but not a stage
change.
Missed because: one exit path was guarded, the others weren't enumerated.
Check: list every way the reader can leave while the request is out; does a
reply (and a failure) arriving after each one land somewhere true?

## F5 — An error banner outside the modal that raised it
PR #109 · Copilot · accessibility · fixed · promoted
What happened: a delete failure from inside `WordList` rendered as a page
`Notice` beneath an `aria-modal` overlay — visible, but unannounced and
unreachable by keyboard. Introduced by the fix to an earlier finding.
Missed because: checked visually, not with the focus trap in mind.
Check: if this failure can be raised while a dialog is open, is it reported
inside that dialog?

## F6 — UI state keyed on queue position collides across passes
PR #137 · Copilot · async UI · fixed · promoted
What happened: the example picker's open state was keyed on queue index; the
same word at the same index in the next pass reopened it on reveal and sent a
paid Claude request with no click.
Missed because: exits were wrapped one by one and the pass transition was
never one of them.
Check: what decides whether this UI is open, and does every path off the card
— grade, skip, delete, restart, stage switch, next pass — reset it? Prefer one
rule over wrapping each exit.

## F7 — A reply applied wholesale over a column another write owns
PR #137 (follow-ups #140, #153) · Copilot · async UI / API shape · fixed · promoted
What happened: grading while an accepted example's PATCH was in flight; the
grade reply replaced the whole local row and put the old example back.
Missed because: the reply was treated as "the row" rather than "what this
write changed".
Check: does each reply update only the columns its own write owns, merged —
never a replaced row? Does the endpoint return only those columns?

## F8 — A paid request started from an effect, doubled by Strict Mode
PR #137 · Copilot · React effects · fixed · promoted
What happened: the picker fetched in a mount effect; Strict Mode's
setup → cleanup → setup sent two Claude requests in development, and ignoring
the first reply did not unsend it.
Missed because: the cleanup ignored the reply, which looked like enough.
Check: can an effect that starts a billable request be cancelled before it is
sent (cleared zero-delay timer), not just have its reply ignored?

## F9 — A second global key listener
PR #137 · Copilot · keyboard · fixed · promoted
What happened: Escape on `window` in the picker fired after `HeaderMenu`'s
`document` listener, closing both with one press and moving focus wrongly.
Missed because: the existing listener wasn't looked for.
Check: are keys handled on the element? Does anything else (`HeaderMenu`,
`useDialog`) already hear this key?

## F10 — Remount race through deliberate navigation
PR #137 · Copilot · async UI · declined · declined
What happened: a sub-second PATCH would have to outlast leaving review,
returning and revealing the same card; worst case a stale local copy until the
next load, database correct.
Why declined: per-word serialization in `useWords` or versioned writes cost
far more than that window. Same finding raised twice from different entry
points.
Check: (Proportion) trace the path and state the worst outcome before
building for a race.

## F11 — The likeliest failure happens above the `try` that handles it
PR #156 · Claude review · API route · fixed · promoted
What happened: `/api/mcp` resolved the bearer token before its `try`; on a
deployment missing `mcp_tokens` (schema not re-run — the usual case) every
request, `initialize` included, got Next's HTML 500 instead of a JSON-RPC
error.
Missed because: the `try` was read as covering "the database", and the first
query was outside it.
Check: does every `await` that can throw — `getDb()`, auth, the first query —
sit inside the path that turns it into the route's error shape and reports
it? What does this route do on a database that never ran the new migration?

## F12 — An unverified claim about an external product, copied to four places
PR #156 · Claude review · docs / UI copy · fixed (twice) · promoted
What happened: "add it to Claude Desktop's config with a header" was wrong;
the correction ("connectors are OAuth-only") was also wrong. Each version sat
in the README, `CLAUDE.md`, the panel and a commit message.
Missed because: written from memory of a product that changes.
Check: is every claim about a third-party product checked against its current
docs, or tried? Where does the same claim appear, and does every copy change
together?

## F13 — A troubleshooting tip for a state this change can't produce
PR #156 · Claude review · docs · fixed · promoted
What happened: the README warned about a half-applied `words` schema; the PR
added no `words` columns. The real symptom (missing `mcp_tokens`) was
undocumented.
Missed because: reasoning copied from the `SELECT *` case in `CLAUDE.md`.
Check: can this change actually produce each symptom its docs describe, and
is its own likeliest failure among them?

## F14 — A lookup whose match rules disagree with the constraint
PR #156 · Claude review · SQL · fixed · promoted
What happened: case-insensitive `get_word` match against a case-sensitive
`UNIQUE (user_id, base)`, with `LIMIT 1` and no `ORDER BY` — "Suomi" and
"suomi" both exist, and which one came back was arbitrary.
Missed because: the constraint wasn't reread.
Check: does every `LIMIT 1` have an `ORDER BY` that makes it deterministic?
Does the match agree with the uniqueness constraint it relies on?

## F15 — A protocol error code from memory
PR #156 · Claude review · MCP protocol · fixed · open
What happened: bad params answered with `-32600` (Invalid Request) instead
of `-32602` (Invalid params).
Missed because: codes not checked against the JSON-RPC spec.
Check: is each protocol-level code or status the one the spec assigns?

## F16 — A file written through a heredoc mangled its content
PR #156 · Claude review · tooling · fixed · open
What happened: a `\` line continuation in the README collapsed into a run of
spaces.
Missed because: the rendered file wasn't reread.
Check: write files with the editor tools, not shell heredocs; reread any
code block in docs as it will render.

## F17 — A displayed value outlives the thing it describes
PR #156 · Claude review · UI state · fixed · open
What happened: after revoking the token just minted, the "copy it now" box
still offered the dead credential.
Missed because: the mint display and the revoke list were separate state.
Check: when this UI deletes or invalidates something, is every other place
on screen showing it cleared?

## F18 — An unbounded per-user resource
PR #156 · Claude review (optional) · API · fixed · open
What happened: no cap on live MCP tokens. Took a cap of 20, checked in the
same `INSERT … SELECT … WHERE count < 20` statement since the driver has no
transactions.
Check: does a new per-user table or list have a bound, and is it enforced in
one statement?

## F19 — Two lists that must agree, held together by a comment
PR #153 · review suggestion · tests · fixed · promoted
What happened: a comment beside `gradeWord`'s `UPDATE` said its columns
matched `SCHEDULE_FIELDS`; nothing enforced it. Now a test reads the SET
columns from the query through `fakeSql` and compares.
Check: when two places must stay in step, is there a test that fails if one
changes alone?

## F20 — A retracted claim surviving in one copy, and new prose with wrong arithmetic
PR #161 · Claude review · comments / MCP text · fixed · promoted
What happened: the change retracted "ease 2.5 means never graded", but the
comment on `DEFAULT_EASE_FACTOR` — the copy most likely to be believed — still
said it. The replacement ("easy and hard in equal measure returns to it") was
also wrong: one Easy and one Hard net −0.04.
Missed because: the claim wasn't grepped for; the arithmetic wasn't done.
Check: when a change retracts a claim, has every copy been found (grep
comments, docs, tool descriptions, tests)? Is each numeric claim in prose
computed, ideally as a test?

## F21 — A promise that outlives the state backing it
PR #137 · Claude review summary · UI state · fixed · promoted
What happened: "never offers the same example twice" kept its seen list in
the picker, so closing and reopening offered a rejected sentence again.
Check: does the state live as long as the promise the UI makes?

## F22 — A wording change that missed the other copy of the wording
PR #120 · Copilot · UI copy · fixed · promoted
What happened: the PR replaced "triaged" wording on the new-word badge but
left `New words triaged` on the pass's completion screen, and the test still
asserted it — the same implication the PR existed to remove.
Missed because: the phrase wasn't grepped for, and the test was updated to
match rather than read.
Check: same as F20 — a copy or claim change greps for every occurrence,
tests included.

## F23 — An enforcement claim tested against one path to the guarded action
PR #165 · user report, then self-review · tooling / docs · fixed (claim narrowed; the button is still ungated) · promoted
What happened: this skill's own hook was documented as "blocks PR creation"
in four places. The first PR it guarded was opened from the Claude app's
Create PR button, which calls GitHub without a tool call, so no hook ran and
the PR went up unreviewed.
Missed because: the hook was tested against the two tool calls it matches,
not against every way a PR actually gets opened. Same root as F4 and F6 —
the exits that weren't enumerated.
Check: when a change claims to guard or enforce something, list every path
that reaches the guarded action — tool calls, UI buttons, other clients, a
second tab — and say which ones it covers. Does the documentation claim
only those?
Promoted at once: the same review found the hook's own `gh pr create` match
missing `env gh …` and `/usr/bin/gh …`, and the marker checked against the
local branch while GitHub opens the PR from the remote one — three paths to
the guarded action in one change, with F4 and F6 behind them.

## F24 — A major dependency bump turns a security option into a silent no-op
PR #132 · self-review · dependencies / error reporting · fixed · promoted
What happened: Renovate's `@sentry/nextjs` 10 → 11 bump failed only on
Vercel, at `next.config.mjs` (`withSentryConfig` moved to
`@sentry/nextjs/config`). Fixing just that would have shipped a green build
in which `beforeSendTransaction` — the hook that strips the Telegram bot
token from fetch spans — never ran, because v11 streams spans. The same
release removed `sendDefaultPii` and widened default collection to every
HTTP body and outgoing header, which would have sent the readers' Anthropic
keys from the browser and the database password from `Neon-Connection-String`.
Missed because: CI was green — the tests mock `@sentry/nextjs`, and an
unknown or no-op init option neither throws nor warns. The one visible
failure invited a one-line fix.
Check: for a major version bump, read the migration guide against every
option, hook and default the repo configures for that package, not just the
error in front of you. Which of them would now be ignored, renamed, or
widened — and is any of them what keeps a credential out?
Promoted at once: a security property (credentials reaching a third party).
