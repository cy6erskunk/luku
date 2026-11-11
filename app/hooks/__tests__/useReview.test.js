// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
// Mocked wherever the module graph reaches it: the real package pulls in a
// Next build plugin that Vitest cannot load. app/lib/__tests__/report.test.js
// is where the reporting contract itself is tested.
vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn() }));

import { useReview } from "../useReview.js";

const WORDS = [
  { id: 1, word: "juosta", translations: ["to run"] },
  { id: 2, word: "koira", translations: ["dog"] },
  { id: 3, word: "talo", translations: ["house"] },
];

function makeProps(overrides = {}) {
  return { dbWords: WORDS, applySchedule: vi.fn(), stage: 2, ...overrides };
}

describe("useReview – startReview", () => {
  it("populates queue with due-word ids", () => {
    const { result } = renderHook(() => useReview(makeProps()));
    act(() => result.current.startReview(WORDS));
    expect(result.current.queue).toEqual([1, 2, 3]);
  });

  it("resets revIdx and showAnswer", () => {
    const { result } = renderHook(() => useReview(makeProps()));
    act(() => {
      result.current.startReview(WORDS);
      result.current.setShowAnswer(true);
    });
    act(() => result.current.startReview([WORDS[0]]));
    expect(result.current.revIdx).toBe(0);
    expect(result.current.showAnswer).toBe(false);
  });
});

describe("useReview – gradeWord", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn(() =>
      Promise.resolve({ ok: true, json: () => Promise.resolve({ word: null }) })
    ));
  });
  afterEach(() => vi.unstubAllGlobals());

  it("advances revIdx after grading easy (5)", async () => {
    const { result } = renderHook(() => useReview(makeProps()));
    act(() => result.current.startReview(WORDS));
    await act(() => result.current.gradeWord(5));
    expect(result.current.revIdx).toBe(1);
  });

  it("re-queues the word when grade < 3", async () => {
    const { result } = renderHook(() => useReview(makeProps()));
    act(() => result.current.startReview(WORDS));
    await act(() => result.current.gradeWord(1));
    expect(result.current.queue).toContain(1);
    expect(result.current.queue.length).toBe(4);
  });

  it("does not re-queue the word when grade >= 3", async () => {
    const { result } = renderHook(() => useReview(makeProps()));
    act(() => result.current.startReview(WORDS));
    await act(() => result.current.gradeWord(3));
    expect(result.current.queue.length).toBe(3);
  });

  it("hides answer after grading", async () => {
    const { result } = renderHook(() => useReview(makeProps()));
    act(() => {
      result.current.startReview(WORDS);
      result.current.setShowAnswer(true);
    });
    await act(() => result.current.gradeWord(5));
    expect(result.current.showAnswer).toBe(false);
  });

  it("does not advance revIdx or re-queue when the API call fails", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve({ ok: false, status: 500 })));
    const { result } = renderHook(() => useReview(makeProps()));
    act(() => result.current.startReview(WORDS));
    await act(() => result.current.gradeWord(1));
    expect(result.current.revIdx).toBe(0);
    expect(result.current.queue).toEqual([1, 2, 3]);
  });

  it("tells the caller when a grade the server refused leaves the card where it is", async () => {
    // Standing still is the whole symptom: nothing advances, nothing is saved,
    // and the buttons re-enable as if the tap had been ignored.
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve({ ok: false, status: 500 })));
    const onGradeError = vi.fn();
    const { result } = renderHook(() => useReview(makeProps({ onGradeError })));
    act(() => result.current.startReview(WORDS));
    await act(() => result.current.gradeWord(5));
    expect(onGradeError).toHaveBeenCalledTimes(1);
  });

  it("does not report an error for a grade the server accepted", async () => {
    const onGradeError = vi.fn();
    const { result } = renderHook(() => useReview(makeProps({ onGradeError })));
    act(() => result.current.startReview(WORDS));
    await act(() => result.current.gradeWord(5));
    expect(onGradeError).not.toHaveBeenCalled();
  });

  it("calls applySchedule with the server response", async () => {
    const updated = { ...WORDS[0], interval_days: 3 };
    vi.stubGlobal("fetch", vi.fn(() =>
      Promise.resolve({ ok: true, json: () => Promise.resolve({ word: updated }) })
    ));
    const applySchedule = vi.fn();
    const { result } = renderHook(() => useReview(makeProps({ applySchedule })));
    act(() => result.current.startReview(WORDS));
    await act(() => result.current.gradeWord(5));
    expect(applySchedule).toHaveBeenCalledWith(updated);
  });

  it("drops a missing word from queue and does not advance revIdx", async () => {
    // Use stage:1 so the self-correction effect doesn't race ahead of gradeWord.
    const dbWordsWithout1 = WORDS.filter((w) => w.id !== 1);
    const { result } = renderHook(() => useReview(makeProps({ dbWords: dbWordsWithout1, stage: 1 })));
    act(() => result.current.startReview(WORDS));
    await act(() => result.current.gradeWord(5));
    expect(result.current.queue).toEqual([2, 3]);
    expect(result.current.revIdx).toBe(0);
  });
});

describe("useReview – removeWordFromQueue", () => {
  it("removes all occurrences of the word id", () => {
    const { result } = renderHook(() => useReview(makeProps()));
    act(() => result.current.startReview(WORDS));
    act(() => result.current.removeWordFromQueue(2));
    expect(result.current.queue).toEqual([1, 3]);
  });

  it("adjusts revIdx when a preceding item is removed", () => {
    const { result } = renderHook(() => useReview(makeProps()));
    act(() => {
      result.current.startReview(WORDS);
      result.current.setRevIdx(2); // position on word 3 (index 2)
    });
    act(() => result.current.removeWordFromQueue(1));
    // word 1 was at index 0, before current position → revIdx shifts from 2 to 1
    expect(result.current.queue).toEqual([2, 3]);
    expect(result.current.revIdx).toBe(1);
  });

  it("clears showAnswer when current word is removed", () => {
    const { result } = renderHook(() => useReview(makeProps()));
    act(() => {
      result.current.startReview(WORDS);
      result.current.setShowAnswer(true);
    });
    act(() => result.current.removeWordFromQueue(1));
    expect(result.current.showAnswer).toBe(false);
  });

  it("returns queueIndices and revIdxAdjust for rollback", () => {
    const { result } = renderHook(() => useReview(makeProps()));
    act(() => result.current.startReview(WORDS));
    let ret;
    act(() => { ret = result.current.removeWordFromQueue(1); });
    expect(ret).toMatchObject({ queueIndices: [0], revIdxAdjust: 0 });
  });
});

describe("useReview – restoreWordInQueue", () => {
  it("re-inserts the word at the original positions", () => {
    const { result } = renderHook(() => useReview(makeProps()));
    act(() => result.current.startReview(WORDS));
    let ret;
    act(() => { ret = result.current.removeWordFromQueue(2); });
    act(() => result.current.restoreWordInQueue(2, ret.queueIndices, ret.revIdxAdjust));
    expect(result.current.queue).toEqual([1, 2, 3]);
  });
});

describe("useReview – reset", () => {
  it("clears all state", () => {
    const { result } = renderHook(() => useReview(makeProps()));
    act(() => {
      result.current.startReview(WORDS);
      result.current.setShowAnswer(true);
    });
    act(() => result.current.reset());
    expect(result.current.queue).toEqual([]);
    expect(result.current.revIdx).toBe(0);
    expect(result.current.showAnswer).toBe(false);
    expect(result.current.grading).toBe(false);
  });
});

describe("useReview – grading is reset when starting a new session", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn(() => new Promise(() => {})));
  });
  afterEach(() => vi.unstubAllGlobals());

  const drivenIntoGrading = (result) => {
    // Fire a grade that will never resolve so `grading` sticks at true.
    act(() => result.current.startReview(WORDS));
    act(() => { result.current.gradeWord(5); });
    return result;
  };

  it("startReview clears grading", () => {
    const { result } = renderHook(() => useReview(makeProps()));
    drivenIntoGrading(result);
    expect(result.current.grading).toBe(true);
    act(() => result.current.startReview(WORDS));
    expect(result.current.grading).toBe(false);
  });

  it("startRepeat clears grading", () => {
    const { result } = renderHook(() => useReview(makeProps()));
    drivenIntoGrading(result);
    act(() => result.current.startRepeat(WORDS));
    expect(result.current.grading).toBe(false);
  });

  it("startNewReview clears grading", () => {
    const { result } = renderHook(() => useReview(makeProps()));
    drivenIntoGrading(result);
    act(() => result.current.startNewReview(WORDS));
    expect(result.current.grading).toBe(false);
  });
});

describe("useReview – startNewReview", () => {
  it("populates queue with the given word ids and marks isNewReview", () => {
    const { result } = renderHook(() => useReview(makeProps()));
    act(() => result.current.startNewReview(WORDS));
    expect(result.current.queue).toEqual([1, 2, 3]);
    expect(result.current.isNewReview).toBe(true);
    expect(result.current.isRepeat).toBe(false);
    expect(result.current.mode).toBe("new");
  });

  it("resets revIdx and showAnswer", () => {
    const { result } = renderHook(() => useReview(makeProps()));
    act(() => {
      result.current.startNewReview(WORDS);
      result.current.setShowAnswer(true);
    });
    act(() => result.current.startNewReview([WORDS[0]]));
    expect(result.current.revIdx).toBe(0);
    expect(result.current.showAnswer).toBe(false);
  });

  it("switching from new to due review flips flags", () => {
    const { result } = renderHook(() => useReview(makeProps()));
    act(() => result.current.startNewReview(WORDS));
    act(() => result.current.startReview(WORDS));
    expect(result.current.isNewReview).toBe(false);
    expect(result.current.mode).toBe("due");
  });
});

describe("useReview – gradeWord in new-review mode", () => {
  it("advances without calling the SRS API", async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve({ ok: true, json: () => Promise.resolve({ word: null }) })
    );
    vi.stubGlobal("fetch", fetchMock);
    const { result } = renderHook(() => useReview(makeProps()));
    act(() => result.current.startNewReview(WORDS));
    await act(() => result.current.gradeWord(5));
    expect(result.current.revIdx).toBe(1);
    expect(fetchMock).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it("never re-queues, regardless of grade", async () => {
    const { result } = renderHook(() => useReview(makeProps()));
    act(() => result.current.startNewReview(WORDS));
    await act(() => result.current.gradeWord(1));
    expect(result.current.queue.length).toBe(3);
  });

  it("hides the answer after keeping a word", async () => {
    const { result } = renderHook(() => useReview(makeProps()));
    act(() => {
      result.current.startNewReview(WORDS);
      result.current.setShowAnswer(true);
    });
    await act(() => result.current.gradeWord(5));
    expect(result.current.showAnswer).toBe(false);
  });
});

describe("useReview – a persisted Again in new-review mode", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("writes the grade, merges the reply and moves on without requeueing", async () => {
    const reply = { id: 1, review_count: 0, interval_days: 0, ease_factor: 1.96, lapses: 1 };
    const fetchMock = vi.fn(() =>
      Promise.resolve({ ok: true, json: () => Promise.resolve({ word: reply }) })
    );
    vi.stubGlobal("fetch", fetchMock);
    const props = makeProps();
    const { result } = renderHook(() => useReview(props));
    act(() => result.current.startNewReview(WORDS));

    let landed;
    await act(async () => { landed = await result.current.gradeWord(1, { persist: true }); });

    expect(landed).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ wordId: 1, grade: 1 });
    expect(props.applySchedule).toHaveBeenCalledWith(reply);
    expect(result.current.revIdx).toBe(1);
    // The schedule brings it back in the due queue; the triage pass does not.
    expect(result.current.queue).toEqual([1, 2, 3]);
  });

  it("keeps the card and reports when the grade does not land", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve({ ok: false, status: 500 })));
    const onGradeError = vi.fn();
    const props = makeProps({ onGradeError });
    const { result } = renderHook(() => useReview(props));
    act(() => result.current.startNewReview(WORDS));

    let landed;
    await act(async () => { landed = await result.current.gradeWord(1, { persist: true }); });

    expect(landed).toBe(false);
    expect(onGradeError).toHaveBeenCalled();
    expect(props.applySchedule).not.toHaveBeenCalled();
    expect(result.current.revIdx).toBe(0);
    expect(result.current.grading).toBe(false);
  });
});

describe("useReview – self-correction effect", () => {
  it("drops the current word from queue when it disappears from dbWords", () => {
    const { result, rerender } = renderHook(
      ({ words }) => useReview(makeProps({ dbWords: words })),
      { initialProps: { words: WORDS } }
    );
    act(() => result.current.startReview(WORDS));
    // remove word 1 from dbWords to trigger the effect
    rerender({ words: WORDS.filter((w) => w.id !== 1) });
    expect(result.current.queue).not.toContain(1);
  });

  it("does nothing when stage is not 2", () => {
    const { result, rerender } = renderHook(
      ({ words }) => useReview(makeProps({ dbWords: words, stage: 1 })),
      { initialProps: { words: WORDS } }
    );
    act(() => result.current.startReview(WORDS));
    rerender({ words: WORDS.filter((w) => w.id !== 1) });
    expect(result.current.queue).toContain(1);
  });
});

describe("useReview – reverse practice", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("is its own mode", () => {
    const { result } = renderHook(() => useReview(makeProps()));
    act(() => result.current.startReverse(WORDS));
    expect(result.current.isReverse).toBe(true);
    expect(result.current.isRepeat).toBe(false);
    expect(result.current.queue).toEqual([1, 2, 3]);
  });

  it("writes no schedule, whatever the answer", async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve({ ok: true, json: () => Promise.resolve({ word: null }) })
    );
    vi.stubGlobal("fetch", fetchMock);
    const applySchedule = vi.fn();
    const { result } = renderHook(() => useReview(makeProps({ applySchedule })));
    act(() => result.current.startReverse(WORDS));
    await act(() => result.current.gradeWord(5));
    await act(() => result.current.gradeWord(1));
    expect(fetchMock).not.toHaveBeenCalled();
    expect(applySchedule).not.toHaveBeenCalled();
    expect(result.current.revIdx).toBe(2);
  });

  it("brings a missed card round again in the same pass", async () => {
    const { result } = renderHook(() => useReview(makeProps()));
    act(() => result.current.startReverse(WORDS));
    await act(() => result.current.gradeWord(1));
    expect(result.current.queue).toEqual([1, 2, 3, 1]);
  });

  it("is left by starting a regular review", () => {
    const { result } = renderHook(() => useReview(makeProps()));
    act(() => result.current.startReverse(WORDS));
    act(() => result.current.startReview(WORDS));
    expect(result.current.isReverse).toBe(false);
  });
});

describe("useReview – grading a card that moved on elsewhere", () => {
  afterEach(() => vi.unstubAllGlobals());

  const SHOWN = "2026-11-08T09:00:00.000Z";
  const DUE = [
    { id: 1, base: "juosta", next_review_at: SHOWN },
    { id: 2, base: "koira", next_review_at: "2026-11-08T09:05:00.000Z" },
  ];
  const ok = (word) => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ word }) });

  it("sends the schedule the pass showed, not the live row's", async () => {
    // The live row differs from what the pass started with, as after a
    // background refresh brought in a grade made on the bot.
    const fetchMock = vi.fn(() => ok(null));
    vi.stubGlobal("fetch", fetchMock);
    const props = makeProps({ dbWords: DUE });
    const { result, rerender } = renderHook((p) => useReview(p), { initialProps: props });
    act(() => result.current.startReview(DUE));
    const refreshed = [{ ...DUE[0], next_review_at: "2026-11-14T09:00:00.000Z" }, DUE[1]];
    rerender({ ...props, dbWords: refreshed });

    await act(() => result.current.gradeWord(5));
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ wordId: 1, grade: 5, expectedNextReviewAt: SHOWN });
  });

  it("guards a card failed in this pass on the schedule that failure set", async () => {
    const AFTER_AGAIN = "2026-11-08T10:10:00.000Z";
    const fetchMock = vi.fn()
      .mockImplementationOnce(() => ok({ id: 1, next_review_at: AFTER_AGAIN, interval_days: 0, review_count: 0 }))
      .mockImplementation(() => ok(null));
    vi.stubGlobal("fetch", fetchMock);
    const { result } = renderHook(() => useReview(makeProps({ dbWords: DUE })));
    act(() => result.current.startReview(DUE));

    await act(() => result.current.gradeWord(1)); // juosta: Again, requeued
    await act(() => result.current.gradeWord(5)); // koira
    await act(() => result.current.gradeWord(5)); // juosta again
    expect(JSON.parse(fetchMock.mock.calls[2][1].body)).toEqual({ wordId: 1, grade: 5, expectedNextReviewAt: AFTER_AGAIN });
  });

  it("on a 409, takes the current schedule, moves on without requeueing, and says so", async () => {
    const current = { id: 1, next_review_at: "2026-11-14T09:00:00.000Z", interval_days: 6, review_count: 2 };
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve({
      ok: false, status: 409, json: () => Promise.resolve({ error: "Already graded", word: current }),
    })));
    const onGradeStale = vi.fn();
    const onGradeError = vi.fn();
    const props = makeProps({ dbWords: DUE, onGradeStale, onGradeError });
    const { result } = renderHook(() => useReview(props));
    act(() => result.current.startReview(DUE));

    let landed;
    // Again, so a requeue would show: the refused answer must not bring it back.
    await act(async () => { landed = await result.current.gradeWord(1); });
    expect(landed).toBe(true);
    expect(props.applySchedule).toHaveBeenCalledWith(current);
    expect(result.current.revIdx).toBe(1);
    expect(result.current.queue).toEqual([1, 2]);
    expect(onGradeStale).toHaveBeenCalledTimes(1);
    expect(onGradeError).not.toHaveBeenCalled();
  });
});
