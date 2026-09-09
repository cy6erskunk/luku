import { describe, it, expect } from "vitest";
import { fakeSql } from "./helpers/fakeSql.js";
import {
  MAX_BUNDLE_ID,
  MAX_BUNDLE_NAME,
  addWordToBundle,
  createBundle,
  deleteBundle,
  getBundle,
  isValidBundleId,
  listBundles,
  normalizeBundleName,
  removeWordFromBundle,
  wordBundleIds,
} from "../bundles.js";

describe("isValidBundleId", () => {
  it("accepts a positive int4", () => {
    expect(isValidBundleId(1)).toBe(true);
    expect(isValidBundleId(MAX_BUNDLE_ID)).toBe(true);
  });

  it("rejects anything Postgres would error on rather than simply not match", () => {
    for (const id of [0, -1, 1.5, MAX_BUNDLE_ID + 1, "3", null, undefined, NaN]) {
      expect(isValidBundleId(id)).toBe(false);
    }
  });
});

describe("normalizeBundleName", () => {
  it("trims and collapses internal whitespace", () => {
    expect(normalizeBundleName("  Luku   3 ")).toBe("Luku 3");
    expect(normalizeBundleName("Kotimaa\n\tuutiset")).toBe("Kotimaa uutiset");
  });

  it("rejects an empty or whitespace-only name", () => {
    for (const name of ["", "   ", "\n"]) expect(normalizeBundleName(name)).toBeNull();
  });

  it("rejects a non-string", () => {
    for (const name of [null, undefined, 5, {}, ["a"]]) expect(normalizeBundleName(name)).toBeNull();
  });

  it("rejects a name past the length cap, measured after trimming", () => {
    expect(normalizeBundleName("x".repeat(MAX_BUNDLE_NAME))).toBe("x".repeat(MAX_BUNDLE_NAME));
    expect(normalizeBundleName("x".repeat(MAX_BUNDLE_NAME + 1))).toBeNull();
    expect(normalizeBundleName(` ${"x".repeat(MAX_BUNDLE_NAME)} `)).toBe("x".repeat(MAX_BUNDLE_NAME));
  });
});

describe("listBundles", () => {
  it("scopes by user", async () => {
    const sql = fakeSql([[{ id: 1, name: "Kotimaa" }]]);
    expect(await listBundles(sql, "u1")).toEqual([{ id: 1, name: "Kotimaa" }]);
    expect(sql.calls[0].values).toEqual(["u1"]);
  });
});

describe("getBundle", () => {
  it("returns null for a bundle that is not this user's", async () => {
    const sql = fakeSql([[]]);
    expect(await getBundle(sql, "u1", 9)).toBeNull();
    expect(sql.calls[0].values).toEqual([9, "u1"]);
  });
});

describe("createBundle", () => {
  it("returns the row, new or already there", async () => {
    const sql = fakeSql([[{ id: 4, name: "Kotimaa" }]]);
    expect(await createBundle(sql, "u1", "Kotimaa")).toEqual({ id: 4, name: "Kotimaa" });
    expect(sql.calls[0].values).toEqual(["u1", "Kotimaa"]);
  });

  it("upserts on the case-insensitive name, keeping the stored spelling", async () => {
    // A second "kotimaa" must resolve to the existing "Kotimaa" rather than
    // creating a twin or renaming it — this is the one statement that decides
    // both, since the HTTP driver has no transaction to wrap a check in.
    const sql = fakeSql([[{ id: 4, name: "Kotimaa" }]]);
    await createBundle(sql, "u1", "kotimaa");
    expect(sql.calls[0].text).toContain("ON CONFLICT (user_id, lower(name)) DO UPDATE SET name = bundles.name");
  });
});

describe("deleteBundle", () => {
  it("scopes the delete by user and reports what it removed", async () => {
    const sql = fakeSql([[{ id: 4 }]]);
    expect(await deleteBundle(sql, "u1", 4)).toEqual({ id: 4 });
    expect(sql.calls[0].values).toEqual([4, "u1"]);
  });

  it("returns null when the bundle is not this user's", async () => {
    expect(await deleteBundle(fakeSql([[]]), "u1", 4)).toBeNull();
  });
});

describe("wordBundleIds", () => {
  it("returns just the ids", async () => {
    const sql = fakeSql([[{ bundle_id: 2 }, { bundle_id: 5 }]]);
    expect(await wordBundleIds(sql, "u1", 7)).toEqual([2, 5]);
  });

  it("is empty for a word with no bundles", async () => {
    expect(await wordBundleIds(fakeSql([[]]), "u1", 7)).toEqual([]);
  });
});

describe("addWordToBundle", () => {
  it("checks both owners in the same statement as the write", async () => {
    const sql = fakeSql([[{ bundle_id: 2 }]]);
    expect(await addWordToBundle(sql, "u1", 7, 2)).toBe(true);
    // Both sides scoped to the caller: a forged bundle id must not be able to
    // attach someone else's word, and there is no transaction to check first.
    expect(sql.calls[0].values).toEqual([7, 2, "u1", "u1"]);
  });

  it("still reports success for a word already in the bundle", async () => {
    // DO NOTHING would return no row here and be indistinguishable from
    // "not yours"; the no-op DO UPDATE is what keeps them apart.
    const sql = fakeSql([[{ bundle_id: 2 }]]);
    expect(sql.calls).toHaveLength(0);
    expect(await addWordToBundle(sql, "u1", 7, 2)).toBe(true);
    expect(sql.calls[0].text).toContain("DO UPDATE SET added_at = word_bundles.added_at");
  });

  it("reports failure when neither row is the caller's", async () => {
    expect(await addWordToBundle(fakeSql([[]]), "u1", 7, 2)).toBe(false);
  });
});

describe("removeWordFromBundle", () => {
  it("removes only a membership of this user's own word", async () => {
    const sql = fakeSql([[{ bundle_id: 2 }]]);
    expect(await removeWordFromBundle(sql, "u1", 7, 2)).toBe(true);
    // Both sides scoped to the caller, as the insert does.
    expect(sql.calls[0].values).toEqual([7, 2, "u1", "u1"]);
    expect(sql.calls[0].text).toContain("b.user_id =");
  });

  it("reports false when there was no such membership", async () => {
    expect(await removeWordFromBundle(fakeSql([[]]), "u1", 7, 2)).toBe(false);
  });
});
