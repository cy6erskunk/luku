import { neon } from "@neondatabase/serverless";

export function getDb() {
  return neon(process.env.DATABASE_URL);
}

/**
 * Postgres' undefined_table and undefined_column. Every table and column these
 * routes name is one `db/schema.sql` creates, so a query that hits either is
 * not a bug in the query — it is a database the schema file has not been re-run
 * against since the last migration was appended to it. Nothing deploys the
 * schema automatically, so a fresh preview pointed at an older database is a
 * normal way to get here.
 *
 * The column case is the likelier one, and catching only the table case missed
 * it. Migrations are appended as `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` far
 * more often than as new tables — `forms`, `example` and `example_translation`
 * all arrived that way — so an older database usually has every table and some
 * of the columns. `/api/words` GET then succeeds and POST fails with 42703,
 * which is the same invisible failure one step along: a reader who can see
 * their list but cannot add to it, told only "Failed to save word (42703)".
 */
const UNDEFINED_TABLE = "42P01";
const UNDEFINED_COLUMN = "42703";

export function isMissingTable(e) {
  return e?.code === UNDEFINED_TABLE;
}

export function isSchemaOutOfDate(e) {
  return e?.code === UNDEFINED_TABLE || e?.code === UNDEFINED_COLUMN;
}

/**
 * Runs a handler body, answering a missing table with a 503 that says what to
 * do about it.
 *
 * Without this the query throws, Next answers 500 with no body of ours, and a
 * client that cannot read a message has nothing to show — which is how a
 * deployment missing a migration looked exactly like an account with no saved
 * words. Anything else rethrows: an unexpected failure should stay a 500.
 */
export async function withSchemaGuard(run) {
  try {
    return await run();
  } catch (e) {
    if (!isSchemaOutOfDate(e)) throw e;
    console.error("schema out of date", e);
    return Response.json({
      error: "This deployment's database is missing something the app needs — run db/schema.sql against it.",
      schemaOutOfDate: true,
    }, { status: 503 });
  }
}
