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

export async function DELETE(request) {
  const { data: session } = await getAuth().getSession();
  const user = session?.user;
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const idParam = searchParams.get("id");
  if (!idParam) return Response.json({ error: "Missing id" }, { status: 400 });

  const id = Number.parseInt(idParam, 10);
  if (!Number.isSafeInteger(id) || String(id) !== idParam) {
    return Response.json({ error: "Invalid id" }, { status: 400 });
  }

  const sql = getDb();
  const rows = await sql`DELETE FROM words WHERE id = ${id} AND user_id = ${user.id} RETURNING id`;
  if (!rows[0]) return Response.json({ error: "Not found" }, { status: 404 });
  return Response.json({ ok: true });
}

export async function POST(request) {
  const { data: session } = await getAuth().getSession();
  const user = session?.user;
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { word, base, translations, pos, formTranslation, example, example_translation } = await request.json();
  const sql = getDb();

  const baseForm = base ?? word;
  const forms = word && baseForm && word.toLowerCase() !== baseForm.toLowerCase()
    ? [{ word, translation: formTranslation ?? null }]
    : [];

  const rows = await sql`
    INSERT INTO words (user_id, base, translations, pos, forms, example, example_translation)
    VALUES (${user.id}, ${baseForm}, ${translations}, ${pos ?? "other"}, ${JSON.stringify(forms)}::jsonb, ${example ?? null}, ${example_translation ?? null})
    ON CONFLICT (user_id, base) DO UPDATE
      SET translations = EXCLUDED.translations, pos = EXCLUDED.pos,
          forms = CASE
            WHEN jsonb_array_length(EXCLUDED.forms) = 0 THEN words.forms
            WHEN EXISTS (
              SELECT 1 FROM jsonb_array_elements(words.forms) AS f
              WHERE lower(f->>'word') = lower(EXCLUDED.forms->0->>'word')
            ) THEN words.forms
            ELSE words.forms || EXCLUDED.forms
          END,
          example = COALESCE(EXCLUDED.example, words.example),
          example_translation = COALESCE(EXCLUDED.example_translation, words.example_translation)
    RETURNING *
  `;
  return Response.json({ word: rows[0] ?? null });
}
