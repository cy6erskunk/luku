import { neon } from "@neondatabase/serverless";

export function getDb() {
  return neon(process.env.DATABASE_URL);
}

/**
 * Postgres' undefined_table. Every table these routes name is one
 * `db/schema.sql` creates, so a query that hits this is not a bug in the query
 * — it is a database the schema file has not been re-run against since the
 * last migration was appended to it. Nothing deploys the schema automatically,
 * so a fresh preview pointed at an older database is a normal way to get here.
 */
const UNDEFINED_TABLE = "42P01";

export function isMissingTable(e) {
  return e?.code === UNDEFINED_TABLE;
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
    if (!isMissingTable(e)) throw e;
    console.error("schema out of date", e);
    return Response.json({
      error: "This deployment's database is missing a table the app needs — run db/schema.sql against it.",
      schemaOutOfDate: true,
    }, { status: 503 });
  }
}
