import { getAuth } from "@/lib/auth/server";
import { getDb, withSchemaGuard } from "@/lib/db";
import { getWord, isValidWordId } from "@/lib/reviews";
import { addWordToBundle, isValidBundleId, removeWordFromBundle, wordBundleIds } from "@/lib/bundles";

export async function GET() {
  const { data: session } = await getAuth().getSession();
  const user = session?.user;
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  return withSchemaGuard(async () => {
    const sql = getDb();
    // Bundle membership travels with the word, so the client can group, filter
    // and review by bundle without a request per word. It also makes the word
    // list depend on word_bundles, which is why this route needs the guard: on
    // a database the schema file has not been re-run against, the whole
    // vocabulary would otherwise fail to load with nothing to show for it.
    const words = await sql`
      SELECT words.*,
             ARRAY(SELECT bundle_id FROM word_bundles WHERE word_id = words.id ORDER BY bundle_id) AS bundle_ids
      FROM words WHERE user_id = ${user.id} ORDER BY next_review_at ASC
    `;
    return Response.json({ words });
  });
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

  return withSchemaGuard(async () => {
    const sql = getDb();

    const baseForm = base ?? word;
    const forms = word && baseForm && word.toLowerCase() !== baseForm.toLowerCase()
      ? [{ word, translation: formTranslation ?? null }]
      : [];

    // One statement, so the word and its membership cannot be separated. The
    // membership needs the word's id, which used to mean a second request —
    // and a window in which the reader could remove the tag between the two,
    // only for the attach to put it back. A data-modifying CTE closes that: the
    // insert below sees `saved`'s id without the client ever holding it.
    //
    // Ownership is still checked on both sides. The word side by construction
    // (`saved` is the row this caller just wrote), the bundle side explicitly —
    // a forged id belonging to someone else matches no row and attaches
    // nothing. A null bundleId matches nothing either, which is how "collect
    // into no bundle" takes the same path.
    const rows = await sql`
      WITH saved AS (
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
      ), attached AS (
        INSERT INTO word_bundles (word_id, bundle_id)
        SELECT saved.id, b.id FROM saved, bundles b
        WHERE b.id = ${bundleId ?? null} AND b.user_id = ${user.id}
        ON CONFLICT (word_id, bundle_id) DO UPDATE SET added_at = word_bundles.added_at
        RETURNING bundle_id
      )
      SELECT saved.*,
        ARRAY(SELECT bundle_id FROM word_bundles WHERE word_id = saved.id ORDER BY bundle_id) AS bundle_ids,
        (SELECT bundle_id FROM attached) AS attached_bundle_id
      FROM saved
    `;
    if (!rows[0]) return Response.json({ word: null });
    // The CTEs share one snapshot, so bundle_ids above cannot see the insert
    // beside it. The attached id is how this answer reports it.
    const { attached_bundle_id: attached, ...saved } = rows[0];
    saved.bundle_ids = attached != null
      ? [...new Set([...(saved.bundle_ids ?? []), attached])].sort((a, b) => a - b)
      : (saved.bundle_ids ?? []);

    return Response.json({ word: saved });
  });
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

  return withSchemaGuard(async () => {
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
  });
}
