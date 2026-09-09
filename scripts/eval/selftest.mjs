#!/usr/bin/env node
// Offline check of the eval harness — no API key, no spend.
//
// The eval-audit checklist wants three things established before the first paid
// pass: an oracle scores ~100%, a null scores ~0%, and an induced API error
// lands as a harness error rather than as a model getting the answer wrong.
// All three run here against a stub server standing in for Anthropic, so the
// wiring is proven before any money is spent on it.
//
//   node scripts/eval/selftest.mjs

import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const MODEL = 'claude-haiku-4-5';

// One case per behaviour the harness has to get right.
const CASES = [
  { id: 'oracle', word: 'kutoi', context: 'Isoäiti kutoi minulle villasukat.',
    expected: { base: 'kutoa', pos: 'verb' }, tags: ['verb'] },
  { id: 'null', word: 'talo', context: 'Talo on iso.',
    expected: { base: 'talo', pos: 'noun' }, tags: ['noun'] },
  { id: 'apierror', word: 'kirja', context: 'Kirja on pöydällä.',
    expected: { base: 'kirja', pos: 'noun' }, tags: ['noun'] },
  { id: 'junk', word: 'auto', context: 'Auto on punainen.',
    expected: { base: 'auto', pos: 'noun' }, tags: ['noun'] },
];

// What a perfect answer looks like, what a useless one looks like.
const REPLIES = {
  oracle: {
    base: 'kutoa', translations: ['to knit'], form_translation: 'knitted', pos: 'verb',
    example: 'Mummo kutoo lapselle villasukkia.', example_translation: 'Grandma knits wool socks for the child.',
  },
  null: {
    base: '', translations: [], form_translation: '', pos: '',
    example: '', example_translation: '',
  },
};

const server = createServer((req, res) => {
  let body = '';
  req.on('data', (c) => { body += c; });
  req.on('end', () => {
    const sent = JSON.parse(body);
    const word = /"([^"]+)"\nSentence/.exec(sent.messages[0].content)?.[1];
    const which = word === 'kutoi' ? 'oracle' : word === 'talo' ? 'null'
      : word === 'auto' ? 'junk' : 'apierror';
    if (which === 'junk') {
      // Unparseable model output — a model failure, so it must be scored, not
      // filed as a harness error.
      res.writeHead(200, { 'content-type': 'application/json' });
      return res.end(JSON.stringify({
        model: MODEL, stop_reason: 'end_turn',
        usage: { input_tokens: 500, output_tokens: 20 },
        content: [{ type: 'text', text: 'Sorry, I cannot help with that.' }],
      }));
    }
    if (which === 'apierror') {
      res.writeHead(500, { 'content-type': 'application/json' });
      return res.end(JSON.stringify({ error: { message: 'stub: induced server error' } }));
    }
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({
      model: MODEL, stop_reason: 'end_turn',
      usage: { input_tokens: 500, output_tokens: 80 },
      content: [{ type: 'text', text: JSON.stringify(REPLIES[which]) }],
    }));
  });
});

const fail = [];
const check = (name, cond, detail) => {
  if (cond) console.log(`  ok   ${name}`);
  else { console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`); fail.push(name); }
};

await new Promise((r) => server.listen(0, '127.0.0.1', r));
const port = server.address().port;

const dir = mkdtempSync(join(tmpdir(), 'luku-eval-selftest-'));
const casesPath = join(dir, 'cases.json');
writeFileSync(casesPath, JSON.stringify({ cases: CASES }));
const flow = join(dir, 'flow');

const run = async (flowDir, extra) => {
  const child = spawn(process.execPath, [
    'scripts/eval/run-eval.mjs',
    '--flow', flowDir, '--model', MODEL,
    '--reps', '1', '--concurrency', '3', '--approve-harness', ...extra,
  ], {
    env: {
      ...process.env,
      ANTHROPIC_API_KEY: 'sk-ant-stub',
      ANTHROPIC_BASE_URL: `http://127.0.0.1:${port}/v1/messages`,
      EVAL_CASES: casesPath,
    },
    stdio: ['ignore', 'ignore', 'ignore'],
  });
  await new Promise((r) => child.on('close', r));
};
const rowsIn = (flowDir, variant) => {
  const f = join(flowDir, variant, 'results.jsonl');
  return existsSync(f)
    ? readFileSync(f, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l))
    : [];
};

// A --limit pilot, then the same command without it — the pilot must resume
// into the full pass rather than re-running or duplicating what it did.
const pilotFlow = join(dir, 'pilot');
await run(pilotFlow, ['--variant', 'baseline', '--limit', '2']);
const afterPilot = rowsIn(pilotFlow, 'baseline').length;
await run(pilotFlow, ['--variant', 'baseline']);
const afterFull = rowsIn(pilotFlow, 'baseline');

// A variant judged with no frozen baseline reference must fail, not score a tie.
const orphanFlow = join(dir, 'orphan');
await run(orphanFlow, ['--variant', 'v1']);

await run(flow, ['--variant', 'baseline']);
server.close();

console.log('\nchecks:');
check('--limit 2 ran exactly 2 cases', afterPilot === 2, `ran ${afterPilot}`);
// apierror never yields a scored row by design, so a full pass scores the rest.
const scorable = CASES.length - 1;
check('the pilot resumed into a full pass without duplicating',
  afterFull.length === scorable
  && new Set(afterFull.map((r) => `${r.prompt_id}:${r.rep}`)).size === scorable,
  `${afterFull.length} rows for ${scorable} scorable cases`);
const orphanErrs = existsSync(join(orphanFlow, 'v1', 'errors.jsonl'))
  ? readFileSync(join(orphanFlow, 'v1', 'errors.jsonl'), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l))
  : [];
check('a variant with no frozen reference fails instead of scoring a tie',
  rowsIn(orphanFlow, 'v1').length === 0
  && orphanErrs.some((e) => e.failure_class === 'missing_reference'),
  `${rowsIn(orphanFlow, 'v1').length} scored rows, classes: ${orphanErrs.map((e) => e.failure_class).join(',')}`);
const resultsPath = join(flow, 'baseline', 'results.jsonl');
const rows = existsSync(resultsPath)
  ? readFileSync(resultsPath, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l))
  : [];
const byId = Object.fromEntries(rows.map((r) => [r.prompt_id, r]));

const oracle = byId.oracle;
check('oracle case produced a row', Boolean(oracle));
if (oracle) {
  const g = oracle.grade;
  check('oracle scores 1 on every programmatic metric',
    g.base_ok === 1 && g.pos_ok === 1 && g.format_ok === 1 && g.example_valid === 1,
    JSON.stringify(g));
  check('baseline row carries the neutral pairwise value', g.example_win === 0.5);
  check('oracle records usage', oracle.usage?.input_tokens === 500 && oracle.usage?.output_tokens === 80);
  check('oracle records the served model', oracle.model === MODEL);
  check('oracle marked status ok', oracle.status === 'ok');
  const trace = join(flow, 'baseline', 'traces', 'oracle_rep0.json');
  check('oracle wrote a transcript', existsSync(trace));
  if (existsSync(trace)) {
    const turns = JSON.parse(readFileSync(trace, 'utf8'));
    check('transcript carries the real system prompt',
      turns[0].role === 'system' && /recoverable/.test(turns[0].content));
  }
}

const nul = byId.null;
check('null case produced a row', Boolean(nul));
if (nul) {
  const g = nul.grade;
  check('null scores 0 on every programmatic metric',
    g.base_ok === 0 && g.pos_ok === 0 && g.format_ok === 0 && g.example_valid === 0,
    JSON.stringify(g));
}

const junk = byId.junk;
check('unparseable model output IS scored, not filed as a harness error', Boolean(junk));
if (junk) {
  check('unparseable output scores 0 on format_ok and base_ok',
    junk.grade.format_ok === 0 && junk.grade.base_ok === 0, JSON.stringify(junk.grade));
}

check('api-error case is NOT scored in results.jsonl', !byId.apierror);
const errorsPath = join(flow, 'baseline', 'errors.jsonl');
const errs = existsSync(errorsPath)
  ? readFileSync(errorsPath, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l))
  : [];
const apiErr = errs.find((e) => e.prompt_id === 'apierror');
check('api-error landed in errors.jsonl', Boolean(apiErr));
check('api-error carries a failure class', apiErr?.failure_class === 'api_error',
  apiErr ? `got ${apiErr.failure_class}` : 'no row');

console.log(fail.length ? `\n${fail.length} check(s) failed` : '\nall checks passed');
process.exit(fail.length ? 1 : 0);
