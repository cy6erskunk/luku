// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import WordList from "../WordList.jsx";

afterEach(cleanup);

const WORDS = [
  { id: 1, base: "juosta", pos: "verb", translations: ["I ran", "ran"], forms: [{ word: "juoksin", translation: "I ran" }] },
  { id: 2, base: "koira", pos: "noun", translations: ["dog"], forms: [] },
  { id: 3, base: "nopea", pos: "adjective", translations: ["fast", "quick", "rapid"], forms: [] },
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
    expect(screen.getByText("juosta")).toBeTruthy();
    expect(screen.getByText("koira")).toBeTruthy();
    expect(screen.getByText("nopea")).toBeTruthy();
  });

  it("shows scanned inflections under the base form", () => {
    setup();
    expect(screen.getByText(/juoksin — I ran/)).toBeTruthy();
  });

  it("renders only the base when no inflections are recorded", () => {
    setup();
    expect(screen.getAllByText("koira")).toHaveLength(1);
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

describe("WordList – bundles", () => {
  const BUNDLES = [
    { id: 10, name: "Kotimaa", wordCount: 2, dueCount: 0 },
    { id: 20, name: "Luku 3", wordCount: 1, dueCount: 0 },
  ];
  const GROUPED = [
    { ...WORDS[0], bundle_ids: [10] },
    { ...WORDS[1], bundle_ids: [10, 20] },
    { ...WORDS[2], bundle_ids: [] },
  ];

  const withBundles = (props = {}) => {
    const handlers = {
      onClose: vi.fn(), onDelete: vi.fn(),
      onAddToBundle: vi.fn(), onRemoveFromBundle: vi.fn(), onDeleteBundle: vi.fn(),
    };
    render(<WordList words={GROUPED} bundles={BUNDLES} {...handlers} {...props} />);
    return handlers;
  };

  it("shows no filter row at all when there are no bundles", () => {
    setup();
    expect(screen.queryByRole("button", { name: /^all \(/i })).toBeNull();
  });

  it("counts each bundle and the words in none of them", () => {
    withBundles();
    expect(screen.getByRole("button", { name: "All (3)" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Kotimaa (2)" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Luku 3 (1)" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Unbundled (1)" })).toBeTruthy();
  });

  it("filters the list down to one bundle", () => {
    withBundles();
    fireEvent.click(screen.getByRole("button", { name: "Luku 3 (1)" }));
    expect(screen.getByText("koira")).toBeTruthy();
    expect(screen.queryByText("juosta")).toBeNull();
    expect(screen.queryByText("nopea")).toBeNull();
  });

  it("filters down to the words in no bundle", () => {
    withBundles();
    fireEvent.click(screen.getByRole("button", { name: "Unbundled (1)" }));
    expect(screen.getByText("nopea")).toBeTruthy();
    expect(screen.queryByText("koira")).toBeNull();
  });

  it("says so rather than looking empty when a bundle has nothing in it", () => {
    // Counts come from the caller, which derives them from this same list, so
    // the fixture has to agree with it the way page.jsx always does.
    const empty = [{ id: 10, name: "Kotimaa", wordCount: 0, dueCount: 0 }];
    render(<WordList words={[{ ...WORDS[0], bundle_ids: [] }]} bundles={empty} onClose={vi.fn()} onDelete={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Kotimaa (0)" }));
    expect(screen.getByText(/no words in this bundle/i)).toBeTruthy();
  });

  it("shows the count its caller derived, without re-deriving it", () => {
    // The counts come from bundleStats, which page.jsx derives from the whole
    // vocabulary — not from the words this overlay happens to hold. Deliberately
    // disagreeing numbers are the only way to see which source won.
    withBundles({ bundles: [{ id: 10, name: "Kotimaa", wordCount: 7, dueCount: 0 }] });
    expect(screen.getByRole("button", { name: "Kotimaa (7)" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Kotimaa (2)" })).toBeNull();
  });

  it("removes a word from a bundle it is tagged with", () => {
    const { onRemoveFromBundle } = withBundles();
    fireEvent.click(screen.getByRole("button", { name: "Remove koira from Luku 3" }));
    expect(onRemoveFromBundle).toHaveBeenCalledWith(2, 20);
  });

  it("adds a word to a bundle it is not in yet", () => {
    const { onAddToBundle } = withBundles();
    fireEvent.click(screen.getByRole("button", { name: "Add nopea to a bundle" }));
    fireEvent.click(screen.getByRole("button", { name: "+ Kotimaa" }));
    expect(onAddToBundle).toHaveBeenCalledWith(3, 10);
  });

  it("does not offer a bundle the word is already in", () => {
    withBundles();
    fireEvent.click(screen.getByRole("button", { name: "Add juosta to a bundle" }));
    expect(screen.getByRole("button", { name: "+ Luku 3" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "+ Kotimaa" })).toBeNull();
  });

  it("offers no add control for a word already in every bundle", () => {
    withBundles();
    expect(screen.queryByRole("button", { name: "Add koira to a bundle" })).toBeNull();
  });

  it("deletes a bundle only after a confirmation that says the words stay", () => {
    const { onDeleteBundle } = withBundles();
    fireEvent.click(screen.getByRole("button", { name: "Kotimaa (2)" }));
    fireEvent.click(screen.getByRole("button", { name: /^delete bundle$/i }));
    expect(onDeleteBundle).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: /delete bundle, keep words/i }));
    expect(onDeleteBundle).toHaveBeenCalledWith(10);
  });

  it("goes back to the whole list after deleting the bundle it was filtered by", () => {
    withBundles();
    fireEvent.click(screen.getByRole("button", { name: "Kotimaa (2)" }));
    fireEvent.click(screen.getByRole("button", { name: /^delete bundle$/i }));
    fireEvent.click(screen.getByRole("button", { name: /delete bundle, keep words/i }));
    expect(screen.getByText("nopea")).toBeTruthy();
  });

  it("marks which filter is selected, not only by colour", () => {
    withBundles();
    expect(screen.getByRole("button", { name: "All (3)" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button", { name: "Kotimaa (2)" }).getAttribute("aria-pressed")).toBe("false");

    fireEvent.click(screen.getByRole("button", { name: "Kotimaa (2)" }));
    expect(screen.getByRole("button", { name: "Kotimaa (2)" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button", { name: "All (3)" }).getAttribute("aria-pressed")).toBe("false");
  });

  it("counts a word held by a bundle that is gone as unbundled", () => {
    // A word can carry an id whose bundle no longer exists — deleted while a
    // save quoting it was in flight, or in another tab. Its tag is already
    // invisible; counting it as bundled would drop the word out of Unbundled
    // with nothing on screen to explain the absence.
    const stale = [{ ...WORDS[0], bundle_ids: [999] }];
    render(<WordList words={stale} bundles={[{ id: 10, name: "Kotimaa", wordCount: 0, dueCount: 0 }]} onClose={vi.fn()} onDelete={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "Unbundled (1)" }));
    expect(screen.getByText("juosta")).toBeTruthy();
  });

  it("shows a failed action inside the dialog, where it can be seen", () => {
    // page.jsx's banner sits behind this backdrop, and the dialog declares
    // aria-modal over it — so an error rendered there reaches nobody.
    const onDismissError = vi.fn();
    withBundles({ error: "Could not add that word to the bundle.", onDismissError });

    const alert = screen.getByRole("alert");
    expect(alert.textContent).toMatch(/could not add that word/i);
    fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(onDismissError).toHaveBeenCalled();
  });

  it("shows no alert when nothing has failed", () => {
    withBundles();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("offers no bundle delete while showing everything", () => {
    withBundles();
    expect(screen.queryByRole("button", { name: /^delete bundle$/i })).toBeNull();
  });
});
