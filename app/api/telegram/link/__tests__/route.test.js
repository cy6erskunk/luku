import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { fakeSql } from "@/lib/__tests__/helpers/fakeSql.js";
import { sha256 } from "@/lib/telegram/link";

const mocks = vi.hoisted(() => ({ session: null, sql: null }));

vi.mock("@/lib/auth/server", () => ({
  getAuth: () => ({ getSession: () => Promise.resolve({ data: mocks.session }) }),
}));
vi.mock("@/lib/db", () => ({ getDb: () => mocks.sql }));

const { GET, POST, DELETE } = await import("../route.js");

const LINK = {
  telegram_user_id: 7,
  user_id: "u1",
  username: "matti",
  reminders_enabled: true,
  reminder_hour: 9,
  timezone: "Europe/Helsinki",
};

beforeEach(() => {
  mocks.session = { user: { id: "u1" } };
  mocks.sql = fakeSql();
  vi.stubEnv("TELEGRAM_BOT_USERNAME", "LukuTestBot");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("GET /api/telegram/link", () => {
  it("returns 401 when signed out", async () => {
    mocks.session = null;
    expect((await GET()).status).toBe(401);
  });

  it("reports an unlinked account", async () => {
    mocks.sql = fakeSql([[]]);
    expect(await (await GET()).json()).toEqual({ linked: false, configured: true });
  });

  it("reports the link and its reminder settings", async () => {
    mocks.sql = fakeSql([[LINK]]);
    expect(await (await GET()).json()).toEqual({
      linked: true,
      configured: true,
      username: "matti",
      remindersEnabled: true,
      reminderHour: 9,
      timezone: "Europe/Helsinki",
    });
  });

  it("reports an unconfigured deployment so the panel can say so", async () => {
    vi.stubEnv("TELEGRAM_BOT_USERNAME", "");
    mocks.sql = fakeSql([[]]);
    expect(await (await GET()).json()).toEqual({ linked: false, configured: false });
  });

  it("scopes the lookup to the signed-in user", async () => {
    mocks.sql = fakeSql([[]]);
    await GET();
    expect(mocks.sql.calls[0].values).toEqual(["u1"]);
  });
});

describe("POST /api/telegram/link", () => {
  it("returns 401 when signed out", async () => {
    mocks.session = null;
    expect((await POST()).status).toBe(401);
  });

  it("returns 503 when no bot is configured", async () => {
    vi.stubEnv("TELEGRAM_BOT_USERNAME", "");
    const res = await POST();
    expect(res.status).toBe(503);
  });

  it("refuses to mint a second code for an already linked account", async () => {
    mocks.sql = fakeSql([[LINK]]);
    const res = await POST();
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe("Already connected");
  });

  it("returns a deep link carrying the code", async () => {
    mocks.sql = fakeSql([[], [], []]);
    const json = await (await POST()).json();

    expect(json.url).toBe(`https://t.me/LukuTestBot?start=${json.code}`);
    expect(json.code).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it("stores only the hash of the returned code", async () => {
    mocks.sql = fakeSql([[], [], []]);
    const { code } = await (await POST()).json();

    const insert = mocks.sql.calls.find((c) => c.text.includes("INSERT INTO telegram_link_codes"));
    expect(insert.values[0]).toBe(sha256(code));
    expect(insert.values).not.toContain(code);
  });

  it("tolerates a bot username written with a leading @", async () => {
    vi.stubEnv("TELEGRAM_BOT_USERNAME", "@LukuTestBot");
    mocks.sql = fakeSql([[], [], []]);
    const { url } = await (await POST()).json();
    expect(url).toContain("https://t.me/LukuTestBot?start=");
  });
});

describe("DELETE /api/telegram/link", () => {
  it("returns 401 when signed out", async () => {
    mocks.session = null;
    expect((await DELETE()).status).toBe(401);
  });

  it("returns 404 when there was nothing linked", async () => {
    mocks.sql = fakeSql([[]]);
    expect((await DELETE()).status).toBe(404);
  });

  it("removes the link for the signed-in user only", async () => {
    mocks.sql = fakeSql([[{ telegram_user_id: 7 }]]);
    const res = await DELETE();

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(mocks.sql.calls[0].values).toEqual(["u1"]);
  });
});
