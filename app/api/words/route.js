import { getAuth } from "@/lib/auth/server";
import { getDb } from "@/lib/db";
import { getWord, isValidWordId } from "@/lib/reviews";
import { addWordToBundle, isValidBundleId, removeWordFromBundle, wordBundleIds } from "@/lib/bundles";

export async function GET() {
  const { data: session } = await getAuth().getSession();
  const user = session?.user;
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const sql = getDb();
  // Bundle membership travels with the word, so the client can group, filter
  // and review by bundle without a request per word.
  const words = await sql`
    SELECT words.*,
           ARRAY(SELECT bundle_id FROM word_bundles WHERE word_id = words.id ORDER BY bundle_id) AS bundle_ids
    FROM words WHERE user_id = ${user.id} ORDER BY next_review_at ASC
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
  // Membership rows go with it via ON DELETE CASCADE — there is no transaction
  // to pair a second statement with this one.
  const rows = await sql`DELETE FROM words WHERE id = ${id} AND user_id = ${user.id} RETURNING id`;
  if (!rows[0]) return Response.json({ error: "Not found" }, { status: 404 });
  return Response.json({ ok: true });
}

export async function POST(request) {
  const { data: session } = await getAuth().getSession();
  const user = session?.user;
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { word, base, translations, pos, formTranslation, example, example_translation, bundleId } = await request.json();
  if (bundleId != null && !isValidBundleId(bundleId)) {
    return Response.json({ error: "Invalid bundleId" }, { status: 400 });
  }
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
    RETURNING *,
      ARRAY(SELECT bundle_id FROM word_bundles WHERE word_id = words.id ORDER BY bundle_id) AS bundle_ids
  `;
  const saved = rows[0] ?? null;

  // The membership needs the word's id, so it cannot ride along in the upsert.
  // There is no transaction to pair them in either: a save that lands without
  // its membership is the half-completed state this has to be safe in, and it
  // is — the word is saved, and the next add or reload puts it in the bundle.
  if (saved && bundleId != null && await addWordToBundle(sql, user.id, saved.id, bundleId)) {
    saved.bundle_ids = [...new Set([...(saved.bundle_ids ?? []), bundleId])].sort((a, b) => a - b);
  }

  return Response.json({ word: saved });
}

/** Bundle membership for a word that is already saved. */
export async function PATCH(request) {
  const { data: session } = await getAuth().getSession();
  const user = session?.user;
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { id, bundleId, action } = await request.json();
  if (!isValidWordId(id)) return Response.json({ error: "Invalid id" }, { status: 400 });
  if (!isValidBundleId(bundleId)) return Response.json({ error: "Invalid bundleId" }, { status: 400 });
  if (action !== "add" && action !== "remove") {
    return Response.json({ error: "Invalid action" }, { status: 400 });
  }

  const sql = getDb();
  if (!await getWord(sql, user.id, id)) return Response.json({ error: "Not found" }, { status: 404 });

  if (action === "add") {
    // False here means the bundle is not this user's; the word already was.
    if (!await addWordToBundle(sql, user.id, id, bundleId)) {
      return Response.json({ error: "Not found" }, { status: 404 });
    }
  } else {
    // Removing a membership that isn't there is the state the caller asked for.
    await removeWordFromBundle(sql, user.id, id, bundleId);
  }

  return Response.json({ bundleIds: await wordBundleIds(sql, user.id, id) });
}
