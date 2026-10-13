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
import { DEFAULT_EASE_FACTOR, MIN_EASE_FACTOR, easeDelta } from "@/lib/srs";
import { GRADES } from "@/lib/reviews";

/** Signed, so a delta reads as "+0.1" / "-0.54" rather than needing prose. */
const signed = (n) => (n > 0 ? `+${n}` : `${n}`);

/** Rounded for display only: easeDelta(3) is -0.13999999999999999 in binary. */
const delta = (grade) => signed(Number(easeDelta(grade).toFixed(2)));

export const INSTRUCTIONS = `Luku is a Finnish vocabulary app. Each card is one Finnish base form with English translations, a part of speech, and optionally an example sentence. Cards are created from a single tapped word while reading, so some come out thin — a translation from the wrong sense, a part of speech that never parsed, a vague example. Refining those is what these tools are for. You do the language work; the server only reads and writes rows.

Scheduling is a simplified SM-2, not FSRS. Reviews are graded ${GRADES.join(", ")} — ${GRADES[0]} Again, ${GRADES[1]} Hard, ${GRADES[2]} Easy — and the fields on a card mean:

- review_count — consecutive passes, NOT how many times the card has been seen. Again resets it to 0 and the interval to 1 day, so a long-studied card that was just failed reads 0, exactly like a card never reviewed at all.
- ease_factor — the only durable record of difficulty, since nothing counts lapses. Starts at ${DEFAULT_EASE_FACTOR} and moves ${delta(GRADES[2])} for Easy, ${delta(GRADES[1])} for Hard, ${delta(GRADES[0])} for Again, with a floor of ${MIN_EASE_FACTOR}. Lower means harder, and below ${DEFAULT_EASE_FACTOR} means the card has lost ground overall. Do not read at-or-above ${DEFAULT_EASE_FACTOR} as never reviewed: a card answered easily rises above it, and one answered easily and badly in equal measure returns to it. What does follow is that review_count 0 together with an ease_factor below ${DEFAULT_EASE_FACTOR} means the card was failed at its last review. For "which words are hardest to recall", use list_words with filter "difficult".
- next_review_at — when the card comes up again.

You can write only translations, pos, example and example_translation. Nothing you do through these tools can reschedule a card, rename its base form, change its recorded inflections or delete it, so refining never costs the user progress on a word they have been drilling.`;
