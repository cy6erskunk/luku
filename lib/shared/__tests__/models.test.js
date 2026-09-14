import { describe, it, expect } from "vitest";
import {
  MODELS,
  TASKS,
  DEFAULT_MODEL,
  DEFAULT_MODELS,
  THINKING_MIN_TOKENS,
  anthropicRequest,
  isModelId,
  isTaskId,
  modelLabel,
  resolveModel,
  resolveModels,
} from "../models.js";

const THINKING = MODELS.find((m) => m.thinks).id;
const PLAIN = MODELS.find((m) => !m.thinks).id;

describe("the catalogue", () => {
  it("offers a choice for both tasks", () => {
    expect(TASKS.map((t) => t.id).sort()).toEqual(["ocr", "translate"]);
    expect(MODELS.length).toBeGreaterThan(1);
  });

  it("defaults every task to a model it actually lists", () => {
    expect(isModelId(DEFAULT_MODEL)).toBe(true);
    for (const task of TASKS) expect(isModelId(DEFAULT_MODELS[task.id])).toBe(true);
  });

  it("has no duplicate ids", () => {
    expect(new Set(MODELS.map((m) => m.id)).size).toBe(MODELS.length);
  });

  it("recognises its own ids and nothing else", () => {
    expect(isModelId(DEFAULT_MODEL)).toBe(true);
    expect(isModelId("claude-not-a-model")).toBe(false);
    expect(isModelId(undefined)).toBe(false);
    expect(isTaskId("ocr")).toBe(true);
    expect(isTaskId("__proto__")).toBe(false);
  });

  it("labels a known model, and falls back to the id for an unknown one", () => {
    expect(modelLabel(PLAIN)).toBe(MODELS.find((m) => m.id === PLAIN).label);
    expect(modelLabel("claude-retired")).toBe("claude-retired");
  });
});

describe("resolveModel", () => {
  it("keeps a listed model", () => {
    expect(resolveModel(THINKING)).toBe(THINKING);
  });

  it("falls back rather than passing an unknown id to Anthropic", () => {
    // The ids arriving here are saved browser preferences: retiring a model
    // must not brick every browser still holding its name.
    expect(resolveModel("claude-retired")).toBe(DEFAULT_MODEL);
    expect(resolveModel(undefined)).toBe(DEFAULT_MODEL);
    expect(resolveModel({ id: THINKING })).toBe(DEFAULT_MODEL);
  });
});

describe("resolveModels", () => {
  it("keeps each task's own choice", () => {
    expect(resolveModels({ ocr: THINKING, translate: PLAIN })).toEqual({ ocr: THINKING, translate: PLAIN });
  });

  it("drops only the task whose model is gone", () => {
    expect(resolveModels({ ocr: "claude-retired", translate: THINKING }))
      .toEqual({ ocr: DEFAULT_MODELS.ocr, translate: THINKING });
  });

  it("survives nothing stored at all", () => {
    expect(resolveModels(null)).toEqual({ ...DEFAULT_MODELS });
    expect(resolveModels("nonsense")).toEqual({ ...DEFAULT_MODELS });
  });

  it("ignores keys that are not tasks", () => {
    expect(resolveModels({ ocr: THINKING, admin: PLAIN })).toEqual({ ...DEFAULT_MODELS, ocr: THINKING });
  });
});

describe("anthropicRequest", () => {
  it("names the chosen model and honours the caller's token budget", () => {
    expect(anthropicRequest(PLAIN, 400)).toEqual({ model: PLAIN, max_tokens: 400 });
  });

  it("sends no effort setting for a model that does not think", () => {
    // Haiku rejects output_config outright, so this is a 400 if it leaks.
    expect(anthropicRequest(PLAIN, 1500).output_config).toBeUndefined();
  });

  it("gives a thinking model low effort and room to think", () => {
    const body = anthropicRequest(THINKING, 400);
    expect(body.model).toBe(THINKING);
    expect(body.output_config).toEqual({ effort: "low" });
    // Thinking is charged against max_tokens, so a 400-token ceiling could be
    // spent entirely on reasoning and return nothing to parse.
    expect(body.max_tokens).toBe(THINKING_MIN_TOKENS);
  });

  it("never lowers a budget that is already generous", () => {
    expect(anthropicRequest(THINKING, THINKING_MIN_TOKENS * 2).max_tokens).toBe(THINKING_MIN_TOKENS * 2);
  });

  it("falls back to the default model for an unknown id", () => {
    expect(anthropicRequest("claude-retired", 1500).model).toBe(DEFAULT_MODEL);
  });
});
