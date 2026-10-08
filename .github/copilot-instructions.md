# Review guidance for Luku

Luku is a small single-user-per-account app: a Next.js 16 App Router client in
plain JavaScript, Neon Postgres over HTTP with no transactions, and Neon Auth.
`CLAUDE.md` at the repository root is the project's own description and its
conventions take precedence over general advice.

## What to flag

- Anything that lets one account read or write another's rows. Every protected
  route must scope its queries by the session's `user.id`, never by an id the
  request supplies.
- A write whose failure leaves nothing on screen. The convention is a line in
  `Notice` (or inside the dialog that raised it), worded as what was lost, not
  why.
- A reply applied wholesale when its write owned only some columns.
- An effect that starts a billable Claude request without being cancellable
  under Strict Mode's setup → cleanup → setup.
- Keyboard handlers on `window` or `document` that will also fire for the
  header menu or a dialog, and focus dropped to `<body>` when something closes.
- Tests that cannot fail for the reason their name gives.

## Severity and proportion

Trace a realistic path from a real user action before reporting a race, and
state the worst outcome. Do **not** report as a finding:

- races that need a single sub-second request to stay in flight across
  deliberate human navigation (leaving a stage, returning, revealing the same
  card), or to outlast a multi-second Claude round trip, when the worst outcome
  is a stale screen until the next load rather than lost or wrong stored data;
- guarding model output against server-side limits the prompt and token budget
  already make unreachable, when the failure is reported to the reader anyway.

If one of these seems worth mentioning, label it a nit or low severity rather
than medium or high. Once a finding has been declined on a thread with a
traced reason, do not raise it again from a different entry point unless the
new path changes the worst outcome.

## Out of scope

- Formatting and style: there is no formatter, and inline style objects are
  the convention, not an oversight.
- Suggesting TypeScript, an ORM, a CSS framework, a state library or a
  migration tool; their absence is deliberate (see `CLAUDE.md`).
- `ANTHROPIC_API_KEY` being ignored in production: that is intentional.
