/**
 * The models /api/claude is allowed to call, and which one each task uses.
 *
 * Reading a photograph and translating a word are different jobs, and the
 * model that is best at one is not automatically the one worth paying for on
 * the other: an AI scan is a single vision call whose mistakes poison every
 * translation that follows it, while a translation is a short call made once
 * per tapped word and repeated all session. So the choice is per task.
 *
 * Lives in lib/shared/ because both halves need the same list — the browser
 * renders the picker from it, the route validates against it, and a list that
 * disagreed with itself would let the client offer a model the server refuses.
 * It carries this subtree's condition: no imports at all, so nothing
 * server-only rides across the boundary with it.
 */

/**
 * `thinks` is the load-bearing field, not a description. From Sonnet 5 on,
 * omitting the `thinking` parameter still runs adaptive thinking, and those
 * tokens come out of the same `max_tokens` budget as the answer — a 400-token
 * translation call can spend the lot on reasoning and return nothing to parse.
 * Marked models therefore get a low effort setting and a floor under
 * max_tokens (see anthropicRequest). Models that do not think must not be sent
 * `output_config` at all: Haiku 4.5 rejects it.
 */
export const MODELS = [
  {
    id: "claude-haiku-4-5",
    label: "Haiku 4.5",
    note: "Fastest and cheapest.",
    thinks: false,
  },
  {
    id: "claude-sonnet-4-6",
    label: "Sonnet 4.6",
    note: "Balanced. What Luku has always used.",
    thinks: false,
  },
  {
    id: "claude-sonnet-5",
    label: "Sonnet 5",
    note: "Sharper, still quick.",
    thinks: true,
  },
  {
    id: "claude-opus-5",
    label: "Opus 5",
    note: "Best on poor photographs and rare word forms. Slowest.",
    thinks: true,
  },
];

/** The two calls Luku makes to Anthropic, in the order the reader meets them. */
export const TASKS = [
  { id: "ocr", label: "AI scan", note: "Reads Finnish text off a photograph." },
  { id: "translate", label: "Translations", note: "Looks up a word you tap." },
];

/**
 * Both tasks start on the model the app used before it had a picker, so an
 * upgrade changes nobody's bill or latency until they choose otherwise.
 */
export const DEFAULT_MODEL = "claude-sonnet-4-6";
export const DEFAULT_MODELS = Object.freeze({ ocr: DEFAULT_MODEL, translate: DEFAULT_MODEL });

export const isTaskId = (id) => TASKS.some((t) => t.id === id);

export const isModelId = (id) => MODELS.some((m) => m.id === id);

export const modelLabel = (id) => MODELS.find((m) => m.id === id)?.label ?? id;

/**
 * An unrecognised id becomes the default rather than an error. The ids that
 * actually arrive here are the reader's own saved choices, and retiring a
 * model from the list above would otherwise brick every browser still holding
 * its name — a worse failure than quietly reading with a different model.
 */
export const resolveModel = (id) => (isModelId(id) ? id : DEFAULT_MODEL);

/** Drops anything unrecognised, so a stored choice can't outlive its model. */
export function resolveModels(choices) {
  const out = { ...DEFAULT_MODELS };
  for (const task of TASKS) {
    if (isModelId(choices?.[task.id])) out[task.id] = choices[task.id];
  }
  return out;
}

/**
 * Thinking is charged against max_tokens, so a thinking model needs room the
 * caller never asked for. 4096 is well clear of both call sites' own needs
 * (1500 for a page of OCR, 400 for one word) without inviting a runaway.
 */
export const THINKING_MIN_TOKENS = 4096;

/**
 * The model half of an Anthropic request body: which model, how many tokens it
 * may spend, and — only for the models that accept it — how hard to think.
 *
 * Low effort rather than `thinking: { type: "disabled" }`: disabling it is
 * rejected outright at the higher effort levels and, on the models that do
 * accept it, tends to leak reasoning into the visible text. Neither task here
 * wants deliberation anyway — one transcribes, the other looks up a word.
 */
export function anthropicRequest(model, maxTokens) {
  const id = resolveModel(model);
  const thinks = MODELS.find((m) => m.id === id).thinks;
  return {
    model: id,
    max_tokens: thinks ? Math.max(maxTokens, THINKING_MIN_TOKENS) : maxTokens,
    ...(thinks ? { output_config: { effort: "low" } } : {}),
  };
}
