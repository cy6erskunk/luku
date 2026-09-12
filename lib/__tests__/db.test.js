import { describe, it, expect, vi, afterEach } from "vitest";
import { isMissingTable, isSchemaOutOfDate, withSchemaGuard } from "../db.js";

/** What the Neon driver throws for a query naming a table that isn't there:
 *  an Error carrying Postgres' SQLSTATE on `code`. */
function undefinedTable(relation = "word_bundles") {
  const e = new Error(`relation "${relation}" does not exist`);
  e.code = "42P01";
  return e;
}

/** The same, for a column a migration added later. This is the likelier shape:
 *  `forms`, `example` and `example_translation` all arrived as appended
 *  ALTER TABLE statements, so an older database has the table and not them. */
function undefinedColumn(column = "example_translation") {
  const e = new Error(`column "${column}" of relation "words" does not exist`);
  e.code = "42703";
  return e;
}

afterEach(() => vi.restoreAllMocks());

describe("isSchemaOutOfDate", () => {
  it("recognises a missing column as well as a missing table", () => {
    expect(isSchemaOutOfDate(undefinedTable())).toBe(true);
    expect(isSchemaOutOfDate(undefinedColumn())).toBe(true);
  });

  it("does not claim an ordinary failure", () => {
    const e = new Error("duplicate key"); e.code = "23505";
    expect(isSchemaOutOfDate(e)).toBe(false);
    expect(isSchemaOutOfDate(new Error("boom"))).toBe(false);
  });
});

describe("isMissingTable", () => {
  it("recognises Postgres' undefined_table", () => {
    expect(isMissingTable(undefinedTable())).toBe(true);
  });

  it("does not claim any other failure", () => {
    const unique = new Error("duplicate key");
    unique.code = "23505";
    expect(isMissingTable(unique)).toBe(false);
    expect(isMissingTable(new Error("network"))).toBe(false);
    expect(isMissingTable(null)).toBe(false);
    expect(isMissingTable(undefined)).toBe(false);
  });
});

describe("withSchemaGuard", () => {
  it("answers a column added by a later migration, not only a missing table", async () => {
    // The case that actually bites: GET reads the columns an old database has
    // and succeeds, POST names one it does not and fails — so the reader sees
    // their list and cannot add to it, told only "Failed to save word (42703)".
    const res = await withSchemaGuard(() => { throw undefinedColumn(); });
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.schemaOutOfDate).toBe(true);
    expect(body.error).toContain("db/schema.sql");
  });

  it("passes a successful answer straight through", async () => {
    const res = await withSchemaGuard(async () => Response.json({ ok: true }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it("answers a missing table with a 503 naming the file to run", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await withSchemaGuard(async () => { throw undefinedTable(); });
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.schemaOutOfDate).toBe(true);
    // The point of the message: an operator reading it knows the fix.
    expect(body.error).toMatch(/db\/schema\.sql/);
  });

  it("logs the underlying error rather than only reporting it", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    await withSchemaGuard(async () => { throw undefinedTable(); });
    expect(spy).toHaveBeenCalled();
  });

  it("rethrows anything else, so a real bug stays a 500", async () => {
    const boom = new Error("connection reset");
    await expect(withSchemaGuard(async () => { throw boom; })).rejects.toThrow("connection reset");
  });
});
