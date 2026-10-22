import { describe, it, expect } from "vitest";
import { recordUsage } from "../usage.js";
import { fakeSql } from "./helpers/fakeSql.js";

describe("recordUsage", () => {
  it("writes the four token counts as Anthropic reports them", async () => {
    const sql = fakeSql();
    await recordUsage(sql, {
      userId: "u1",
      kind: "example",
      model: "claude-sonnet-4-6",
      usage: { input_tokens: 10, output_tokens: 20, cache_creation_input_tokens: 30, cache_read_input_tokens: 40 },
    });
    expect(sql.calls[0].values).toEqual(["u1", "example", "claude-sonnet-4-6", 10, 20, 30, 40]);
  });

  it("stores a kind outside the known list as other", async () => {
    const sql = fakeSql();
    await recordUsage(sql, { userId: "u1", kind: "'; DROP TABLE words; --", model: "m", usage: {} });
    expect(sql.calls[0].values[1]).toBe("other");
  });

  it("stores other when no kind is given", async () => {
    const sql = fakeSql();
    await recordUsage(sql, { userId: "u1", model: "m", usage: { input_tokens: 1, output_tokens: 1 } });
    expect(sql.calls[0].values[1]).toBe("other");
  });

  it("counts a missing or malformed usage block as zero rather than failing", async () => {
    const sql = fakeSql();
    await recordUsage(sql, { userId: "u1", kind: "ocr", model: "m", usage: { input_tokens: "12", output_tokens: -3 } });
    expect(sql.calls[0].values.slice(3)).toEqual([0, 0, 0, 0]);

    await recordUsage(sql, { userId: "u1", kind: "ocr", model: "m", usage: undefined });
    expect(sql.calls[1].values.slice(3)).toEqual([0, 0, 0, 0]);
  });
});
