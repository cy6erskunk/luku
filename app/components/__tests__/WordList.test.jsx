// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import WordList from "../WordList.jsx";

afterEach(cleanup);

const WORDS = [
  { id: 1, word: "juoksin", base: "juosta", pos: "verb", translations: ["I ran", "ran"] },
  { id: 2, word: "koira", base: "koira", pos: "noun", translations: ["dog"] },
  { id: 3, word: "nopea", base: "nopea", pos: "adjective", translations: ["fast", "quick", "rapid"] },
];

const setup = (props = {}) => {
  const onClose = props.onClose ?? vi.fn();
  const onDelete = props.onDelete ?? vi.fn();
  const words = props.words ?? WORDS;
  render(<WordList words={words} onClose={onClose} onDelete={onDelete} />);
  return { onClose, onDelete };
};

describe("WordList", () => {
  it("renders a row for each word", () => {
    setup();
    expect(screen.getByText("juoksin")).toBeTruthy();
    expect(screen.getByText("koira")).toBeTruthy();
    expect(screen.getByText("nopea")).toBeTruthy();
  });

  it("shows base form when it differs from the word", () => {
    setup();
    expect(screen.getByText("juosta")).toBeTruthy();
  });

  it("does not show base form when it matches the word (case-insensitive)", () => {
    setup();
    // koira base === koira — should not appear twice
    const matches = screen.getAllByText("koira");
    expect(matches).toHaveLength(1);
  });

  it("shows part of speech for each word", () => {
    setup();
    expect(screen.getByText("verb")).toBeTruthy();
    expect(screen.getByText("noun")).toBeTruthy();
    expect(screen.getByText("adjective")).toBeTruthy();
  });

  it("shows up to two translations", () => {
    setup();
    // nopea has 3 translations; only first two should appear
    expect(screen.getByText("fast, quick")).toBeTruthy();
    expect(screen.queryByText(/rapid/)).toBeNull();
  });

  it("shows a Delete button for each word", () => {
    setup();
    expect(screen.getAllByRole("button", { name: /^delete$/i })).toHaveLength(WORDS.length);
  });

  it("calls onClose when the close button is clicked", () => {
    const { onClose } = setup();
    fireEvent.click(screen.getByRole("button", { name: /close/i }));
    expect(onClose).toHaveBeenCalled();
  });

  it("calls onClose when the backdrop is clicked", () => {
    const { onClose } = setup();
    fireEvent.click(screen.getByTestId("wordlist-backdrop"));
    expect(onClose).toHaveBeenCalled();
  });

  it("does not call onClose when the panel itself is clicked", () => {
    const { onClose } = setup();
    fireEvent.click(screen.getByText(/vocabulary \(\d+\)/i));
    expect(onClose).not.toHaveBeenCalled();
  });

  it("shows empty state when words list is empty", () => {
    setup({ words: [] });
    expect(screen.getByText(/no words saved yet/i)).toBeTruthy();
  });

  it("shows correct count in heading", () => {
    setup();
    expect(screen.getByText(`Vocabulary (${WORDS.length})`)).toBeTruthy();
  });

  it("shows count of 0 in heading for empty list", () => {
    setup({ words: [] });
    expect(screen.getByText("Vocabulary (0)")).toBeTruthy();
  });

  describe("delete confirmation", () => {
    it("does not call onDelete immediately when Delete is clicked", () => {
      const { onDelete } = setup();
      fireEvent.click(screen.getAllByRole("button", { name: /^delete$/i })[0]);
      expect(onDelete).not.toHaveBeenCalled();
    });

    it("shows Sure? and Cancel buttons after Delete is clicked", () => {
      setup();
      fireEvent.click(screen.getAllByRole("button", { name: /^delete$/i })[0]);
      expect(screen.getByRole("button", { name: /sure\?/i })).toBeTruthy();
      expect(screen.getByRole("button", { name: /cancel/i })).toBeTruthy();
    });

    it("hides the Delete button for the pending row while confirming", () => {
      setup();
      const deleteButtons = screen.getAllByRole("button", { name: /^delete$/i });
      fireEvent.click(deleteButtons[0]);
      expect(screen.getAllByRole("button", { name: /^delete$/i })).toHaveLength(WORDS.length - 1);
    });

    it("calls onDelete with the correct id when Sure? is confirmed", () => {
      const { onDelete } = setup();
      fireEvent.click(screen.getAllByRole("button", { name: /^delete$/i })[1]);
      fireEvent.click(screen.getByRole("button", { name: /sure\?/i }));
      expect(onDelete).toHaveBeenCalledWith(WORDS[1].id);
    });

    it("cancels and restores Delete button when Cancel is clicked", () => {
      setup();
      fireEvent.click(screen.getAllByRole("button", { name: /^delete$/i })[0]);
      fireEvent.click(screen.getByRole("button", { name: /cancel/i }));
      expect(screen.queryByRole("button", { name: /sure\?/i })).toBeNull();
      expect(screen.getAllByRole("button", { name: /^delete$/i })).toHaveLength(WORDS.length);
    });

    it("cancels pending delete when clicking elsewhere on the panel", () => {
      setup();
      fireEvent.click(screen.getAllByRole("button", { name: /^delete$/i })[0]);
      fireEvent.click(screen.getByText(/vocabulary \(\d+\)/i));
      expect(screen.queryByRole("button", { name: /sure\?/i })).toBeNull();
    });

    it("only one row shows confirmation at a time", () => {
      setup();
      const deleteButtons = screen.getAllByRole("button", { name: /^delete$/i });
      fireEvent.click(deleteButtons[0]);
      // clicking a second Delete while one is pending switches to the new row
      fireEvent.click(screen.getAllByRole("button", { name: /^delete$/i })[0]);
      expect(screen.getAllByRole("button", { name: /sure\?/i })).toHaveLength(1);
    });
  });
});
