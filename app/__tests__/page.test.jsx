// @vitest-environment jsdom
/**
 * Covers the orchestration page.jsx actually owns: the gates it renders
 * behind, and the actions that touch two hooks at once and therefore live
 * here rather than in either of them. The hooks and components have their own
 * suites; this one exercises the wiring between them.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup, act, within } from "@testing-library/react";

const mocks = vi.hoisted(() => ({
  session: { data: null, isPending: false },
  translateWord: vi.fn(),
}));

// Mocked wherever the module graph reaches it: the real package pulls in a
// Next build plugin that Vitest cannot load. app/lib/__tests__/report.test.js
// is where the reporting contract itself is tested.
vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn() }));

vi.mock("../lib/authClient.js", () => ({
  authClient: {
    useSession: () => mocks.session,
    signOut: vi.fn(),
  },
}));

// Tesseract is loaded from a CDN at runtime; nothing here scans an image.
vi.mock("../lib/ocr.js", () => ({
  ocrLocal: vi.fn(),
  resetTesseractWorker: vi.fn(),
}));

vi.mock("../lib/api.js", () => ({
  ocrImage: vi.fn(),
  translateWord: (...args) => mocks.translateWord(...args),
}));

// Both need a canvas; neither is what these tests are about.
vi.mock("../lib/image.js", () => ({
  fileToBase64: () => Promise.resolve({ base64: "AAAA", mediaType: "image/jpeg" }),
  getCroppedImg: () => Promise.resolve({ base64: "AAAA", mediaType: "image/jpeg" }),
}));

vi.mock("react-easy-crop", () => ({ default: () => null }));

const Luku = (await import("../page.jsx")).default;
const { apiKeyStorageKey } = await import("../hooks/useApiKey.js");
const { MODELS, DEFAULT_MODELS } = await import("@/lib/shared/models.js");

const WORD = {
  id: 1,
  base: "juosta",
  translations: ["to run"],
  pos: "verb",
  forms: [],
  interval_days: 6,
  next_review_at: "2020-01-01T00:00:00.000Z", // long overdue
};

const signedIn = (id = "u1") => { mocks.session = { data: { user: { id } }, isPending: false }; };
const signedOut = () => { mocks.session = { data: null, isPending: false }; };

/** A key already saved by the given account. */
const saveKey = (key = "sk-ant-test", id = "u1") => localStorage.setItem(apiKeyStorageKey(id), key);

/**
 * What a route handler that threw actually returns: a 500 whose body is not
 * JSON. Every failure option below uses it, so a test proves the client
 * survives the real shape rather than a tidy `{ error }` it will never see.
 * This is the shape a database missing a migration produces.
 */
const failed = () => Promise.resolve({
  ok: false,
  status: 500,
  statusText: "Internal Server Error",
  json: () => Promise.reject(new SyntaxError("Unexpected token '<'")),
});

/** Routes by URL and method so a test can fail one call and not the others. */
function mockApi({ words = [], wordsOk = true, deleteOk = true, saveOk = true, gradeOk = true, saved = null } = {}) {
  const fetchMock = vi.fn((url, opts = {}) => {
    if (String(url).startsWith("/api/reviews")) {
      return gradeOk
        ? Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({}) })
        : failed();
    }
    if (String(url).startsWith("/api/words") && opts.method === "POST") {
      return saveOk
        ? Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ word: saved }) })
        : failed();
    }
    if (String(url).startsWith("/api/words") && opts.method === "DELETE") {
      return deleteOk
        ? Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ ok: true }) })
        : failed();
    }
    if (String(url).startsWith("/api/words")) {
      return wordsOk
        ? Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ words }) })
        : failed();
    }
    return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({}) });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

beforeEach(() => {
  mocks.session = { data: null, isPending: false };
  mocks.translateWord.mockReset();
  localStorage.clear();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("page gates", () => {
  it("shows the loading state while auth resolves", () => {
    mocks.session = { data: null, isPending: true };
    mockApi();
    render(<Luku />);
    expect(screen.getByText("Loading…")).toBeTruthy();
  });

  it("shows sign-in when nobody is signed in", () => {
    mockApi();
    render(<Luku />);
    expect(screen.getByRole("button", { name: "Sign in with email" })).toBeTruthy();
  });

  it("asks a signed-in user for a key, then lets them in", async () => {
    signedIn();
    mockApi();
    render(<Luku />);

    fireEvent.change(await screen.findByLabelText("Anthropic API key"), { target: { value: "sk-ant-test" } });
    fireEvent.click(screen.getByRole("button", { name: /Start reading/ }));

    expect(await screen.findByText("Photograph a Finnish page")).toBeTruthy();
    expect(localStorage.getItem(apiKeyStorageKey("u1"))).toBe("sk-ant-test");
  });

  it("does not make a user who has a key wait for the deployment probe", () => {
    // The probe only decides whether to offer the deployment's key. Someone
    // who already has one of their own must not sit behind a spinner for an
    // answer that cannot change what they see.
    signedIn();
    saveKey();
    vi.stubGlobal("fetch", vi.fn(() => new Promise(() => {})));

    render(<Luku />);

    expect(screen.getByText("Photograph a Finnish page")).toBeTruthy();
    expect(screen.queryByText("Loading…")).toBeNull();
  });

  it("never probes for a development key when the user has one saved", async () => {
    signedIn();
    saveKey();
    const fetchMock = mockApi({ words: [] });

    render(<Luku />);
    await screen.findByText("Photograph a Finnish page");

    // The probe's answer cannot change anything here — a saved key wins over
    // the development one — so asking is pure cost on every visit.
    const probes = fetchMock.mock.calls.filter(([url, opts]) => String(url) === "/api/claude" && !opts?.method);
    expect(probes).toHaveLength(0);
  });

  it("probes once the key screen is opened, so it can offer the development key", async () => {
    signedIn();
    saveKey();
    const fetchMock = vi.fn((url, opts = {}) => {
      if (String(url) === "/api/claude" && !opts.method) {
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ serverKey: true }) });
      }
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ words: [] }) });
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<Luku />);
    await screen.findByText("Photograph a Finnish page");
    fireEvent.click(screen.getByRole("button", { name: "Menu" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "API key" }));

    // Deferring the probe must not cost the option to switch back to it.
    expect(await screen.findByRole("button", { name: /Use this deployment's key/ })).toBeTruthy();
  });

  it("lets a user skip the key and scan locally", async () => {
    signedIn();
    mockApi();
    render(<Luku />);

    fireEvent.click(await screen.findByRole("button", { name: /Skip — use local OCR only/ }));

    expect(await screen.findByText("Photograph a Finnish page")).toBeTruthy();
  });
});

describe("page with a signed-in user", () => {
  beforeEach(() => {
    signedIn();
    saveKey();
  });

  it("loads the user's words and offers the due review", async () => {
    mockApi({ words: [WORD] });
    render(<Luku />);

    expect(await screen.findByRole("button", { name: "1 words" })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Review 1 due word/ })).toBeTruthy();
  });

  it("starts a review session from the scan stage", async () => {
    mockApi({ words: [WORD] });
    render(<Luku />);

    fireEvent.click(await screen.findByRole("button", { name: /Review 1 due word/ }));

    expect(screen.getByText("juosta")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Show answer" })).toBeTruthy();
  });

  it("removes a deleted word from the list", async () => {
    mockApi({ words: [WORD] });
    render(<Luku />);

    fireEvent.click(await screen.findByRole("button", { name: "1 words" }));
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    fireEvent.click(screen.getByRole("button", { name: "Sure?" }));

    await waitFor(() => expect(screen.getByText("No words saved yet.")).toBeTruthy());
  });

  it("puts a word back when the server refuses to delete it", async () => {
    // The optimistic removal is only honest if the rollback works; this is the
    // path a reviewer cannot see by reading either hook alone.
    mockApi({ words: [WORD], deleteOk: false });
    render(<Luku />);

    fireEvent.click(await screen.findByRole("button", { name: "1 words" }));
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    fireEvent.click(screen.getByRole("button", { name: "Sure?" }));

    await waitFor(() => expect(screen.getByText("juosta")).toBeTruthy());
    expect(screen.getByText("Vocabulary (1)")).toBeTruthy();
  });

  it("ignores a second delete of the same word while the first is in flight", async () => {
    let release;
    const fetchMock = vi.fn((url, opts = {}) => {
      if (String(url).startsWith("/api/words") && opts.method === "DELETE") {
        return new Promise((resolve) => { release = () => resolve({ ok: true, status: 200, json: () => Promise.resolve({ ok: true }) }); });
      }
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ words: [WORD] }) });
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<Luku />);

    fireEvent.click(await screen.findByRole("button", { name: "1 words" }));
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    fireEvent.click(screen.getByRole("button", { name: "Sure?" }));
    await waitFor(() => expect(screen.getByText("No words saved yet.")).toBeTruthy());

    const deletes = () => fetchMock.mock.calls.filter(([, o]) => o?.method === "DELETE").length;
    expect(deletes()).toBe(1);
    await act(async () => { release(); });
    expect(deletes()).toBe(1);
  });

  it("says the word list failed rather than looking like an account with no words", async () => {
    // The silent version of this is indistinguishable from a new account: an
    // empty list, no review offered, and nothing to say the request failed.
    // A deployment whose database never had db/schema.sql re-run lands here.
    mockApi({ words: [WORD], wordsOk: false });
    render(<Luku />);

    const banner = await screen.findByRole("alert");
    expect(banner.textContent).toContain("Couldn't load your word list.");
    expect(screen.queryByRole("button", { name: "1 words" })).toBeNull();
  });

  it("loads the word list on retry after a failed load", async () => {
    const fetchMock = mockApi({ words: [WORD], wordsOk: false });
    render(<Luku />);
    await screen.findByRole("alert");

    // Only the retry succeeds, so a list on screen can only have come from it.
    fetchMock.mockImplementation(() =>
      Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ words: [WORD] }) }));
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));

    expect(await screen.findByRole("button", { name: "1 words" })).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("reports a refused delete inside the dialog that asked for it", async () => {
    // The page's own banner is a sibling of this dialog: it would render
    // outside the focus trap and inside the subtree aria-modal calls inert.
    mockApi({ words: [WORD], deleteOk: false });
    render(<Luku />);

    fireEvent.click(await screen.findByRole("button", { name: "1 words" }));
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    fireEvent.click(screen.getByRole("button", { name: "Sure?" }));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("may still be on your list");
    expect(screen.getByRole("dialog").contains(alert)).toBe(true);
  });

  it("does not float the page banner over an open dialog", async () => {
    mockApi({ words: [WORD], gradeOk: false });
    render(<Luku />);

    fireEvent.click(await screen.findByRole("button", { name: /Review 1 due word/ }));
    fireEvent.click(screen.getByRole("button", { name: "Show answer" }));
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Easy" })); });
    await screen.findByRole("alert");

    fireEvent.click(screen.getByRole("button", { name: "1 words" }));
    expect(screen.queryByRole("alert")).toBeNull();

    // Withheld, not lost: the card it is about is still on screen behind.
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(screen.getByRole("alert").textContent).toContain("Couldn't confirm that answer was saved");
  });

  it("says so when a graded card is not saved", async () => {
    // Without this the card simply does not advance, which reads as a button
    // that did nothing.
    mockApi({ words: [WORD], gradeOk: false });
    render(<Luku />);

    fireEvent.click(await screen.findByRole("button", { name: /Review 1 due word/ }));
    fireEvent.click(screen.getByRole("button", { name: "Show answer" }));
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Easy" })); });

    const banner = await screen.findByRole("alert");
    expect(banner.textContent).toContain("Couldn't confirm that answer was saved");
  });

  it("clears a failed delete's notice when the next delete succeeds", async () => {
    let deleteOk = false;
    const fetchMock = vi.fn((url, opts = {}) => {
      if (String(url).startsWith("/api/words") && opts.method === "DELETE") {
        return deleteOk
          ? Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ ok: true }) })
          : failed();
      }
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ words: [WORD] }) });
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<Luku />);

    fireEvent.click(await screen.findByRole("button", { name: "1 words" }));
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    fireEvent.click(screen.getByRole("button", { name: "Sure?" }));
    await screen.findByRole("alert");

    // Left standing, the banner claims the word is still on the list while the
    // reader watches it disappear.
    deleteOk = true;
    fireEvent.click(await screen.findByRole("button", { name: "Delete" }));
    fireEvent.click(screen.getByRole("button", { name: "Sure?" }));

    await waitFor(() => expect(screen.getByText("No words saved yet.")).toBeTruthy());
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("retires a notice when the reader leaves the screen it was about", async () => {
    mockApi({ words: [WORD], gradeOk: false });
    render(<Luku />);

    fireEvent.click(await screen.findByRole("button", { name: /Review 1 due word/ }));
    fireEvent.click(screen.getByRole("button", { name: "Show answer" }));
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Easy" })); });
    expect(screen.getByRole("alert").textContent).toContain("Couldn't confirm that answer was saved");

    // "The card stays due" means nothing on the scan screen...
    fireEvent.click(screen.getByText("Luku"));
    expect(screen.queryByRole("alert")).toBeNull();

    // ...and it is retired, not merely hidden: coming back to the review must
    // not resurrect a complaint about a grade the reader has moved past.
    fireEvent.click(await screen.findByRole("button", { name: /Review 1 due word/ }));
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("does not raise a notice about a card the reader has already left", async () => {
    // The grade is still in flight when the reader returns to Scan, so the
    // failure lands tagged with a stage they are no longer on.
    let failGrade;
    vi.stubGlobal("fetch", vi.fn((url) => {
      if (String(url).startsWith("/api/reviews")) {
        return new Promise((resolve) => { failGrade = () => resolve(failed()); });
      }
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ words: [WORD] }) });
    }));
    render(<Luku />);

    fireEvent.click(await screen.findByRole("button", { name: /Review 1 due word/ }));
    fireEvent.click(screen.getByRole("button", { name: "Show answer" }));
    fireEvent.click(screen.getByRole("button", { name: "Easy" }));
    fireEvent.click(screen.getByText("Luku"));

    await act(async () => { failGrade(); });

    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("lets the reader dismiss a notice", async () => {
    mockApi({ words: [WORD], gradeOk: false });
    render(<Luku />);

    fireEvent.click(await screen.findByRole("button", { name: /Review 1 due word/ }));
    fireEvent.click(screen.getByRole("button", { name: "Show answer" }));
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Easy" })); });
    await screen.findByRole("alert");

    fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("opens the key screen again from the header menu", async () => {
    mockApi({ words: [WORD] });
    render(<Luku />);

    await screen.findByRole("button", { name: "1 words" });
    fireEvent.click(screen.getByRole("button", { name: "Menu" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "API key" }));

    expect(screen.getByLabelText("Anthropic API key")).toBeTruthy();
  });
});

describe("reading a scanned page", () => {
  const SCANNED = "Koira juoksee.";

  beforeEach(() => {
    signedIn();
    saveKey();
  });

  /** Walks the scan stage far enough to reach the tappable text. */
  async function scan(ocr) {
    ocr.mockResolvedValue(SCANNED);
    const file = new File(["x"], "page.jpg", { type: "image/jpeg" });
    const input = document.querySelector('input[type="file"]');
    expect(input).toBeTruthy();

    await act(async () => { fireEvent.change(input, { target: { files: [file] } }); });
    fireEvent.click(await screen.findByRole("button", { name: "Skip crop" }));
    await screen.findByText("Koira");
  }

  it("moves to the read stage with the scanned text tappable", async () => {
    const { ocrLocal } = await import("../lib/ocr.js");
    mockApi();
    render(<Luku />);

    await scan(ocrLocal);

    expect(screen.getByText("juoksee")).toBeTruthy();
    expect(screen.getByText("Scanned locally with Tesseract")).toBeTruthy();
  });

  it("translates a tapped word and adds it to the review list", async () => {
    const { ocrLocal } = await import("../lib/ocr.js");
    mocks.translateWord.mockResolvedValue({
      base: "koira", translations: ["dog"], formTranslation: "dog", pos: "noun",
      example: "Iso koira.", example_translation: "A big dog.",
    });
    mockApi({ saved: { ...WORD, id: 2, base: "koira", translations: ["dog"], pos: "noun" } });
    render(<Luku />);

    await scan(ocrLocal);
    await act(async () => { fireEvent.click(screen.getByText("Koira")); });

    // The whole sentence goes along as context, dehyphenated.
    expect(mocks.translateWord).toHaveBeenCalledWith("sk-ant-test", "Koira", SCANNED, DEFAULT_MODELS.translate);

    fireEvent.click(await screen.findByRole("button", { name: /Add to review list/ }));

    expect(await screen.findByText("✓ Added to review")).toBeTruthy();
    expect(await screen.findByRole("button", { name: "1 new" })).toBeTruthy();
  });

  it("takes back the ✓ when the server refuses to save the word", async () => {
    // The ✓ is optimistic, and it was never withdrawn. A deployment missing
    // the `example` columns rejects every insert while the word list still
    // loads, so the reader is told each word was added and finds none of them
    // there later.
    const { ocrLocal } = await import("../lib/ocr.js");
    mocks.translateWord.mockResolvedValue({
      base: "koira", translations: ["dog"], formTranslation: "dog", pos: "noun",
    });
    mockApi({ saveOk: false });
    render(<Luku />);

    await scan(ocrLocal);
    await act(async () => { fireEvent.click(screen.getByText("Koira")); });
    await act(async () => {
      fireEvent.click(await screen.findByRole("button", { name: /Add to review list/ }));
    });

    expect(screen.queryByText("✓ Added to review")).toBeNull();
    expect(screen.getByRole("button", { name: /Add to review list/ })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "1 new" })).toBeNull();
    expect(screen.getByRole("alert").textContent).toContain("Adding it again is safe");
  });

  it("does not claim the word is gone when only a new form failed to save", async () => {
    // The base form was already saved, so a refused POST loses the inflection
    // and nothing else. Saying it is not on the review list is a lie the
    // reader's own list contradicts.
    const { ocrLocal } = await import("../lib/ocr.js");
    mocks.translateWord.mockResolvedValue({
      base: "koira", translations: ["dog"], formTranslation: "dog", pos: "noun",
    });
    mockApi({ words: [{ ...WORD, id: 3, base: "koira", translations: ["dog"], pos: "noun" }], saveOk: false });
    render(<Luku />);

    await scan(ocrLocal);
    await screen.findByRole("button", { name: "1 words" });
    await act(async () => { fireEvent.click(screen.getByText("Koira")); });
    await act(async () => {
      fireEvent.click(await screen.findByRole("button", { name: /Add to review list/ }));
    });

    const banner = screen.getByRole("alert");
    expect(banner.textContent).toContain("still on your review list");
    expect(screen.getByRole("button", { name: "1 words" })).toBeTruthy();
  });

  it("ignores a save that fails after the reader has moved to a new scan", async () => {
    // The save outlives the page it was started from. Landing late, it used to
    // withdraw the ✓ and raise a banner on the scan that came after it.
    const { ocrLocal } = await import("../lib/ocr.js");
    mocks.translateWord.mockResolvedValue({
      base: "koira", translations: ["dog"], formTranslation: "dog", pos: "noun",
    });
    let rejectSave;
    vi.stubGlobal("fetch", vi.fn((url, opts = {}) => {
      if (String(url).startsWith("/api/words") && opts.method === "POST") {
        return new Promise((_resolve, reject) => { rejectSave = () => reject(new Error("offline")); });
      }
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ words: [WORD] }) });
    }));
    render(<Luku />);

    await scan(ocrLocal);
    await act(async () => { fireEvent.click(screen.getByText("Koira")); });
    fireEvent.click(await screen.findByRole("button", { name: /Add to review list/ }));

    // Back to scan, into the due review, and out again through Scan Another —
    // the only route to handleScanAnother — then scan and tap the same word.
    fireEvent.click(screen.getByText("Luku"));
    fireEvent.click(await screen.findByRole("button", { name: /Review 1 due word/ }));
    fireEvent.click(screen.getByRole("button", { name: "Show answer" }));
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Easy" })); });
    fireEvent.click(screen.getByRole("button", { name: /Scan Another Page/ }));
    await scan(ocrLocal);
    await act(async () => { fireEvent.click(screen.getByText("Koira")); });

    await act(async () => { rejectSave(); });

    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("shows the stored translation at once for a word already on the list", async () => {
    const { ocrLocal } = await import("../lib/ocr.js");
    // Never resolves: the popup is inspected while the lookup is still in flight.
    mocks.translateWord.mockReturnValue(new Promise(() => {}));
    mockApi({ words: [{ ...WORD, id: 3, base: "koira", translations: ["dog"], pos: "noun" }] });
    render(<Luku />);

    await scan(ocrLocal);
    await screen.findByRole("button", { name: "1 words" });
    fireEvent.click(screen.getByText("Koira"));

    expect(await screen.findByText(/dog/)).toBeTruthy();
    expect(screen.getByText(/in your list/i)).toBeTruthy();
    expect(screen.getByText(/checking this form/i)).toBeTruthy();
    // The fresh lookup still runs — the stored entry is a head start, not a
    // replacement for translating the form in front of the reader.
    expect(mocks.translateWord).toHaveBeenCalledWith("sk-ant-test", "Koira", SCANNED, DEFAULT_MODELS.translate);
  });

  it("answers from the list without a key when the word is already saved", async () => {
    const { ocrLocal } = await import("../lib/ocr.js");
    saveKey("__skip__");
    mockApi({ words: [{ ...WORD, id: 3, base: "koira", translations: ["dog"], pos: "noun" }] });
    render(<Luku />);

    await scan(ocrLocal);
    await screen.findByRole("button", { name: "1 words" });
    fireEvent.click(screen.getByText("Koira"));

    expect(await screen.findByText(/dog/)).toBeTruthy();
    expect(screen.getByText(/in your list/i)).toBeTruthy();
    expect(mocks.translateWord).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "Add API key" })).toBeNull();
  });

  it("leaves the popup closed when the reader dismisses it mid-lookup", async () => {
    const { ocrLocal } = await import("../lib/ocr.js");
    let resolve;
    mocks.translateWord.mockReturnValue(new Promise((r) => { resolve = r; }));
    mockApi();
    render(<Luku />);

    await scan(ocrLocal);
    fireEvent.click(screen.getByText("Koira"));
    await screen.findByText(/analysing/i);
    // Tapping outside the popup closes it.
    fireEvent.click(screen.getByText("tap any word"));
    expect(screen.queryByText(/analysing/i)).toBeNull();

    await act(async () => {
      resolve({ base: "koira", translations: ["dog"], formTranslation: "dog", pos: "noun" });
    });

    expect(screen.queryByText(/dog/)).toBeNull();
    // The lookup is not wasted: it landed in the session cache, so tapping the
    // word again answers from there without a second request.
    fireEvent.click(screen.getByText("Koira"));
    expect(await screen.findByText(/dog/)).toBeTruthy();
    expect(mocks.translateWord).toHaveBeenCalledTimes(1);
  });

  it("leaves the popup closed when a mid-lookup failure lands after dismissal", async () => {
    const { ocrLocal } = await import("../lib/ocr.js");
    let reject;
    mocks.translateWord.mockReturnValue(new Promise((_, r) => { reject = r; }));
    mockApi();
    render(<Luku />);

    await scan(ocrLocal);
    fireEvent.click(screen.getByText("Koira"));
    await screen.findByText(/analysing/i);
    fireEvent.click(screen.getByText("tap any word"));

    await act(async () => { reject(new Error("network down")); });

    expect(screen.queryByText(/network down/)).toBeNull();
  });

  it("offers the key screen instead of translating when the key was skipped", async () => {
    const { ocrLocal } = await import("../lib/ocr.js");
    saveKey("__skip__");
    mockApi();
    render(<Luku />);

    await scan(ocrLocal);
    fireEvent.click(screen.getByText("Koira"));

    expect(mocks.translateWord).not.toHaveBeenCalled();
    fireEvent.click(await screen.findByRole("button", { name: "Add API key" }));
    expect(screen.getByLabelText("Anthropic API key")).toBeTruthy();
  });
});


/**
 * A sign-out and a sign-in as somebody else never reload the page, so
 * everything the first reader accumulated has to go with their session rather
 * than sit in state the next one inherits.
 */
describe("switching accounts", () => {
  const SCANNED = "Koira juoksee.";

  async function scan(ocr) {
    ocr.mockResolvedValue(SCANNED);
    const file = new File(["x"], "page.jpg", { type: "image/jpeg" });
    await act(async () => {
      fireEvent.change(document.querySelector('input[type="file"]'), { target: { files: [file] } });
    });
    fireEvent.click(await screen.findByRole("button", { name: "Skip crop" }));
    await screen.findByText("Koira");
  }

  /** Sign out, then in as `id`, without the page ever reloading. */
  async function switchTo(id, rerender) {
    signedOut();
    await act(async () => { rerender(<Luku />); });
    expect(screen.getByRole("button", { name: "Sign in with email" })).toBeTruthy();
    signedIn(id);
    await act(async () => { rerender(<Luku />); });
  }

  it("does not hand the previous reader's API key to the next one", async () => {
    signedIn("u1");
    saveKey("sk-ant-u1", "u1");
    mockApi({ words: [] });
    const { rerender } = render(<Luku />);
    await screen.findByText("Photograph a Finnish page");

    await switchTo("u2", rerender);

    // u1's credit is not u2's to spend, so u2 is asked for their own key.
    expect(await screen.findByLabelText("Anthropic API key")).toBeTruthy();
  });

  it("does not show the previous reader's scanned page or word list", async () => {
    const { ocrLocal } = await import("../lib/ocr.js");
    signedIn("u1");
    saveKey("sk-ant-u1", "u1");
    saveKey("sk-ant-u2", "u2");
    mockApi({ words: [WORD] });
    const { rerender } = render(<Luku />);

    await scan(ocrLocal);
    await screen.findByRole("button", { name: "1 words" });

    mockApi({ words: [] });
    await switchTo("u2", rerender);

    expect(await screen.findByText("Photograph a Finnish page")).toBeTruthy();
    expect(screen.queryByText("juoksee")).toBeNull();
    expect(screen.queryByRole("button", { name: "1 words" })).toBeNull();
  });
});

describe("choosing a model per task", () => {
  const OTHER = MODELS.find((m) => m.id !== DEFAULT_MODELS.translate);
  const SCANNED = "Koira juoksee.";

  async function scan(ocr) {
    ocr.mockResolvedValue(SCANNED);
    const file = new File(["x"], "page.jpg", { type: "image/jpeg" });
    await act(async () => {
      fireEvent.change(document.querySelector('input[type="file"]'), { target: { files: [file] } });
    });
    fireEvent.click(await screen.findByRole("button", { name: "Skip crop" }));
    await screen.findByText("Koira");
  }

  const openModels = async () => {
    fireEvent.click(screen.getByRole("button", { name: "Menu" }));
    fireEvent.click(await screen.findByRole("menuitem", { name: "Models" }));
    return screen.findByRole("dialog");
  };

  beforeEach(() => { signedIn(); saveKey(); });

  it("sends the translation model the reader picked", async () => {
    const { ocrLocal } = await import("../lib/ocr.js");
    mocks.translateWord.mockResolvedValue({
      base: "koira", translations: ["dog"], formTranslation: "dog", pos: "noun",
      example: null, example_translation: null,
    });
    mockApi();
    render(<Luku />);

    await scan(ocrLocal);
    await openModels();
    const translations = screen.getByRole("group", { name: /Translations/ });
    fireEvent.click(within(translations).getByRole("radio", { name: new RegExp(OTHER.label) }));
    fireEvent.click(screen.getByRole("button", { name: "Done" }));

    await act(async () => { fireEvent.click(screen.getByText("Koira")); });

    expect(mocks.translateWord).toHaveBeenCalledWith("sk-ant-test", "Koira", SCANNED, OTHER.id);
  });

  it("leaves the scan model where it was", async () => {
    const { ocrLocal } = await import("../lib/ocr.js");
    mockApi();
    render(<Luku />);

    await scan(ocrLocal);
    await openModels();
    const translations = screen.getByRole("group", { name: /Translations/ });
    fireEvent.click(within(translations).getByRole("radio", { name: new RegExp(OTHER.label) }));

    // The two calls are chosen apart; picking for one must not move the other.
    const ocrGroup = screen.getByRole("group", { name: /AI scan/ });
    expect(within(ocrGroup).getByRole("radio", { checked: true })).toHaveProperty("value", DEFAULT_MODELS.ocr);
  });

  it("remembers the choice across a remount", async () => {
    mockApi();
    const { unmount } = render(<Luku />);

    await openModels();
    const translations = screen.getByRole("group", { name: /Translations/ });
    fireEvent.click(within(translations).getByRole("radio", { name: new RegExp(OTHER.label) }));
    unmount();

    render(<Luku />);
    await openModels();
    expect(within(screen.getByRole("group", { name: /Translations/ })).getByRole("radio", { checked: true }))
      .toHaveProperty("value", OTHER.id);
  });

  it("does not offer the panel to a reader with no key", async () => {
    localStorage.clear();
    signedIn();
    saveKey("__skip__");
    mockApi();
    render(<Luku />);

    fireEvent.click(await screen.findByRole("button", { name: "Menu" }));

    // Nothing is sent to Anthropic at all, so there is no model to choose.
    expect(screen.queryByRole("menuitem", { name: "Models" })).toBeNull();
    expect(screen.getByRole("menuitem", { name: "API key" })).toBeTruthy();
  });
});
