/**
 * Word *content* access — the four columns that describe what a word means,
 * as opposed to when it is next due.
 *
 * Shared by /api/words' PATCH and by the MCP server's tools, so a card edited
 * from a chat client and one edited in ExamplePicker are held to the same
 * limits. That sharing is the point: a second copy of `isExampleText` with a
 * different cap would let one path store what the other refuses.
 *
 * SRS columns are deliberately absent from everything here. updateWordContent
 * names four columns and no more, so refining a card can never reschedule it —
 * the mirror of the property /api/reviews relies on from the other direction.
 */

/** Longer than any example worth keeping; a cap so a body cannot store an essay. */
export const MAX_EXAMPLE = 500;
export const isExampleText = (v) => typeof v === "string" && v.trim() !== "" && v.length <= MAX_EXAMPLE;

/**
 * An example's translation may be cleared, so `null` is a value here rather
 * than an absence. Whether the field was supplied at all is decided by the
 * caller, before this is reached.
 */
export const isExampleTranslation = (v) =>
  v === null || (typeof v === "string" && v.length <= MAX_EXAMPLE);

/** The parts of speech WordList.jsx and ReadStage.jsx colour, plus the default. */
export const POS_VALUES = ["noun", "verb", "adjective", "adverb", "other"];

/**
 * `adj` and `adv` are accepted and widened.
 *
 * translateWord()'s prompt asks the model for "noun/verb/adj/adv/other", but
 * POS_CLR in WordList.jsx and ReadStage.jsx keys on the long names, so a card
 * saved as `adj` renders in the fallback grey. Rejecting the short forms here
 * would make a refine request fail for saying exactly what the app's own
 * prompt asks for; widening them is what makes refining a card fix its colour
 * too. Existing rows are not back-filled — only a card someone refines is
 * corrected.
 */
const POS_ALIASES = { adj: "adjective", adv: "adverb" };

export function normalizePos(value) {
  if (typeof value !== "string") return null;
  const lower = value.trim().toLowerCase();
  const widened = POS_ALIASES[lower] ?? lower;
  return POS_VALUES.includes(widened) ? widened : null;
}

export const MAX_TRANSLATIONS = 10;
export const MAX_TRANSLATION = 200;

/**
 * What translateWord() stores when the model's JSON will not parse, and what
 * the `suspect` filter looks for. Writing it back is refused: a refine pass
 * must not be able to re-mark a card as broken.
 */
export const UNAVAILABLE = "(unavailable)";

/**
 * The trimmed translations, or null when the input is not a usable list.
 * Validation and normalisation in one call, so no caller can store an
 * untrimmed value by forgetting the second step.
 */
export function normalizeTranslations(value) {
  if (!Array.isArray(value) || value.length === 0 || value.length > MAX_TRANSLATIONS) return null;
  const out = [];
  for (const entry of value) {
    if (typeof entry !== "string") return null;
    const trimmed = entry.trim();
    if (!trimmed || trimmed.length > MAX_TRANSLATION) return null;
    if (trimmed.toLowerCase() === UNAVAILABLE) return null;
    out.push(trimmed);
  }
  return out;
}

export const LIST_FILTERS = ["all", "missing_example", "suspect"];
export const MAX_LIST_LIMIT = 50;
export const DEFAULT_LIST_LIMIT = 25;

/**
 * A page of the user's words, with the total the page was taken from.
 *
 * `count(*) OVER ()` rather than a second query: the HTTP driver has no
 * transactions, so a separate count could disagree with the rows beside it.
 *
 * Each filter is its own tagged template, with its columns spelled out. A
 * WHERE clause cannot travel as a parameter, and assembling one by
 * concatenation is the thing the query rules forbid — three literal statements
 * is the honest way to write it.
 *
 * Ordered by base so paging with an offset is stable, and so a caller working
 * through a vocabulary can tell how far it has got.
 */
export async function listWords(sql, userId, { filter = "all", limit = DEFAULT_LIST_LIMIT, offset = 0 } = {}) {
  let rows;
  if (filter === "missing_example") {
    rows = await sql`
      SELECT id, base, translations, pos, example, example_translation, review_count, next_review_at,
             count(*) OVER ()::int AS total
      FROM words
      WHERE user_id = ${userId} AND (example IS NULL OR trim(example) = '')
      ORDER BY base ASC, id ASC
      LIMIT ${limit} OFFSET ${offset}
    `;
  } else if (filter === "suspect") {
    rows = await sql`
      SELECT id, base, translations, pos, example, example_translation, review_count, next_review_at,
             count(*) OVER ()::int AS total
      FROM words
      WHERE user_id = ${userId} AND (pos = '?' OR ${UNAVAILABLE} = ANY(translations))
      ORDER BY base ASC, id ASC
      LIMIT ${limit} OFFSET ${offset}
    `;
  } else {
    rows = await sql`
      SELECT id, base, translations, pos, example, example_translation, review_count, next_review_at,
             count(*) OVER ()::int AS total
      FROM words
      WHERE user_id = ${userId}
      ORDER BY base ASC, id ASC
      LIMIT ${limit} OFFSET ${offset}
    `;
  }

  // The window count rides on every row, so it is read off one and stripped
  // from all of them: it describes the page, not the word.
  const total = rows[0]?.total ?? 0;
  return { total, words: rows.map(({ total: _total, ...word }) => word) };
}

export async function getWordById(sql, userId, id) {
  const rows = await sql`
    SELECT id, base, translations, pos, example, example_translation, review_count, next_review_at
    FROM words WHERE id = ${id} AND user_id = ${userId}
  `;
  return rows[0] ?? null;
}

/** Case-insensitive, because a caller quoting a word back from a chat has no
 *  reason to have preserved the case the row was stored with. */
export async function getWordByBase(sql, userId, base) {
  const rows = await sql`
    SELECT id, base, translations, pos, example, example_translation, review_count, next_review_at
    FROM words WHERE user_id = ${userId} AND lower(base) = lower(${base})
  `;
  return rows[0] ?? null;
}

/**
 * Writes whichever of the four content columns `patch` carries, and returns
 * the row's id plus only those columns.
 *
 * `patch` holds a key only when that column is meant to change, which is what
 * lets `example_translation: null` mean "clear it" rather than "leave it".
 * A CASE per column carries that distinction into SQL, so this stays one
 * statement — the driver has no transactions, and a read-then-write here could
 * not be held together.
 *
 * The reply is projected down to what was written, like pickSchedule does for
 * a grade: a caller merging a whole row back would undo a column this write
 * never owned.
 */
export async function updateWordContent(sql, userId, id, patch) {
  const fields = ["translations", "pos", "example", "example_translation"].filter((f) => f in patch);
  if (fields.length === 0) return null;

  // The flags are cast explicitly: CASE WHEN needs a boolean, and an
  // uncast parameter arrives as text for Postgres to infer from context.
  const has = (f) => fields.includes(f);
  const rows = await sql`
    UPDATE words SET
      translations        = CASE WHEN ${has("translations")}::boolean THEN ${patch.translations ?? null}::text[] ELSE translations END,
      pos                 = CASE WHEN ${has("pos")}::boolean THEN ${patch.pos ?? null}::text ELSE pos END,
      example             = CASE WHEN ${has("example")}::boolean THEN ${patch.example ?? null}::text ELSE example END,
      example_translation = CASE WHEN ${has("example_translation")}::boolean THEN ${patch.example_translation ?? null}::text ELSE example_translation END
    WHERE id = ${id} AND user_id = ${userId}
    RETURNING id, translations, pos, example, example_translation
  `;
  const row = rows[0];
  if (!row) return null;

  const out = { id: row.id };
  for (const f of fields) out[f] = row[f];
  return out;
}
