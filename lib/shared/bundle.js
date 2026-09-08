/**
 * Bundle field rules, shared by the routes that store them and the client that
 * sends them — so the client cannot hold, or send, a value the server will
 * reject.
 *
 * lib/shared/ is the isomorphic tier: no imports, so it is safe to bundle.
 */

/** bundles.id is SERIAL, so anything past int4 range errors in Postgres rather
 *  than simply not matching. The server rejects those as a 400; the client
 *  applies the same bound to the id it remembers in localStorage, which is
 *  user-editable and therefore not to be trusted just for parsing cleanly. */
export const MAX_BUNDLE_ID = 2147483647;

export function isValidBundleId(id) {
  return Number.isSafeInteger(id) && id > 0 && id <= MAX_BUNDLE_ID;
}

/** Long enough for a chapter heading, short enough to render as a chip. */
export const MAX_BUNDLE_NAME = 60;

/**
 * The stored form of a typed bundle name, or null when it isn't usable.
 * Internal whitespace is collapsed so "Luku  3" and "Luku 3" are one bundle
 * rather than two nobody could tell apart in the picker.
 */
export function normalizeBundleName(name) {
  if (typeof name !== "string") return null;
  const trimmed = name.replace(/\s+/g, " ").trim();
  if (!trimmed || trimmed.length > MAX_BUNDLE_NAME) return null;
  return trimmed;
}
