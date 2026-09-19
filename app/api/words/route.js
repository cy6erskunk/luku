import { getAuth } from "@/lib/auth/server";
import { getDb } from "@/lib/db";
import { isValidWordId } from "@/lib/reviews";

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
  if (!isValidWordId(id) || String(id) !== idParam) {
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

  // next_review_at is set here rather than left to the column's DEFAULT NOW().
  // A word is added because the reader just met it in a text, which is not a
  // recall test, so it must not be due the instant it is saved: the web app
  // hides freshly added words from the due queue for the rest of the scan
  // (page.jsx's newWordIds), but that is per-mount React state the database
  // knows nothing about — and the Telegram bot derives its whole queue from
  // `next_review_at <= NOW()`. A word saved on the web therefore arrived in
  // chat within the hour, sorted ahead of genuinely overdue cards.
  //
  // One day matches what a first review would have scheduled anyway
  // (calcSRS's review_count === 0 branch), and no SRS counter is touched, so
  // the first real grade still takes that branch. The DO UPDATE below leaves
  // the column alone on purpose: re-adding a word to record a new inflection
  // must not push its existing schedule out.
  const rows = await sql`
    INSERT INTO words (user_id, base, translations, pos, forms, example, example_translation, next_review_at)
    VALUES (${user.id}, ${baseForm}, ${translations}, ${pos ?? "other"}, ${JSON.stringify(forms)}::jsonb, ${example ?? null}, ${example_translation ?? null}, NOW() + INTERVAL '1 day')
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
