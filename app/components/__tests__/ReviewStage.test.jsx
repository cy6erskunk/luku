// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import ReviewStage from "../ReviewStage.jsx";

afterEach(cleanup);

const WORD = { id: 1, word: "juosta", base: "juosta", translations: ["to run", "run"], pos: "verb", interval_days: 3, ease_factor: "2.5" };
const WORD_NO_BASE = { id: 2, word: "koira", base: "koira", translations: ["dog"], pos: "noun", interval_days: 0, ease_factor: "2.5" };

function setup(props = {}) {
  const defaults = {
    queue: [1], revIdx: 0, showAnswer: false, setShowAnswer: vi.fn(),
    grading: false, dbWords: [WORD], loadingWords: false,
    onGrade: vi.fn(), onScanAnother: vi.fn(),
  };
  render(<ReviewStage {...defaults} {...props} />);
  return { ...defaults, ...props };
}

describe("ReviewStage – loading", () => {
  it("shows a loading indicator", () => {
    setup({ loadingWords: true });
    expect(screen.getByText("Loading…")).toBeTruthy();
  });

  it("does not show the word card while loading", () => {
    setup({ loadingWords: true });
    expect(screen.queryByText("juosta")).toBeNull();
  });
});

describe("ReviewStage – empty queue", () => {
  it("shows the all-caught-up message", () => {
    setup({ queue: [], dbWords: [WORD] });
    expect(screen.getByText(/all caught up/i)).toBeTruthy();
  });

  it("shows vocabulary word count", () => {
    setup({ queue: [], dbWords: [WORD, WORD_NO_BASE] });
    expect(screen.getByText(/2 words/)).toBeTruthy();
  });

  it("uses singular for one word", () => {
    setup({ queue: [], dbWords: [WORD] });
    expect(screen.getByText(/1 word in your vocabulary/)).toBeTruthy();
  });

  it("calls onScanAnother when Back to Scan is clicked", () => {
    const onScanAnother = vi.fn();
    setup({ queue: [], onScanAnother });
    fireEvent.click(screen.getByRole("button", { name: /back to scan/i }));
    expect(onScanAnother).toHaveBeenCalled();
  });
});

describe("ReviewStage – session complete", () => {
  it("shows the session-complete screen when revIdx >= queue.length", () => {
    setup({ queue: [1], revIdx: 1, dbWords: [WORD] });
    expect(screen.getByText(/session complete/i)).toBeTruthy();
  });

  it("shows the correct reviewed card count", () => {
    setup({ queue: [1, 2], revIdx: 2, dbWords: [WORD, WORD_NO_BASE] });
    expect(screen.getByText("2")).toBeTruthy();
  });

  it("uses singular 'card' for one card", () => {
    setup({ queue: [1], revIdx: 1, dbWords: [WORD] });
    const el = screen.getByText((_, node) => node.nodeName === "P" && /1\s*card(?!s)/i.test(node?.textContent ?? ""));
    expect(el).toBeTruthy();
  });

  it("calls onScanAnother when Scan Another Page is clicked", () => {
    const onScanAnother = vi.fn();
    setup({ queue: [1], revIdx: 1, onScanAnother });
    fireEvent.click(screen.getByRole("button", { name: /scan another page/i }));
    expect(onScanAnother).toHaveBeenCalled();
  });
});

describe("ReviewStage – card in progress", () => {
  it("renders the current word", () => {
    setup();
    expect(screen.getByText("juosta")).toBeTruthy();
  });

  it("shows progress counter", () => {
    setup({ queue: [1, 2], revIdx: 0, dbWords: [WORD, WORD_NO_BASE] });
    expect(screen.getByText("1 / 2")).toBeTruthy();
  });

  it("does not show base form when it matches the word (case-insensitive)", () => {
    setup({ queue: [2], dbWords: [WORD_NO_BASE] });
    const matches = screen.queryAllByText(/koira/);
    expect(matches.length).toBe(1);
  });

  it("shows Show answer button before answer is revealed", () => {
    setup();
    expect(screen.getByRole("button", { name: /show answer/i })).toBeTruthy();
  });

  it("calls setShowAnswer(true) when Show answer is clicked", () => {
    const setShowAnswer = vi.fn();
    setup({ setShowAnswer });
    fireEvent.click(screen.getByRole("button", { name: /show answer/i }));
    expect(setShowAnswer).toHaveBeenCalledWith(true);
  });

  it("shows grade buttons after answer is revealed", () => {
    setup({ showAnswer: true });
    expect(screen.getByRole("button", { name: /again/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /hard/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /easy/i })).toBeTruthy();
  });

  it("shows translations when answer is revealed", () => {
    setup({ showAnswer: true });
    expect(screen.getByText("to run")).toBeTruthy();
  });

  it("shows part of speech when answer is revealed", () => {
    setup({ showAnswer: true });
    expect(screen.getByText("verb")).toBeTruthy();
  });

  it("calls onGrade(1) when Again is clicked", () => {
    const onGrade = vi.fn();
    setup({ showAnswer: true, onGrade });
    fireEvent.click(screen.getByRole("button", { name: /again/i }));
    expect(onGrade).toHaveBeenCalledWith(1);
  });

  it("calls onGrade(3) when Hard is clicked", () => {
    const onGrade = vi.fn();
    setup({ showAnswer: true, onGrade });
    fireEvent.click(screen.getByRole("button", { name: /hard/i }));
    expect(onGrade).toHaveBeenCalledWith(3);
  });

  it("calls onGrade(5) when Easy is clicked", () => {
    const onGrade = vi.fn();
    setup({ showAnswer: true, onGrade });
    fireEvent.click(screen.getByRole("button", { name: /easy/i }));
    expect(onGrade).toHaveBeenCalledWith(5);
  });

  it("disables grade buttons while grading", () => {
    setup({ showAnswer: true, grading: true });
    expect(screen.getByRole("button", { name: /again/i }).disabled).toBe(true);
    expect(screen.getByRole("button", { name: /easy/i }).disabled).toBe(true);
  });

  it("shows SRS stats when answer is revealed and interval > 0", () => {
    setup({ showAnswer: true });
    expect(screen.getByText(/last interval: 3d/)).toBeTruthy();
  });

  it("hides SRS stats when interval is 0", () => {
    setup({ showAnswer: true, queue: [2], dbWords: [WORD_NO_BASE] });
    expect(screen.queryByText(/last interval/)).toBeNull();
  });

  it("returns null when the queued word is missing from dbWords", () => {
    const { container } = render(
      <ReviewStage queue={[99]} revIdx={0} showAnswer={false} setShowAnswer={vi.fn()}
        grading={false} dbWords={[]} loadingWords={false} onGrade={vi.fn()} onScanAnother={vi.fn()} />
    );
    expect(container.firstChild).toBeNull();
  });
});
