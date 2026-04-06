import { stackServerApp } from "@/app/stack";
import { getDb } from "@/lib/db";
import { calcSRS } from "@/lib/srs";

export async function POST(request) {
  const user = await stackServerApp.getUser({ tokenStore: request });
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { wordId, grade } = await request.json();
  const sql = getDb();

  const rows = await sql`SELECT * FROM words WHERE id = ${wordId} AND user_id = ${user.id}`;
  if (!rows[0]) return Response.json({ error: "Not found" }, { status: 404 });

  const { ease_factor, interval_days, next_review_at, review_count } = calcSRS(rows[0], grade);

  const updated = await sql`
    UPDATE words SET
      ease_factor   = ${ease_factor},
      interval_days = ${interval_days},
      next_review_at = ${next_review_at},
      review_count  = ${review_count}
    WHERE id = ${wordId} AND user_id = ${user.id}
    RETURNING *
  `;
  return Response.json({ word: updated[0] });
}
