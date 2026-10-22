/**
 * What the server tells a client about itself, returned as
 * InitializeResult.instructions.
 *
 * The spec's own slot for "how to use this server", read once at connect time
 * and — on clients that honour it — placed in the model's system prompt. That
 * is what makes it the right home for the scheduling model: a client reading a
 * card sees `review_count` and `ease_factor` with no way to guess what either
 * counts, and the two obvious guesses are both wrong. Luku is not FSRS, and
 * `review_count` is not a lifetime total.
 *
 * Its own module rather than inline in protocol.js, which stays generic
 * dispatch and is handed everything it answers with.
 *
 * Two rules for editing it:
 *
 * 1. **It is charged for on every turn.** A client may carry this in its system
 *    prompt for the whole of a conversation, so a sentence that does not change
 *    what the model would do is a sentence to cut. The tool descriptions carry
 *    per-tool detail; this carries only what no single tool's description would.
 * 2. **Numbers are interpolated, never typed.** Everything quantitative comes
 *    from lib/srs.js, so tuning the algorithm cannot leave this text describing
 *    the old one. lib/mcp/__tests__/instructions.test.js fails if a number here
 *    stops matching its source.
 */
import { AGAIN_DELAY_MINUTES, DEFAULT_EASE_FACTOR, FAILURES_TO_FLOOR, MIN_EASE_FACTOR, easeDelta } from "@/lib/srs";
import { GRADES } from "@/lib/reviews";

/** Signed, so a delta reads as "+0.1" / "-0.54" rather than needing prose. */
const signed = (n) => (n > 0 ? `+${n}` : `${n}`);

/** Rounded for display only: easeDelta(3) is -0.13999999999999999 in binary. */
const delta = (grade) => signed(Number(easeDelta(grade).toFixed(2)));

export const INSTRUCTIONS = `Luku is a Finnish vocabulary app. A card is one Finnish base form with English translations, a part of speech and optionally an example sentence. Each is made from one tapped word while reading, so some come out thin: a translation from the wrong sense, a part of speech that never parsed, a vague example. Refining those is what these tools are for — you do the language work, the server only reads and writes rows.

Scheduling is a simplified SM-2, not FSRS. Reviews are graded ${GRADES.join(", ")} — ${GRADES[0]} Again, ${GRADES[1]} Hard, ${GRADES[2]} Easy — and the fields on a card mean:

- review_count — consecutive passes, NOT times seen. Again resets it to 0 along with the interval, so a long-drilled card just failed reads 0, exactly like one never reviewed.
- ease_factor — difficulty so far. Starts at ${DEFAULT_EASE_FACTOR}, moves ${delta(GRADES[2])} for Easy, ${delta(GRADES[1])} for Hard, ${delta(GRADES[0])} for Again, floored at ${MIN_EASE_FACTOR}; lower is harder, below ${DEFAULT_EASE_FACTOR} means lost ground. At-or-above ${DEFAULT_EASE_FACTOR} does NOT mean never reviewed: easy answers push it above, and a long mix can land back on it exactly. It also saturates — ${FAILURES_TO_FLOOR} failures from ${DEFAULT_EASE_FACTOR} reach the floor and later ones move it no further — so among floored cards it ranks nothing.
- lapses — lifetime count of failures: the one difficulty signal still working once a card is on the floor.
- next_review_at — when the card comes up again. Again puts it ${AGAIN_DELAY_MINUTES} minutes out, so a just-failed card is due again almost at once.

Three queries worth knowing: filter "difficult" for what has ever been hard, which on a well-used collection can be most of the list, filter "lapsed" for the sharper "failed at its last review", and "due" for most overdue first, then soonest due. Caveat on lapses: it began counting when the column was added, not at each card's first review, so a low number on an old card is unknown rather than good news.

You can write only translations, pos, example and example_translation. Nothing here can reschedule a card, rename its base form, change its inflections or delete it, so refining never costs the user progress.`;
