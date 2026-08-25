import { describe, it, expect, vi, beforeEach } from "vitest";
import { fakeSql } from "@/lib/__tests__/helpers/fakeSql.js";

const mocks = vi.hoisted(() => ({ session: null, sql: null }));

vi.mock("@/lib/auth/server", () => ({
  getAuth: () => ({ getSession: () => Promise.resolve({ data: mocks.session }) }),
}));
vi.mock("@/lib/db", () => ({ getDb: () => mocks.sql }));

const { POST } = await import("../route.js");

const makeRequest = (body) => ({ json: () => Promise.resolve(body) });

// next_review_at is NOT NULL in the schema, and the guarded update compares
// against it, so a fixture without one is not a row this route can see.
const CARD = {
  id: 7,
  user_id: "u1",
  base: "juosta",
  ease_factor: 2.5,
  interval_days: 6,
  review_count: 2,
  next_review_at: new Date("2026-08-13T06:00:00.123456Z"),
};

describe("POST /api/reviews", () => {
  beforeEach(() => {
    mocks.session = { user: { id: "u1" } };
    mocks.sql = fakeSql();
  });

  it("returns 401 when signed out", async () => {
    mocks.session = null;
    const res = await POST(makeRequest({ wordId: 7, grade: 5 }));
    expect(res.status).toBe(401);
    expect((await res.json()).error).toBe("Unauthorized");
  });

  it("rejects a non-numeric grade instead of writing NaN", async () => {
    const res = await POST(makeRequest({ wordId: 7, grade: "x" }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("Invalid grade");
    expect(mocks.sql.calls).toHaveLength(0);
  });

  it("rejects an out-of-range grade", async () => {
    const res = await POST(makeRequest({ wordId: 7, grade: 100 }));
    expect(res.status).toBe(400);
    expect(mocks.sql.calls).toHaveLength(0);
  });

  it("rejects a missing or malformed wordId", async () => {
    for (const wordId of [undefined, "7", 1.5, -2]) {
      mocks.sql = fakeSql();
      const res = await POST(makeRequest({ wordId, grade: 5 }));
      expect(res.status).toBe(400);
      expect((await res.json()).error).toBe("Invalid wordId");
    }
  });

  it("returns 404 when the word belongs to someone else", async () => {
    mocks.sql = fakeSql([[]]);
    const res = await POST(makeRequest({ wordId: 7, grade: 5 }));
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe("Not found");
  });

  it("grades the card and returns the updated row", async () => {
    const updated = { ...CARD, interval_days: 15, review_count: 3 };
    mocks.sql = fakeSql([[CARD], [updated]]);

    const res = await POST(makeRequest({ wordId: 7, grade: 5 }));
    expect(res.status).toBe(200);
    // Compared after a JSON round-trip: timestamps reach the client as strings.
    expect((await res.json()).word).toEqual(JSON.parse(JSON.stringify(updated)));
  });

  it("scopes both queries to the signed-in user", async () => {
    mocks.sql = fakeSql([[CARD], [CARD]]);
    await POST(makeRequest({ wordId: 7, grade: 3 }));

    expect(mocks.sql.calls[0].values).toEqual([7, "u1"]);
    expect(mocks.sql.calls[1].values).toContain("u1");
  });
});
