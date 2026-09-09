/**
 * Bundles: named groups of words, and the membership rows joining the two.
 *
 * A bundle is normally "the words from this page" — the app sets one active
 * while reading and every word added lands in it — but nothing here assumes
 * that. Membership is many-to-many, so a word met on a second page joins that
 * page's bundle without leaving the first.
 *
 * Every query is scoped by user_id, and the membership writes scope *both*
 * sides: a forged bundle id must not be able to attach someone else's word.
 */

export { MAX_BUNDLE_NAME, normalizeBundleName, MAX_BUNDLE_ID, isValidBundleId } from "./shared/bundle.js";

export async function listBundles(sql, userId) {
  return sql`
    SELECT id, name, created_at FROM bundles
    WHERE user_id = ${userId}
    ORDER BY created_at DESC, id DESC
  `;
}

export async function getBundle(sql, userId, bundleId) {
  const rows = await sql`
    SELECT id, name, created_at FROM bundles
    WHERE id = ${bundleId} AND user_id = ${userId}
  `;
  return rows[0] ?? null;
}

/**
 * Create a bundle, or return the one that already carries the name.
 *
 * "Add a bundle called X" is what the picker asks for, and asking twice — two
 * tabs, a double tap, a retry — must not produce two bundles. The no-op
 * DO UPDATE is what makes that one statement: DO NOTHING would return no row
 * on the second call, and the driver has no transaction to wrap a follow-up
 * SELECT in. The existing name wins over the newly typed one, so re-adding
 * "kotimaa" does not rename the user's "Kotimaa".
 *
 * The conflict target infers `bundles_user_name` in db/schema.sql. A bare
 * function call is a valid index-inference expression — the parentheses the
 * Postgres grammar shows around `index_expression` are only needed where the
 * expression would otherwise be ambiguous, as an operator expression would.
 */
export async function createBundle(sql, userId, name) {
  const rows = await sql`
    INSERT INTO bundles (user_id, name) VALUES (${userId}, ${name})
    ON CONFLICT (user_id, lower(name)) DO UPDATE SET name = bundles.name
    RETURNING id, name, created_at
  `;
  return rows[0] ?? null;
}

/** Deletes the bundle and its membership rows (ON DELETE CASCADE); the words
 *  themselves are untouched. */
export async function deleteBundle(sql, userId, bundleId) {
  const rows = await sql`
    DELETE FROM bundles WHERE id = ${bundleId} AND user_id = ${userId} RETURNING id
  `;
  return rows[0] ?? null;
}

/** The bundles a word belongs to, as ids. */
export async function wordBundleIds(sql, userId, wordId) {
  const rows = await sql`
    SELECT wb.bundle_id FROM word_bundles wb
    JOIN words w ON w.id = wb.word_id
    WHERE wb.word_id = ${wordId} AND w.user_id = ${userId}
    ORDER BY wb.bundle_id
  `;
  return rows.map((r) => r.bundle_id);
}

/**
 * Attach a word to a bundle. Returns true when the pair exists afterwards.
 *
 * The INSERT ... SELECT checks both owners in the same statement as the write,
 * which is what a driver without interactive transactions can still make
 * atomic. The no-op DO UPDATE keeps a re-add returning a row, so "already a
 * member" and "not yours" stay distinguishable — with DO NOTHING they would
 * both be empty. The conflict target is word_bundles' primary key.
 */
export async function addWordToBundle(sql, userId, wordId, bundleId) {
  const rows = await sql`
    INSERT INTO word_bundles (word_id, bundle_id)
    SELECT w.id, b.id FROM words w, bundles b
    WHERE w.id = ${wordId} AND b.id = ${bundleId}
      AND w.user_id = ${userId} AND b.user_id = ${userId}
    ON CONFLICT (word_id, bundle_id) DO UPDATE SET added_at = word_bundles.added_at
    RETURNING bundle_id
  `;
  return !!rows[0];
}

/** Detach a word from a bundle. Returns true when a membership was removed. */
export async function removeWordFromBundle(sql, userId, wordId, bundleId) {
  const rows = await sql`
    DELETE FROM word_bundles wb
    USING words w
    WHERE wb.word_id = w.id
      AND wb.word_id = ${wordId} AND wb.bundle_id = ${bundleId}
      AND w.user_id = ${userId}
    RETURNING wb.bundle_id
  `;
  return !!rows[0];
}
