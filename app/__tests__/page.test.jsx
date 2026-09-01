// @vitest-environment jsdom
/**
 * Covers the orchestration page.jsx actually owns: the gates it renders
 * behind, and the actions that touch two hooks at once and therefore live
 * here rather than in either of them. The hooks and components have their own
 * suites; this one exercises the wiring between them.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup, act } from "@testing-library/react";

const mocks = vi.hoisted(() => ({
  session: { data: null, isPending: false },
  translateWord: vi.fn(),
}));

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

const WORD = {
  id: 1,
  base: "juosta",
  translations: ["to run"],
  pos: "verb",
  forms: [],
  interval_days: 6,
  next_review_at: "2020-01-01T00:00:00.000Z", // long overdue
};

const signedIn = () => { mocks.session = { data: { user: { id: "u1" } }, isPending: false }; };

/** Routes by URL and method so a test can fail one call and not the others. */
function mockApi({ words = [], deleteOk = true, saved = null } = {}) {
  const fetchMock = vi.fn((url, opts = {}) => {
    if (String(url).startsWith("/api/words") && opts.method === "POST") {
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ word: saved }) });
    }
    if (String(url).startsWith("/api/words") && opts.method === "DELETE") {
      return Promise.resolve(deleteOk
        ? { ok: true, status: 200, json: () => Promise.resolve({ ok: true }) }
        : { ok: false, status: 500, statusText: "Server Error", json: () => Promise.resolve({ error: "nope" }) });
    }
    if (String(url).startsWith("/api/words")) {
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ words }) });
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
    expect(localStorage.getItem("luku_api_key")).toBe("sk-ant-test");
  });

  it("does not make a user who has a key wait for the deployment probe", () => {
    // The probe only decides whether to offer the deployment's key. Someone
    // who already has one of their own must not sit behind a spinner for an
    // answer that cannot change what they see.
    signedIn();
    localStorage.setItem("luku_api_key", "sk-ant-test");
    vi.stubGlobal("fetch", vi.fn(() => new Promise(() => {})));

    render(<Luku />);

    expect(screen.getByText("Photograph a Finnish page")).toBeTruthy();
    expect(screen.queryByText("Loading…")).toBeNull();
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
    localStorage.setItem("luku_api_key", "sk-ant-test");
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
    localStorage.setItem("luku_api_key", "sk-ant-test");
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
    expect(mocks.translateWord).toHaveBeenCalledWith("sk-ant-test", "Koira", SCANNED);

    fireEvent.click(await screen.findByRole("button", { name: /Add to review list/ }));

    expect(await screen.findByText("✓ Added to review")).toBeTruthy();
    expect(await screen.findByRole("button", { name: "1 new" })).toBeTruthy();
  });

  it("offers the key screen instead of translating when the key was skipped", async () => {
    const { ocrLocal } = await import("../lib/ocr.js");
    localStorage.setItem("luku_api_key", "__skip__");
    mockApi();
    render(<Luku />);

    await scan(ocrLocal);
    fireEvent.click(screen.getByText("Koira"));

    expect(mocks.translateWord).not.toHaveBeenCalled();
    fireEvent.click(await screen.findByRole("button", { name: "Add API key" }));
    expect(screen.getByLabelText("Anthropic API key")).toBeTruthy();
  });
});

