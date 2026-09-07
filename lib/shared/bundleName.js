/**
 * Bundle-name rules, needed by the API route that stores a name and by the
 * picker that types one.
 *
 * lib/shared/ is the isomorphic tier: no imports, so it is safe to bundle.
 */

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
