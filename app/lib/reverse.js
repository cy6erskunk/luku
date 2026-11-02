/**
 * Reverse practice (alpha): English on the front, Finnish on the back.
 *
 * Ungraded on purpose. Recalling the Finnish word is a harder skill than
 * recognising it, and folding those answers into the one schedule a word has
 * would let the easy direction and the hard one push each other around. Until
 * reverse cards get a schedule of their own, a reverse pass writes nothing.
 */

/** Cards per reverse pass. */
export const REVERSE_SESSION_SIZE = 12;

/**
 * How far along a word has to be before it is offered in reverse: two
 * consecutive passes, i.e. it has survived its second review. Producing a word
 * the reader cannot yet reliably recognise is mostly guessing. `review_count`
 * is reset by Again, so a word failed at its last review drops out until it
 * has been passed twice again.
 */
export const REVERSE_MIN_REVIEW_COUNT = 2;

/** Words far enough along to be practised in reverse. */
export function reverseEligible(words) {
  return words.filter((w) => Number(w.review_count ?? 0) >= REVERSE_MIN_REVIEW_COUNT);
}

function shuffle(arr, random) {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * One reverse pass: up to `size` eligible words, the ones not yet practised in
 * this sitting first, so "another session" moves on to new words rather than
 * drawing the same ones again. Once every eligible word has been seen, `seen`
 * is cleared and the cycle starts over.
 *
 * `seen` is a Set of word ids, mutated here so it outlives the pass.
 */
export function pickReverseSession(words, seen, { size = REVERSE_SESSION_SIZE, random = Math.random } = {}) {
  const eligible = reverseEligible(words);
  if (eligible.length === 0) return [];
  let unseen = eligible.filter((w) => !seen.has(w.id));
  if (unseen.length === 0) {
    seen.clear();
    unseen = eligible;
  }
  const picked = shuffle(unseen, random).slice(0, size);
  // A short last round is topped up from words already seen, so a pass is
  // always full while there are enough eligible words.
  if (picked.length < size) {
    const pickedIds = new Set(picked.map((w) => w.id));
    const rest = shuffle(eligible.filter((w) => !pickedIds.has(w.id)), random);
    picked.push(...rest.slice(0, size - picked.length));
  }
  for (const w of picked) seen.add(w.id);
  return picked;
}
