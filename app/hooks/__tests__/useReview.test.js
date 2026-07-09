// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useReview } from "../useReview.js";

const WORDS = [
  { id: 1, word: "juosta", translations: ["to run"] },
  { id: 2, word: "koira", translations: ["dog"] },
  { id: 3, word: "talo", translations: ["house"] },
];

function makeProps(overrides = {}) {
  return { dbWords: WORDS, updateWord: vi.fn(), stage: 2, ...overrides };
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

  it("calls updateWord with the server response", async () => {
    const updated = { ...WORDS[0], interval_days: 3 };
    vi.stubGlobal("fetch", vi.fn(() =>
      Promise.resolve({ ok: true, json: () => Promise.resolve({ word: updated }) })
    ));
    const updateWord = vi.fn();
    const { result } = renderHook(() => useReview(makeProps({ updateWord })));
    act(() => result.current.startReview(WORDS));
    await act(() => result.current.gradeWord(5));
    expect(updateWord).toHaveBeenCalledWith(updated);
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

describe("useReview – self-correction effect", () => {
  it("drops the current word from queue when it disappears from dbWords", () => {
    let dbWords = WORDS;
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
