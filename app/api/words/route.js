import { getAuth } from "@/lib/auth/server";
import { getDb } from "@/lib/db";

export async function GET() {
  const { data: session } = await getAuth().getSession();
  const user = session?.user;
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const sql = getDb();
  const words = await sql`
    SELECT * FROM words WHERE user_id = ${user.id} ORDER BY next_review_at ASC
  `;
  return Response.json({ words });
}

export async function POST(request) {
  const { data: session } = await getAuth().getSession();
  const user = session?.user;
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { word, base, translations, pos } = await request.json();
  const sql = getDb();

  const rows = await sql`
    INSERT INTO words (user_id, word, base, translations, pos)
    VALUES (${user.id}, ${word}, ${base ?? word}, ${translations}, ${pos ?? "other"})
    ON CONFLICT (user_id, base) DO UPDATE
      SET word = EXCLUDED.word, translations = EXCLUDED.translations, pos = EXCLUDED.pos
    RETURNING *
  `;
  return Response.json({ word: rows[0] ?? null });
}
