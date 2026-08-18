import { getAuth } from "@/lib/auth/server";
import { getDb } from "@/lib/db";
import { gradeWord, isValidGrade, isValidWordId } from "@/lib/reviews";

export async function POST(request) {
  const { data: session } = await getAuth().getSession();
  const user = session?.user;
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { wordId, grade } = await request.json();
  if (!isValidWordId(wordId)) return Response.json({ error: "Invalid wordId" }, { status: 400 });
  if (!isValidGrade(grade)) return Response.json({ error: "Invalid grade" }, { status: 400 });

  const updated = await gradeWord(getDb(), user.id, wordId, grade);
  if (!updated) return Response.json({ error: "Not found" }, { status: 404 });

  return Response.json({ word: updated });
}
