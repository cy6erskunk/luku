// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import ReviewStage from "../ReviewStage.jsx";

afterEach(cleanup);

const WORD = { id: 1, base: "juosta", translations: ["to run", "run"], pos: "verb", interval_days: 3, ease_factor: "2.5" };
const WORD_NO_BASE = { id: 2, base: "koira", translations: ["dog"], pos: "noun", interval_days: 0, ease_factor: "2.5" };

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

  it("shows only the base form on the card front", () => {
    setup({ queue: [2], dbWords: [WORD_NO_BASE] });
    const matches = screen.queryAllByText(/koira/);
    expect(matches.length).toBe(1);
  });

  it("shows the base form as the card front for an inflected word", () => {
    const inflected = { ...WORD, id: 3, base: "juosta", forms: [{ word: "juoksin", translation: "I ran" }] };
    setup({ queue: [3], dbWords: [inflected] });
    expect(screen.getByText("juosta")).toBeTruthy();
    expect(screen.queryByText(/juoksin/)).toBeNull();
  });

  it("shows scanned forms with their translations after the answer is revealed", () => {
    const inflected = { ...WORD, id: 3, base: "juosta", forms: [{ word: "juoksin", translation: "I ran" }] };
    setup({ queue: [3], dbWords: [inflected], showAnswer: true });
    expect(screen.getByText(/seen in text/i)).toBeTruthy();
    expect(screen.getByText("juoksin")).toBeTruthy();
    expect(screen.getByText(/I ran/)).toBeTruthy();
  });

  it("hides the seen-in-text block when no inflections are recorded", () => {
    setup({ queue: [2], dbWords: [WORD_NO_BASE], showAnswer: true });
    expect(screen.queryByText(/seen in text/i)).toBeNull();
  });

  it("shows the Finnish example sentence on the card front before answer is revealed", () => {
    const withExample = { ...WORD, example: "Minä juoksen.", example_translation: "I run." };
    setup({ dbWords: [withExample], showAnswer: false });
    expect(screen.getByText("Minä juoksen.")).toBeTruthy();
    expect(screen.queryByText("I run.")).toBeNull();
  });

  it("shows the example translation on the answer side after reveal", () => {
    const withExample = { ...WORD, example: "Minä juoksen.", example_translation: "I run." };
    setup({ dbWords: [withExample], showAnswer: true });
    expect(screen.getByText("Minä juoksen.")).toBeTruthy();
    expect(screen.getByText("I run.")).toBeTruthy();
  });

  it("hides the example block when no example is recorded", () => {
    setup({ showAnswer: false });
    expect(screen.queryByText(/Minä/)).toBeNull();
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

describe("ReviewStage – new-review mode", () => {
  it("shows the New words heading", () => {
    setup({ isNewReview: true });
    // Both the step label and the mode heading contain "New words".
    expect(screen.getAllByText(/new words/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/keep or remove/i)).toBeTruthy();
  });

  it("shows Keep and Remove buttons after reveal", () => {
    setup({ isNewReview: true, showAnswer: true });
    expect(screen.getByRole("button", { name: /keep/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /remove/i })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /again/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /hard/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /easy/i })).toBeNull();
  });

  it("calls onKeepNew with the word id when Keep is clicked", () => {
    const onKeepNew = vi.fn();
    const onGrade = vi.fn();
    setup({ isNewReview: true, showAnswer: true, onKeepNew, onGrade });
    fireEvent.click(screen.getByRole("button", { name: /keep/i }));
    expect(onKeepNew).toHaveBeenCalledWith(WORD.id);
    expect(onGrade).not.toHaveBeenCalled();
  });

  it("calls onRemoveNew with the word id when Remove is clicked", () => {
    const onRemoveNew = vi.fn();
    setup({ isNewReview: true, showAnswer: true, onRemoveNew });
    fireEvent.click(screen.getByRole("button", { name: /remove/i }));
    expect(onRemoveNew).toHaveBeenCalledWith(WORD.id);
  });

  it("hides SRS stats block regardless of interval", () => {
    setup({ isNewReview: true, showAnswer: true });
    expect(screen.queryByText(/last interval/)).toBeNull();
  });

  it("session complete offers Continue → Review N due when due words remain", () => {
    const onStartReview = vi.fn();
    setup({
      isNewReview: true,
      queue: [1], revIdx: 1, dbWords: [WORD],
      dueWords: [WORD_NO_BASE],
      onStartReview,
    });
    const btn = screen.getByRole("button", { name: /continue.*review 1 due/i });
    fireEvent.click(btn);
    expect(onStartReview).toHaveBeenCalled();
  });

  it("session complete says 'New words triaged'", () => {
    setup({
      isNewReview: true,
      queue: [1], revIdx: 1, dbWords: [WORD],
    });
    expect(screen.getByText(/new words triaged/i)).toBeTruthy();
  });

  it("session complete hides Continue button when no due words remain", () => {
    setup({
      isNewReview: true,
      queue: [1], revIdx: 1, dbWords: [WORD],
      dueWords: [],
    });
    expect(screen.queryByRole("button", { name: /continue.*review/i })).toBeNull();
  });
});

describe("ReviewStage – new-review mode with preexisting words", () => {
  it("shows the 'in your list' badge when the current card is preexisting", () => {
    setup({
      isNewReview: true,
      preexistingNewIds: new Set([WORD.id]),
    });
    expect(screen.getByText(/in your list/i)).toBeTruthy();
  });

  it("does not show the badge when the current card is not preexisting", () => {
    setup({
      isNewReview: true,
      preexistingNewIds: new Set(),
    });
    expect(screen.queryByText(/in your list/i)).toBeNull();
  });

  it("shows Skip instead of Remove for a preexisting card", () => {
    setup({
      isNewReview: true, showAnswer: true,
      preexistingNewIds: new Set([WORD.id]),
    });
    expect(screen.getByRole("button", { name: /^skip$/i })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /^remove$/i })).toBeNull();
  });

  it("Skip calls onRemoveNew with the word id (parent branches by preexistence)", () => {
    const onRemoveNew = vi.fn();
    setup({
      isNewReview: true, showAnswer: true,
      preexistingNewIds: new Set([WORD.id]),
      onRemoveNew,
    });
    fireEvent.click(screen.getByRole("button", { name: /^skip$/i }));
    expect(onRemoveNew).toHaveBeenCalledWith(WORD.id);
  });

  it("hides the badge in regular due review even if preexistingNewIds includes the id", () => {
    setup({
      isNewReview: false,
      preexistingNewIds: new Set([WORD.id]),
    });
    expect(screen.queryByText(/in your list/i)).toBeNull();
  });
});

describe("ReviewStage – disables Remove/Skip while a delete is in flight", () => {
  it("disables Remove when the current word id is in deletingIds", () => {
    setup({
      isNewReview: true, showAnswer: true,
      deletingIds: new Set([WORD.id]),
    });
    expect(screen.getByRole("button", { name: /remove/i }).disabled).toBe(true);
    expect(screen.getByRole("button", { name: /keep/i }).disabled).toBe(true);
  });

  it("disables Skip for a preexisting card while its delete is in flight", () => {
    setup({
      isNewReview: true, showAnswer: true,
      preexistingNewIds: new Set([WORD.id]),
      deletingIds: new Set([WORD.id]),
    });
    expect(screen.getByRole("button", { name: /skip/i }).disabled).toBe(true);
  });

  it("leaves Remove enabled when a different word's delete is in flight", () => {
    setup({
      isNewReview: true, showAnswer: true,
      deletingIds: new Set([WORD_NO_BASE.id]),
    });
    expect(screen.getByRole("button", { name: /remove/i }).disabled).toBe(false);
  });
});

describe("ReviewStage – session-complete step label", () => {
  it("uses 'Step 3 — New words' on the session-complete screen in new-review mode", () => {
    setup({
      isNewReview: true,
      queue: [1], revIdx: 1, dbWords: [WORD],
    });
    expect(screen.getByText(/step 3 — new words/i)).toBeTruthy();
  });

  it("uses 'Step 3 — Review' on the session-complete screen in due-review mode", () => {
    setup({
      isNewReview: false,
      queue: [1], revIdx: 1, dbWords: [WORD],
    });
    expect(screen.getByText(/step 3 — review/i)).toBeTruthy();
  });
});
