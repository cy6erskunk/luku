import { getAuth } from "@/lib/auth/server";
import { getDb } from "@/lib/db";
import { getWord, gradeWord, isValidGrade, isValidWordId } from "@/lib/reviews";
import { pickSchedule } from "@/lib/shared/schedule";

export async function POST(request) {
  const { data: session } = await getAuth().getSession();
  const user = session?.user;
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { wordId, grade, expectedNextReviewAt } = await request.json();
  if (!isValidWordId(wordId)) return Response.json({ error: "Invalid wordId" }, { status: 400 });
  if (!isValidGrade(grade)) return Response.json({ error: "Invalid grade" }, { status: 400 });
  // The schedule the tab was looking at when the reader answered. Optional, so
  // a tab loaded before this field existed still grades as it used to.
  if (expectedNextReviewAt !== undefined && !isTimestamp(expectedNextReviewAt)) {
    return Response.json({ error: "Invalid expectedNextReviewAt" }, { status: 400 });
  }

  const sql = getDb();
  const updated = await gradeWord(sql, user.id, wordId, grade, { expectedNextReviewAt });
  if (!updated) {
    // gradeWord answers null both for a card that is gone and for one whose
    // schedule is no longer the one the tab showed — graded since, on the bot
    // or in another tab. Only the second deserves the card's current
    // schedule, so the tab can catch up instead of grading it a second time.
    const current = expectedNextReviewAt === undefined ? null : await getWord(sql, user.id, wordId);
    if (!current) return Response.json({ error: "Not found" }, { status: 404 });
    return Response.json({ error: "Already graded", word: pickSchedule(current) }, { status: 409 });
  }

  // gradeWord answers with the whole row, which the bot uses; the browser gets
  // only what this write owns, so no client can swap a stale example back in.
  return Response.json({ word: pickSchedule(updated) });
}

// An ISO 8601 timestamp, as the word list sends next_review_at. `new Date`
// alone would take "1" as the year 2001, and the guard would then miss and
// report a client bug as a card graded elsewhere.
const ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;

function isTimestamp(value) {
  return typeof value === "string" && ISO_TIMESTAMP.test(value) && !Number.isNaN(new Date(value).getTime());
}
