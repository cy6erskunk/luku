import { describe, it, expect, vi, afterEach } from "vitest";
import { isMissingTable, withSchemaGuard } from "../db.js";

/** What the Neon driver throws for a query naming a table that isn't there:
 *  an Error carrying Postgres' SQLSTATE on `code`. */
function undefinedTable(relation = "word_bundles") {
  const e = new Error(`relation "${relation}" does not exist`);
  e.code = "42P01";
  return e;
}

afterEach(() => vi.restoreAllMocks());

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
