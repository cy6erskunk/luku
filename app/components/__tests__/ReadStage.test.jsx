// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import ReadStage from "../ReadStage.jsx";

afterEach(cleanup);

const WD = (v) => ({ t: "wd", v, k: v.toLowerCase() });
const SP = { t: "sp", v: " " };
const PU = (v) => ({ t: "pu", v });
const BR = { t: "br", v: "\n" };

const BASE_PROPS = {
  tokens: [WD("Koira"), SP, WD("juoksee")],
  session: {},
  savedBases: new Set(),
  xlating: null,
  popup: null,
  ocrSource: "",
  busy: false,
  err: "",
  loadingWords: false,
  dueWords: [],
  onWord: vi.fn(),
  onAddWord: vi.fn(),
  onRescanWithAI: vi.fn(),
  onStartReview: vi.fn(),
  onAddApiKey: vi.fn(),
};

function setup(props = {}) {
  const merged = { ...BASE_PROPS, onWord: vi.fn(), onStartReview: vi.fn(), onRescanWithAI: vi.fn(), ...props };
  render(<ReadStage {...merged} />);
  return merged;
}

describe("ReadStage – token rendering", () => {
  it("renders word tokens", () => {
    setup();
    expect(screen.getByText("Koira")).toBeTruthy();
    expect(screen.getByText("juoksee")).toBeTruthy();
  });

  it("renders punctuation tokens", () => {
    setup({ tokens: [WD("Hei"), PU("!")] });
    expect(screen.getByText("!")).toBeTruthy();
  });

  it("renders line break tokens as <br>", () => {
    const { container } = render(<ReadStage {...BASE_PROPS} tokens={[WD("a"), BR, WD("b")]} />);
    expect(container.querySelectorAll("br").length).toBeGreaterThan(0);
  });
});

describe("ReadStage – word highlight states", () => {
  it("shows a word as unseen by default (no session entry)", () => {
    setup();
    const span = screen.getByText("Koira");
    expect(span.style.color).toBe("rgb(224, 216, 207)");
  });

  it("marks a word as seen when it has a session entry but is not added", () => {
    setup({ session: { koira: { base: "koira", added: false } } });
    const span = screen.getByText("Koira");
    expect(span.style.color).toBe("rgb(142, 186, 146)");
  });

  it("marks a word as added when session entry has added:true", () => {
    setup({ session: { koira: { base: "koira", added: true } } });
    const span = screen.getByText("Koira");
    expect(span.style.color).toBe("rgb(122, 180, 212)");
  });

  it("marks a word as added when its base is in savedBases", () => {
    setup({
      session: { koira: { base: "koira", added: false } },
      savedBases: new Set(["koira"]),
    });
    const span = screen.getByText("Koira");
    expect(span.style.color).toBe("rgb(122, 180, 212)");
  });

  it("marks a word as loading when xlating matches its key", () => {
    setup({ xlating: "koira" });
    const span = screen.getByText("Koira");
    expect(span.style.background).toContain("0.3");
  });
});

describe("ReadStage – stats counters", () => {
  it("shows looked-up count equal to number of session entries", () => {
    setup({ session: { koira: { base: "koira", added: false }, juosta: { base: "juosta", added: false } } });
    expect(screen.getByText("2")).toBeTruthy();
    expect(screen.getByText("looked up")).toBeTruthy();
  });

  it("shows added count equal to session entries with added:true", () => {
    setup({ session: { koira: { base: "koira", added: true }, juosta: { base: "juosta", added: false } } });
    expect(screen.getByText("1")).toBeTruthy();
    expect(screen.getAllByText("added").length).toBeGreaterThanOrEqual(1);
  });
});

describe("ReadStage – OCR source banner", () => {
  it("shows Tesseract banner for local OCR", () => {
    setup({ ocrSource: "local" });
    expect(screen.getByText(/scanned locally with tesseract/i)).toBeTruthy();
  });

  it("shows AI banner for AI OCR", () => {
    setup({ ocrSource: "ai" });
    expect(screen.getByText(/scanned with ai/i)).toBeTruthy();
  });

  it("shows no banner when ocrSource is empty", () => {
    setup({ ocrSource: "" });
    expect(screen.queryByText(/scanned/i)).toBeNull();
  });

  it("calls onRescanWithAI when Re-scan button is clicked", () => {
    const onRescanWithAI = vi.fn();
    setup({ ocrSource: "local", onRescanWithAI });
    fireEvent.click(screen.getByRole("button", { name: /re-scan with ai/i }));
    expect(onRescanWithAI).toHaveBeenCalled();
  });
});

describe("ReadStage – error message", () => {
  it("displays the error string when err is set", () => {
    setup({ err: "OCR failed." });
    expect(screen.getByText(/OCR failed\./)).toBeTruthy();
  });

  it("does not show an error box when err is empty", () => {
    setup({ err: "" });
    expect(screen.queryByText(/⚠/)).toBeNull();
  });
});

describe("ReadStage – Done Reading button", () => {
  it("shows the Done Reading button", () => {
    setup();
    expect(screen.getByRole("button", { name: /done reading/i })).toBeTruthy();
  });

  it("is disabled while words are loading", () => {
    setup({ loadingWords: true });
    expect(screen.getByRole("button", { name: /done reading/i }).disabled).toBe(true);
  });

  it("shows due word count in button text", () => {
    setup({ dueWords: [{ id: 1 }, { id: 2 }] });
    expect(screen.getByRole("button", { name: /\(2 due\)/i })).toBeTruthy();
  });

  it("calls onStartReview when clicked", () => {
    const onStartReview = vi.fn();
    setup({ onStartReview });
    fireEvent.click(screen.getByRole("button", { name: /done reading/i }));
    expect(onStartReview).toHaveBeenCalled();
  });
});

describe("ReadStage – new words review", () => {
  it("does not show a new-words button when there are no new words", () => {
    setup();
    expect(screen.queryByRole("button", { name: /review \d+ new word/i })).toBeNull();
  });

  it("shows a Review N new words button when new words exist", () => {
    setup({ newWords: [{ id: 10 }, { id: 11 }] });
    expect(screen.getByRole("button", { name: /review 2 new words/i })).toBeTruthy();
  });

  it("calls onStartNewReview when the new-words button is clicked", () => {
    const onStartNewReview = vi.fn();
    setup({ newWords: [{ id: 10 }], onStartNewReview });
    fireEvent.click(screen.getByRole("button", { name: /review 1 new word/i }));
    expect(onStartNewReview).toHaveBeenCalled();
  });

  it("shows a Skip to due review button as the secondary action when new words exist", () => {
    setup({ newWords: [{ id: 10 }], dueWords: [{ id: 1 }, { id: 2 }] });
    expect(screen.getByRole("button", { name: /skip to due review \(2 due\)/i })).toBeTruthy();
  });

  it("calls onStartReview when Skip to due review is clicked", () => {
    const onStartReview = vi.fn();
    setup({ newWords: [{ id: 10 }], dueWords: [{ id: 1 }], onStartReview });
    fireEvent.click(screen.getByRole("button", { name: /skip to due review/i }));
    expect(onStartReview).toHaveBeenCalled();
  });

  it("does not show the Skip to due review button when there are no due words", () => {
    setup({ newWords: [{ id: 10 }], dueWords: [] });
    expect(screen.queryByRole("button", { name: /skip to due review/i })).toBeNull();
    // The only "Done Reading" button left is the primary new-words button.
    const doneReading = screen.getAllByRole("button", { name: /done reading/i });
    expect(doneReading).toHaveLength(1);
    expect(doneReading[0].textContent).toMatch(/review 1 new word/i);
  });
});

describe("ReadStage – translating indicator", () => {
  it("shows translating spinner when xlating is set", () => {
    setup({ xlating: "koira" });
    expect(screen.getByText(/translating/i)).toBeTruthy();
  });

  it("hides translating spinner when xlating is null", () => {
    setup({ xlating: null });
    expect(screen.queryByText(/translating/i)).toBeNull();
  });
});

describe("ReadStage – word tap", () => {
  it("calls onWord with the event and token when a word is clicked", () => {
    const onWord = vi.fn();
    setup({ onWord });
    fireEvent.click(screen.getByText("Koira"));
    expect(onWord).toHaveBeenCalledWith(
      expect.any(Object),
      WD("Koira"),
      expect.any(Object),
    );
  });
});
