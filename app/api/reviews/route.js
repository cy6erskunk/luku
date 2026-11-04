import { getAuth } from "@/lib/auth/server";
import { getDb } from "@/lib/db";
import { gradeWord, isValidGrade, isValidWordId, restartWord } from "@/lib/reviews";
import { pickSchedule } from "@/lib/shared/schedule";

export async function POST(request) {
  const { data: session } = await getAuth().getSession();
  const user = session?.user;
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { wordId, grade, restart } = await request.json();
  if (!isValidWordId(wordId)) return Response.json({ error: "Invalid wordId" }, { status: 400 });
  // `restart: true` starts the schedule over instead of grading: the reader
  // re-added a word they already had and chose to keep it.
  if (restart !== true && !isValidGrade(grade)) return Response.json({ error: "Invalid grade" }, { status: 400 });

  const updated = restart === true
    ? await restartWord(getDb(), user.id, wordId)
    : await gradeWord(getDb(), user.id, wordId, grade);
  if (!updated) return Response.json({ error: "Not found" }, { status: 404 });

  // gradeWord answers with the whole row, which the bot uses; the browser gets
  // only what this write owns, so no client can swap a stale example back in.
  return Response.json({ word: pickSchedule(updated) });
}
