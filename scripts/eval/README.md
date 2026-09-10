# Word-translation eval

Measures whether swapping the model in `app/api/claude/route.js` changes the
quality of what `translateWord` returns — the dictionary form the word list is
keyed on, and the example sentence that ends up on the flashcard.

## What it runs

The real `translateWord` from `app/lib/api.js`, with its real prompt and its
real parsing. Two things are replaced, and only two: the browser's relative-URL
`fetch` and the route's Neon Auth session. The request that reaches Anthropic is
the one `app/api/claude/route.js` builds — **if that route changes shape, the
shim in `run-eval.mjs` has to follow, or the eval stops measuring production.**

## Metrics

| id | what it means |
|---|---|
| `base_ok` | **headline** — dictionary form matches the reviewed label. A wrong base is a permanently wrong flashcard. |
| `example_win` | pairwise judge, candidate vs the frozen baseline example. 0.5 on baseline rows and on ties. |
| `example_valid` | programmatic: 4–8 words, mentions the word, not a re-serve of the learner's own sentence. |
| `pos_ok` | part of speech matches (`adj`/`adjective` and `adv`/`adverb` both accepted). |
| `format_ok` | usable object back, i.e. `translateWord` did not hit its `(unavailable)` fallback. |

The fallback zeroes every quality metric. It echoes the tapped word back as
`base`, so without that gate a total failure would score `base_ok = 1` on every
word whose surface form is already the dictionary form.

## Running it

```bash
node scripts/eval/selftest.mjs          # offline, no key, no spend

export ANTHROPIC_API_KEY=sk-ant-...
F=.claude/hillclimb/translate-word

# Pilot: the first 3 cases only. Read run-eval.mjs first — the harness gate
# refuses to run until you approve it.
node scripts/eval/run-eval.mjs --flow $F --variant baseline \
  --model claude-sonnet-4-6 --reps 2 --limit 3 --approve-harness

# Check row one before spending the rest: usage present and non-zero, model as
# requested, the transcript readable.
head -1 $F/baseline/results.jsonl | python3 -m json.tool

# Same command without --limit. Resume skips the 3 already done.
node scripts/eval/run-eval.mjs --flow $F --variant baseline \
  --model claude-sonnet-4-6 --reps 2

node scripts/eval/run-eval.mjs --flow $F --variant v1 \
  --model claude-haiku-4-5 --reps 2

node scripts/eval/build-report-lite.mjs $F   # -> $F/report.html
```

### Frozen references and provenance

The baseline freezes its example sentences under `baseline/ref/` and writes
`ref/PROVENANCE.json` recording the model and a hash of the system prompt that
produced them. **Commit both** — that is what keeps a win rate comparable
across runs and lets a fresh clone evaluate a candidate without paying for a
baseline pass first.

A reference is only valid for the (prompt, model) pair that made it. If
`TRANSLATE_SYSTEM` in `app/lib/api.js` changes, a run refuses to judge against
the old refs (`stale_reference`) instead of quietly scoring the prompt change
and the model change together. The remedy is always `rm -rf` the `ref/`
directory and re-run the baseline.

`--limit N` runs the first N cases. It is a pilot flag, not a separate run:
resume keys on `(case, rep)`, so dropping the flag continues the same variant
rather than restarting it. Pilot the **baseline** rather than a variant — a
variant case whose baseline never ran has no frozen reference to be judged
against, and fails into `errors.jsonl` rather than scoring a misleading tie.

`baseline` is the model to beat and `v1` the candidate; which model each one is
comes from `--model`. The baseline run freezes its examples under
`baseline/ref/`, and every later variant is judged against those frozen files —
never against a freshly regenerated reference, or "win rate" quietly changes
meaning between runs.

`JUDGE_MODEL` overrides the judge (default `claude-opus-5`). It must not be
either model under test: judges prefer output that resembles their own.

Re-running resumes — existing `(case, rep)` rows are skipped. Failed attempts go
to `errors.jsonl`, never to `results.jsonl`, so a provider error is never scored
as a model getting the answer wrong.
