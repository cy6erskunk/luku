// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import TranslationPopup from "../TranslationPopup.jsx";

afterEach(cleanup);

const SESSION_ENTRY = { base: "juosta", translations: ["to run"], pos: "verb", added: false };

function setup(popup, session = {}, props = {}) {
  const onAddWord = props.onAddWord ?? vi.fn();
  const onAddApiKey = props.onAddApiKey ?? vi.fn();
  render(
    <TranslationPopup
      popup={popup}
      containerRef={{ current: { offsetWidth: 400 } }}
      session={session}
      onAddWord={onAddWord}
      onAddApiKey={onAddApiKey}
    />
  );
  return { onAddWord, onAddApiKey };
}

describe("TranslationPopup – null popup", () => {
  it("renders nothing when popup is null", () => {
    const { container } = render(
      <TranslationPopup popup={null} containerRef={null} session={{}} onAddWord={vi.fn()} onAddApiKey={vi.fn()} />
    );
    expect(container.firstChild).toBeNull();
  });
});

describe("TranslationPopup – no-key branch", () => {
  const popup = { word: "juosta", k: "juosta", x: 100, y: 80, noKey: true };

  it("shows the tapped word", () => {
    setup(popup);
    expect(screen.getByText("juosta")).toBeTruthy();
  });

  it("prompts to add an API key", () => {
    setup(popup);
    expect(screen.getByText(/add your api key/i)).toBeTruthy();
  });

  it("calls onAddApiKey when the button is clicked", () => {
    const { onAddApiKey } = setup(popup);
    fireEvent.click(screen.getByRole("button", { name: /add api key/i }));
    expect(onAddApiKey).toHaveBeenCalled();
  });
});

describe("TranslationPopup – loading branch", () => {
  const popup = { word: "koira", k: "koira", x: 100, y: 80, loading: true };

  it("shows a loading indicator", () => {
    setup(popup);
    expect(screen.getByText(/analysing/i)).toBeTruthy();
  });

  it("includes the word being analysed in the message", () => {
    setup(popup);
    expect(screen.getByText(/koira/)).toBeTruthy();
  });

  it("does not show the Add button while loading", () => {
    setup(popup, { koira: SESSION_ENTRY });
    expect(screen.queryByRole("button", { name: /add to review/i })).toBeNull();
  });
});

describe("TranslationPopup – translation branch", () => {
  const popup = { word: "juosta", k: "juosta", x: 100, y: 80, base: "juosta", translations: ["to run", "run"], pos: "verb" };

  it("shows the word", () => {
    setup(popup, { juosta: SESSION_ENTRY });
    expect(screen.getByText("juosta")).toBeTruthy();
  });

  it("shows translations", () => {
    setup(popup, { juosta: SESSION_ENTRY });
    // "→ to run" is the first translation, "   run" the second
    expect(screen.getAllByText(/run/).length).toBeGreaterThanOrEqual(2);
  });

  it("shows the part of speech badge", () => {
    setup(popup, { juosta: SESSION_ENTRY });
    expect(screen.getByText("verb")).toBeTruthy();
  });

  it("hides the in-text block when the word matches the base (case-insensitive)", () => {
    setup(popup, { juosta: SESSION_ENTRY });
    expect(screen.queryByText(/in text/i)).toBeNull();
  });

  it("uses the base form as the headline when the tapped word is inflected", () => {
    const p = { ...popup, word: "juoksin", base: "juosta" };
    setup(p, { juosta: SESSION_ENTRY });
    expect(screen.getByText("juosta")).toBeTruthy();
  });

  it("shows the tapped form in the in-text block when it differs from the base", () => {
    const p = { ...popup, word: "juoksin", base: "juosta" };
    setup(p, { juosta: SESSION_ENTRY });
    expect(screen.getByText(/in text/i)).toBeTruthy();
    expect(screen.getByText(/juoksin/)).toBeTruthy();
  });

  it("shows the form translation next to the tapped form when available", () => {
    const p = { ...popup, word: "juoksin", base: "juosta", formTranslation: "I ran" };
    setup(p, { juosta: SESSION_ENTRY });
    expect(screen.getByText(/I ran/)).toBeTruthy();
  });

  it("shows Add button when session has an entry and word is not added", () => {
    setup(popup, { juosta: SESSION_ENTRY });
    expect(screen.getByRole("button", { name: /add to review list/i })).toBeTruthy();
  });

  it("calls onAddWord when Add button is clicked", () => {
    const { onAddWord } = setup(popup, { juosta: SESSION_ENTRY });
    fireEvent.click(screen.getByRole("button", { name: /add to review list/i }));
    expect(onAddWord).toHaveBeenCalled();
  });

  it("shows Added badge when popup.added is true", () => {
    setup({ ...popup, added: true }, { juosta: SESSION_ENTRY });
    expect(screen.getByText(/added to review/i)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /add to review list/i })).toBeNull();
  });

  it("shows Added badge when session entry is marked added", () => {
    setup(popup, { juosta: { ...SESSION_ENTRY, added: true } });
    expect(screen.getByText(/added to review/i)).toBeTruthy();
  });

  it("hides both Add button and Added badge when there is no session entry (translation error)", () => {
    setup(popup, {});
    expect(screen.queryByRole("button", { name: /add to review list/i })).toBeNull();
    expect(screen.queryByText(/added to review/i)).toBeNull();
  });
});

describe("TranslationPopup – existsInDb indicator", () => {
  const popup = { word: "juosta", k: "juosta", x: 100, y: 80, base: "juosta", translations: ["to run"], pos: "verb" };

  it("shows the 'in your list' badge when existsInDb is true", () => {
    setup({ ...popup, existsInDb: true }, { juosta: SESSION_ENTRY });
    expect(screen.getByText(/in your list/i)).toBeTruthy();
  });

  it("hides the badge when existsInDb is false", () => {
    setup({ ...popup, existsInDb: false }, { juosta: SESSION_ENTRY });
    expect(screen.queryByText(/in your list/i)).toBeNull();
  });

  it("shows the badge in the loading branch when existsInDb is true", () => {
    setup({ word: "juosta", k: "juosta", x: 100, y: 80, loading: true, existsInDb: true });
    expect(screen.getByText(/in your list/i)).toBeTruthy();
    expect(screen.getByText(/analysing/i)).toBeTruthy();
  });

  it("does not show the badge in the no-key branch", () => {
    setup({ word: "juosta", k: "juosta", x: 100, y: 80, noKey: true, existsInDb: true });
    expect(screen.queryByText(/in your list/i)).toBeNull();
  });
});

describe("TranslationPopup – saved translation while loading", () => {
  const popup = {
    word: "juoksin", k: "juoksin", x: 100, y: 80, loading: true, existsInDb: true,
    base: "juosta", translations: ["to run"], pos: "verb", formTranslation: "I ran",
  };

  it("shows the stored translation instead of the bare spinner", () => {
    setup(popup);
    expect(screen.getByText(/to run/)).toBeTruthy();
    expect(screen.queryByText(/analysing/i)).toBeNull();
  });

  it("keeps the 'in your list' badge alongside it", () => {
    setup(popup);
    expect(screen.getByText(/in your list/i)).toBeTruthy();
  });

  it("says the tapped form is still being checked", () => {
    setup(popup);
    expect(screen.getByText(/checking this form/i)).toBeTruthy();
  });

  it("shows the stored translation of the tapped form", () => {
    setup(popup);
    expect(screen.getByText(/I ran/)).toBeTruthy();
  });

  it("offers no Add button while the lookup is still running", () => {
    setup(popup);
    expect(screen.queryByRole("button", { name: /add to review list/i })).toBeNull();
  });

  it("falls back to the spinner when there is nothing stored to show", () => {
    setup({ word: "koira", k: "koira", x: 100, y: 80, loading: true, existsInDb: true, translations: [] });
    expect(screen.getByText(/analysing/i)).toBeTruthy();
    expect(screen.queryByText(/checking this form/i)).toBeNull();
  });

  it("drops the checking note once the lookup has landed", () => {
    setup({ ...popup, loading: false });
    expect(screen.queryByText(/checking this form/i)).toBeNull();
    expect(screen.getByText(/to run/)).toBeTruthy();
  });
});

describe("TranslationPopup – failed form lookup", () => {
  const popup = {
    word: "juoksin", k: "juoksin", x: 100, y: 80, existsInDb: true,
    base: "juosta", translations: ["to run"], pos: "verb", formError: "network down",
  };

  it("keeps the stored translation and explains what failed", () => {
    setup(popup);
    expect(screen.getByText(/to run/)).toBeTruthy();
    expect(screen.getByText(/couldn't check this form/i)).toBeTruthy();
    expect(screen.getByText(/network down/)).toBeTruthy();
  });
});
