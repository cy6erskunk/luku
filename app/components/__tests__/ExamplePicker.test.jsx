// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import ReviewStage from "../ReviewStage.jsx";

afterEach(cleanup);

const WORD = { id: 1, base: "toipua", translations: ["to recover"], pos: "verb", example: "Hän toipuu.", example_translation: "He recovers.", interval_days: 3, ease_factor: "2.5" };
const NEXT = { id: 2, base: "koira", translations: ["dog"], pos: "noun", interval_days: 0, ease_factor: "2.5" };
const S1 = { example: "Isä toipuu flunssasta sohvalla.", example_translation: "Dad is recovering from the flu on the sofa." };
const S2 = { example: "Kissa toipuu leikkauksesta.", example_translation: "The cat is recovering from surgery." };

function setup(props = {}) {
  const all = {
    queue: [1, 2], revIdx: 0, showAnswer: true, setShowAnswer: vi.fn(),
    grading: false, dbWords: [WORD, NEXT], loadingWords: false,
    onGrade: vi.fn(), onScanAnother: vi.fn(),
    onSuggestExample: vi.fn().mockResolvedValueOnce(S1).mockResolvedValueOnce(S2),
    onAcceptExample: vi.fn().mockResolvedValue(undefined),
    ...props,
  };
  const view = render(<ReviewStage {...all} />);
  return { ...all, rerender: (p) => view.rerender(<ReviewStage {...all} {...p} />) };
}

const openPicker = () => fireEvent.click(screen.getByRole("button", { name: /suggest a different example/i }));

describe("ReviewStage – example suggestions", () => {
  it("offers no button on the question side", () => {
    setup({ showAnswer: false });
    expect(screen.queryByRole("button", { name: /suggest/i })).toBeNull();
  });

  it("offers no button without a way to ask (no API key)", () => {
    setup({ onSuggestExample: undefined });
    expect(screen.queryByRole("button", { name: /suggest/i })).toBeNull();
  });

  it("offers one for a word without an example", () => {
    setup({ queue: [2] });
    expect(screen.getByRole("button", { name: /suggest an example/i })).toBeTruthy();
  });

  it("shows the suggestion and its translation", async () => {
    const { onSuggestExample } = setup();
    openPicker();

    expect(await screen.findByText(S1.example)).toBeTruthy();
    expect(screen.getByText(S1.example_translation)).toBeTruthy();
    expect(onSuggestExample).toHaveBeenCalledWith(WORD, ["Hän toipuu."]);
  });

  it("asks for another, avoiding everything already shown", async () => {
    const { onSuggestExample } = setup();
    openPicker();
    await screen.findByText(S1.example);

    fireEvent.click(screen.getByRole("button", { name: /another/i }));
    expect(await screen.findByText(S2.example)).toBeTruthy();
    expect(onSuggestExample).toHaveBeenLastCalledWith(WORD, ["Hän toipuu.", S1.example]);
  });

  it("stores the accepted example and closes", async () => {
    const { onAcceptExample } = setup();
    openPicker();
    await screen.findByText(S1.example);

    fireEvent.click(screen.getByRole("button", { name: /accept/i }));
    await waitFor(() => expect(screen.queryByRole("group", { name: /suggested example/i })).toBeNull());
    expect(onAcceptExample).toHaveBeenCalledWith(1, S1);
  });

  it("closes on reject without storing anything", async () => {
    const { onAcceptExample } = setup();
    openPicker();
    await screen.findByText(S1.example);

    fireEvent.click(screen.getByRole("button", { name: /reject/i }));
    expect(screen.queryByRole("group", { name: /suggested example/i })).toBeNull();
    expect(onAcceptExample).not.toHaveBeenCalled();
  });

  it("says so inside the popup when the save is refused, and stays open", async () => {
    setup({ onAcceptExample: vi.fn().mockRejectedValue(new Error("500")) });
    openPicker();
    await screen.findByText(S1.example);

    fireEvent.click(screen.getByRole("button", { name: /accept/i }));
    expect((await screen.findByRole("alert")).textContent).toMatch(/couldn't save/i);
    expect(screen.getByText(S1.example)).toBeTruthy();
  });

  it("says so when no example came back", async () => {
    setup({ onSuggestExample: vi.fn().mockRejectedValue(new Error("boom")) });
    openPicker();
    expect((await screen.findByRole("alert")).textContent).toMatch(/couldn't get/i);
    expect(screen.getByRole("button", { name: /accept/i }).disabled).toBe(true);
  });

  it("closes when the card moves on", async () => {
    const { rerender } = setup();
    openPicker();
    await screen.findByText(S1.example);

    rerender({ revIdx: 1 });
    expect(screen.queryByRole("group", { name: /suggested example/i })).toBeNull();
  });
});

describe("ReviewStage – example suggestions on a card that comes round again", () => {
  it("does not reopen the popup by itself", async () => {
    const { rerender } = setup({ queue: [1, 1] });
    openPicker();
    await screen.findByText(S1.example);

    rerender({ queue: [1, 1], revIdx: 1 });
    expect(screen.queryByRole("group", { name: /suggested example/i })).toBeNull();
  });
});

describe("ReviewStage – leaving a card with the popup open", () => {
  it("does not reopen it when the word lands on the same position in the next pass", async () => {
    // A preexisting word skipped in the new-words pass is still due, so the
    // review that follows can put it back at index 0.
    const onRemoveNew = vi.fn();
    const { rerender } = setup({ isNewReview: true, preexistingNewIds: new Set([1]), onRemoveNew });
    openPicker();
    await screen.findByText(S1.example);

    fireEvent.click(screen.getByRole("button", { name: /skip/i }));
    expect(onRemoveNew).toHaveBeenCalledWith(1);
    rerender({ isNewReview: true, preexistingNewIds: new Set([1]), showAnswer: false });
    rerender({ isNewReview: false, revIdx: 0, showAnswer: true });

    expect(screen.queryByRole("group", { name: /suggested example/i })).toBeNull();
  });

  it("lets the reader grade while an accepted example is saving", async () => {
    // A grade's reply only touches the schedule, so it cannot undo the save
    // whichever answers first; there is nothing to hold the reader for.
    const onAcceptExample = vi.fn(() => new Promise(() => {}));
    const onGrade = vi.fn();
    setup({ onAcceptExample, onGrade });
    openPicker();
    await screen.findByText(S1.example);

    fireEvent.click(screen.getByRole("button", { name: /accept/i }));
    const easy = screen.getByRole("button", { name: /easy/i });
    expect(easy.disabled).toBe(false);
    fireEvent.click(easy);
    expect(onGrade).toHaveBeenCalledWith(5);
  });

  it("still holds Remove while an accepted example is saving", async () => {
    const onAcceptExample = vi.fn(() => new Promise(() => {}));
    setup({ onAcceptExample, isNewReview: true, onRemoveNew: vi.fn(), onKeepNew: vi.fn() });
    openPicker();
    await screen.findByText(S1.example);

    fireEvent.click(screen.getByRole("button", { name: /accept/i }));
    await waitFor(() => expect(screen.getByRole("button", { name: /remove/i }).disabled).toBe(true));
  });
});

describe("ReviewStage – the popup during a save", () => {
  const pendingSave = () => {
    let fail;
    const onAcceptExample = vi.fn(() => new Promise((_resolve, reject) => { fail = reject; }));
    return { onAcceptExample, fail: () => fail(new Error("500")) };
  };

  it("ignores Escape, so a refused save is still told", async () => {
    const save = pendingSave();
    setup({ onAcceptExample: save.onAcceptExample });
    openPicker();
    await screen.findByText(S1.example);

    const accept = screen.getByRole("button", { name: /accept/i });
    fireEvent.click(accept);
    fireEvent.keyDown(accept, { key: "Escape" });
    expect(screen.getByRole("group", { name: /suggested example/i })).toBeTruthy();

    save.fail();
    expect((await screen.findByRole("alert")).textContent).toMatch(/couldn't save/i);
  });

  it("still closes on Escape when nothing is saving", async () => {
    setup();
    openPicker();
    await screen.findByText(S1.example);

    fireEvent.keyDown(screen.getByRole("button", { name: /reject/i }), { key: "Escape" });
    expect(screen.queryByRole("group", { name: /suggested example/i })).toBeNull();
  });

  it("disables the trigger until the save settles", async () => {
    const save = pendingSave();
    setup({ onAcceptExample: save.onAcceptExample });
    openPicker();
    await screen.findByText(S1.example);

    fireEvent.click(screen.getByRole("button", { name: /accept/i }));
    expect(screen.getByRole("button", { name: /suggest a different example/i }).disabled).toBe(true);

    save.fail();
    await waitFor(() => expect(screen.getByRole("button", { name: /suggest a different example/i }).disabled).toBe(false));
  });
});

describe("ReviewStage – a pass restarted from outside the card", () => {
  it("does not reopen the popup on the same card", async () => {
    // The header's "N new" chip restarts the pass without touching the card's
    // buttons: same position, same word, answer hidden then shown again.
    const { rerender, onSuggestExample } = setup();
    openPicker();
    await screen.findByText(S1.example);

    rerender({ showAnswer: false });
    rerender({ showAnswer: true });

    expect(screen.queryByRole("group", { name: /suggested example/i })).toBeNull();
    expect(onSuggestExample).toHaveBeenCalledTimes(1);
  });
});

describe("ReviewStage – a save that fails after the popup is gone", () => {
  const pendingSave = () => {
    let fail;
    const onAcceptExample = vi.fn(() => new Promise((_resolve, reject) => { fail = reject; }));
    return { onAcceptExample, fail: () => fail(new Error("500")) };
  };

  it("hands the failure on when the pass was restarted mid-save", async () => {
    const save = pendingSave();
    const onExampleSaveLost = vi.fn();
    const { rerender } = setup({ onAcceptExample: save.onAcceptExample, onExampleSaveLost });
    openPicker();
    await screen.findByText(S1.example);

    fireEvent.click(screen.getByRole("button", { name: /accept/i }));
    rerender({ onAcceptExample: save.onAcceptExample, onExampleSaveLost, showAnswer: false });
    save.fail();

    await waitFor(() => expect(onExampleSaveLost).toHaveBeenCalledTimes(1));
  });

  it("hands the failure on when the whole review stage unmounted mid-save", async () => {
    const save = pendingSave();
    const onExampleSaveLost = vi.fn();
    setup({ onAcceptExample: save.onAcceptExample, onExampleSaveLost });
    openPicker();
    await screen.findByText(S1.example);

    fireEvent.click(screen.getByRole("button", { name: /accept/i }));
    cleanup();
    save.fail();

    await waitFor(() => expect(onExampleSaveLost).toHaveBeenCalledTimes(1));
  });

  it("tells it in the popup instead while the popup is still open", async () => {
    const save = pendingSave();
    const onExampleSaveLost = vi.fn();
    setup({ onAcceptExample: save.onAcceptExample, onExampleSaveLost });
    openPicker();
    await screen.findByText(S1.example);

    fireEvent.click(screen.getByRole("button", { name: /accept/i }));
    save.fail();

    expect((await screen.findByRole("alert")).textContent).toMatch(/couldn't save/i);
    expect(onExampleSaveLost).not.toHaveBeenCalled();
  });
});

describe("ReviewStage – the trigger during a grade", () => {
  it("stays available: a grade's reply cannot overwrite an example", () => {
    setup({ grading: true });
    expect(screen.getByRole("button", { name: /suggest a different example/i }).disabled).toBe(false);
  });
});

describe("ReviewStage – the opening request under Strict Mode", () => {
  it("is sent once, not once per probe mount", async () => {
    const { StrictMode } = await import("react");
    const onSuggestExample = vi.fn().mockResolvedValue(S1);
    render(
      <StrictMode>
        <ReviewStage
          queue={[1]} revIdx={0} showAnswer setShowAnswer={vi.fn()} grading={false}
          dbWords={[WORD]} loadingWords={false} onGrade={vi.fn()} onScanAnother={vi.fn()}
          onSuggestExample={onSuggestExample} onAcceptExample={vi.fn()}
        />
      </StrictMode>,
    );
    openPicker();

    expect(await screen.findByText(S1.example)).toBeTruthy();
    expect(onSuggestExample).toHaveBeenCalledTimes(1);
  });
});

describe("ReviewStage – focus after the popup closes", () => {
  const trigger = () => screen.getByRole("button", { name: /suggest a different example/i });

  it("returns to the trigger after Reject", async () => {
    setup();
    openPicker();
    await screen.findByText(S1.example);

    const reject = screen.getByRole("button", { name: /reject/i });
    reject.focus();
    fireEvent.click(reject);

    await waitFor(() => expect(document.activeElement).toBe(trigger()));
  });

  it("returns to the trigger after Escape", async () => {
    setup();
    openPicker();
    await screen.findByText(S1.example);

    const another = screen.getByRole("button", { name: /another/i });
    another.focus();
    fireEvent.keyDown(another, { key: "Escape" });

    await waitFor(() => expect(document.activeElement).toBe(trigger()));
  });

  it("returns to the trigger after an accepted save, once it is enabled again", async () => {
    setup();
    openPicker();
    await screen.findByText(S1.example);

    const accept = screen.getByRole("button", { name: /accept/i });
    accept.focus();
    fireEvent.click(accept);

    await waitFor(() => expect(screen.queryByRole("group", { name: /suggested example/i })).toBeNull());
    expect(trigger().disabled).toBe(false);
    // Moved in an effect after the closing render, which may flush a tick later.
    await waitFor(() => expect(document.activeElement).toBe(trigger()));
  });
});

describe("ReviewStage – Escape is scoped to the popup", () => {
  it("closes it from the trigger that opened it", async () => {
    setup();
    openPicker();
    await screen.findByText(S1.example);

    fireEvent.keyDown(screen.getByRole("button", { name: /suggest a different example/i }), { key: "Escape" });
    expect(screen.queryByRole("group", { name: /suggested example/i })).toBeNull();
  });

  it("leaves it open for an Escape meant for something else", async () => {
    setup();
    openPicker();
    await screen.findByText(S1.example);

    // The header menu listens on the document; its Escape must not close this too.
    fireEvent.keyDown(document.body, { key: "Escape" });
    expect(screen.getByRole("group", { name: /suggested example/i })).toBeTruthy();
  });
});

describe("ReviewStage – suggestions already shown survive a reopen", () => {
  it("still avoids a rejected suggestion after closing and reopening", async () => {
    const { onSuggestExample } = setup();
    openPicker();
    await screen.findByText(S1.example);

    fireEvent.click(screen.getByRole("button", { name: /reject/i }));
    openPicker();
    await screen.findByText(S2.example);

    expect(onSuggestExample).toHaveBeenLastCalledWith(WORD, ["Hän toipuu.", S1.example]);
  });

  it("keeps each word's list to itself", async () => {
    const onSuggestExample = vi.fn().mockResolvedValueOnce(S1).mockResolvedValueOnce(S2);
    const { rerender } = setup({ onSuggestExample });
    openPicker();
    await screen.findByText(S1.example);

    rerender({ onSuggestExample, revIdx: 1 });
    fireEvent.click(screen.getByRole("button", { name: /suggest an example/i }));
    await screen.findByText(S2.example);

    expect(onSuggestExample).toHaveBeenLastCalledWith(NEXT, []);
  });
});
