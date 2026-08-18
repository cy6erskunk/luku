import { describe, it, expect } from "vitest";
import {
  CODE_TTL_MINUTES,
  consumeLinkCode,
  createLink,
  createLinkCode,
  deleteLinkByTelegramId,
  deleteLinkByUserId,
  generateCode,
  getLinkByTelegramId,
  getLinkByUserId,
  isValidReminderHour,
  isValidTimezone,
  isWellFormedCode,
  sha256,
  timingSafeEqualHex,
  updateLinkSettings,
} from "../link.js";
import { fakeSql } from "@/lib/__tests__/helpers/fakeSql.js";

describe("sha256", () => {
  it("is deterministic and hex encoded", () => {
    expect(sha256("abc")).toBe(sha256("abc"));
    expect(sha256("abc")).toMatch(/^[0-9a-f]{64}$/);
  });

  it("differs for different inputs", () => {
    expect(sha256("abc")).not.toBe(sha256("abd"));
  });
});

describe("timingSafeEqualHex", () => {
  it("matches identical digests", () => {
    expect(timingSafeEqualHex(sha256("x"), sha256("x"))).toBe(true);
  });

  it("rejects different digests, different lengths and non-strings", () => {
    expect(timingSafeEqualHex(sha256("x"), sha256("y"))).toBe(false);
    expect(timingSafeEqualHex("abcd", "abcdef")).toBe(false);
    expect(timingSafeEqualHex(null, "abcd")).toBe(false);
    expect(timingSafeEqualHex("zz", "zz")).toBe(false);
  });
});

describe("generateCode", () => {
  it("only uses characters Telegram allows in a start payload", () => {
    for (let i = 0; i < 50; i++) {
      const code = generateCode();
      expect(code).toMatch(/^[A-Za-z0-9_-]+$/);
      expect(code).not.toContain("=");
    }
  });

  it("stays within the 64 character deep-link limit", () => {
    expect(generateCode().length).toBe(43);
  });

  it("does not repeat", () => {
    const codes = new Set(Array.from({ length: 100 }, generateCode));
    expect(codes.size).toBe(100);
  });
});

describe("isWellFormedCode", () => {
  it("accepts a generated code", () => {
    expect(isWellFormedCode(generateCode())).toBe(true);
  });

  it("rejects empty, oversized, non-string and out-of-alphabet codes", () => {
    expect(isWellFormedCode("")).toBe(false);
    expect(isWellFormedCode("a".repeat(65))).toBe(false);
    expect(isWellFormedCode(null)).toBe(false);
    expect(isWellFormedCode("has space")).toBe(false);
    expect(isWellFormedCode("semi;colon")).toBe(false);
  });
});

describe("createLinkCode", () => {
  it("replaces any earlier unused code in one statement", async () => {
    const sql = fakeSql([[]]);
    await createLinkCode(sql, "u1");

    // A delete-then-insert pair would let two concurrent mints both delete
    // before either inserted, leaving two redeemable deep links.
    expect(sql.calls).toHaveLength(1);
    expect(sql.calls[0].text).toContain("INSERT INTO telegram_link_codes");
    expect(sql.calls[0].text).toContain("ON CONFLICT (user_id) WHERE used_at IS NULL");
    expect(sql.calls[0].text).toContain("DO UPDATE");
  });

  it("stores only the hash, never the plaintext code", async () => {
    const sql = fakeSql([[]]);
    const code = await createLinkCode(sql, "u1");

    const [codeHash, userId, ttl] = sql.calls[0].values;
    expect(codeHash).toBe(sha256(code));
    expect(codeHash).not.toBe(code);
    expect(userId).toBe("u1");
    expect(ttl).toBe(CODE_TTL_MINUTES);
  });
});

describe("consumeLinkCode", () => {
  it("returns the user id when the claim succeeds", async () => {
    const sql = fakeSql([[{ user_id: "u1" }]]);
    expect(await consumeLinkCode(sql, generateCode())).toBe("u1");
  });

  it("claims in a single statement guarded on unused and unexpired", async () => {
    const sql = fakeSql([[{ user_id: "u1" }]]);
    await consumeLinkCode(sql, generateCode());

    expect(sql.calls).toHaveLength(1);
    expect(sql.calls[0].text).toContain("used_at IS NULL");
    expect(sql.calls[0].text).toContain("expires_at > NOW()");
  });

  it("looks the code up by hash", async () => {
    const sql = fakeSql([[{ user_id: "u1" }]]);
    const code = generateCode();
    await consumeLinkCode(sql, code);
    expect(sql.calls[0].values).toEqual([sha256(code)]);
  });

  it("returns null for an expired or already used code", async () => {
    expect(await consumeLinkCode(fakeSql([[]]), generateCode())).toBeNull();
  });

  it("rejects a malformed code without touching the database", async () => {
    const sql = fakeSql();
    expect(await consumeLinkCode(sql, "not a code")).toBeNull();
    expect(await consumeLinkCode(sql, null)).toBeNull();
    expect(sql.calls).toHaveLength(0);
  });
});

describe("createLink", () => {
  it("upserts on telegram_user_id and stores a secret hash", async () => {
    const sql = fakeSql([[{ telegram_user_id: 42 }]]);
    await createLink(sql, { telegramUserId: 42, userId: "u1", chatId: 42, username: "matti" });

    const [telegramUserId, userId, chatId, username, secretHash] = sql.calls[0].values;
    expect(telegramUserId).toBe(42);
    expect(userId).toBe("u1");
    expect(chatId).toBe(42);
    expect(username).toBe("matti");
    expect(secretHash).toMatch(/^[0-9a-f]{64}$/);
    expect(sql.calls[0].text).toContain("ON CONFLICT (telegram_user_id) DO UPDATE");
  });

  it("tolerates a missing username", async () => {
    const sql = fakeSql([[{}]]);
    await createLink(sql, { telegramUserId: 42, userId: "u1", chatId: 42 });
    expect(sql.calls[0].values[3]).toBeNull();
  });
});

describe("link lookups and deletion", () => {
  it("finds a link by telegram id", async () => {
    const sql = fakeSql([[{ user_id: "u1" }]]);
    expect(await getLinkByTelegramId(sql, 42)).toEqual({ user_id: "u1" });
    expect(sql.calls[0].values).toEqual([42]);
  });

  it("returns null when there is no link", async () => {
    expect(await getLinkByTelegramId(fakeSql([[]]), 42)).toBeNull();
    expect(await getLinkByUserId(fakeSql([[]]), "u1")).toBeNull();
  });

  it("reports whether a delete removed anything", async () => {
    expect(await deleteLinkByTelegramId(fakeSql([[{ telegram_user_id: 42 }]]), 42)).toBe(true);
    expect(await deleteLinkByTelegramId(fakeSql([[]]), 42)).toBe(false);
    expect(await deleteLinkByUserId(fakeSql([[{ telegram_user_id: 42 }]]), "u1")).toBe(true);
    expect(await deleteLinkByUserId(fakeSql([[]]), "u1")).toBe(false);
  });
});

describe("updateLinkSettings", () => {
  it("passes null for fields left alone so COALESCE keeps them", async () => {
    const sql = fakeSql([[{}]]);
    await updateLinkSettings(sql, 42, { reminderHour: 21 });

    const [remindersEnabled, reminderHour, timezone] = sql.calls[0].values;
    expect(remindersEnabled).toBeNull();
    expect(reminderHour).toBe(21);
    expect(timezone).toBeNull();
  });

  it("can disable reminders", async () => {
    const sql = fakeSql([[{}]]);
    await updateLinkSettings(sql, 42, { remindersEnabled: false });
    expect(sql.calls[0].values[0]).toBe(false);
  });
});

describe("setting validation", () => {
  it("accepts hours 0 through 23 only", () => {
    expect(isValidReminderHour(0)).toBe(true);
    expect(isValidReminderHour(23)).toBe(true);
    for (const bad of [-1, 24, 9.5, "9", null, NaN]) {
      expect(isValidReminderHour(bad)).toBe(false);
    }
  });

  it("accepts real IANA timezones and rejects nonsense", () => {
    expect(isValidTimezone("Europe/Helsinki")).toBe(true);
    expect(isValidTimezone("UTC")).toBe(true);
    expect(isValidTimezone("Mars/Olympus")).toBe(false);
    expect(isValidTimezone("")).toBe(false);
    expect(isValidTimezone(null)).toBe(false);
  });
});
