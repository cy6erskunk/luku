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
function mockApi({ words = [], bundles = [], created = null, deleteOk = true, saved = null } = {}) {
  const fetchMock = vi.fn((url, opts = {}) => {
    if (String(url).startsWith("/api/bundles") && opts.method === "POST") {
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ bundle: created }) });
    }
    if (String(url).startsWith("/api/bundles")) {
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ bundles, ok: true }) });
    }
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

  it("never probes for a development key when the user has one saved", async () => {
    signedIn();
    localStorage.setItem("luku_api_key", "sk-ant-test");
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
    localStorage.setItem("luku_api_key", "sk-ant-test");
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
    expect(mocks.translateWord).toHaveBeenCalledWith("sk-ant-test", "Koira", SCANNED);
  });

  it("answers from the list without a key when the word is already saved", async () => {
    const { ocrLocal } = await import("../lib/ocr.js");
    localStorage.setItem("luku_api_key", "__skip__");
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

describe("bundles", () => {
  const KOTIMAA = { id: 10, name: "Kotimaa" };
  const OTHER = { id: 20, name: "Luku 3" };
  const IN_KOTIMAA = { ...WORD, id: 5, base: "koira", translations: ["dog"], bundle_ids: [10] };
  const ELSEWHERE = { ...WORD, id: 6, base: "kissa", translations: ["cat"], bundle_ids: [20] };

  beforeEach(() => {
    signedIn();
    localStorage.setItem("luku_api_key", "sk-ant-test");
  });

  it("does not report a bundle-membership failure on a screen that moved on", async () => {
    // The same guard handleDeleteWord has, on the three bundle handlers that
    // were left without it. A -> B -> A restores the id the hooks compare, so
    // the failure does reach page.jsx; the screen counter is what stops it.
    let rejectPatch;
    vi.stubGlobal("fetch", vi.fn((url, opts = {}) => {
      if (String(url).startsWith("/api/words") && opts.method === "PATCH") {
        return new Promise((_r, rej) => { rejectPatch = rej; });
      }
      if (String(url).startsWith("/api/bundles")) {
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ bundles: [KOTIMAA] }) });
      }
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ words: [ELSEWHERE] }) });
    }));

    const { rerender } = render(<Luku />);
    fireEvent.click(await screen.findByRole("button", { name: /1 words/i }));
    // Open the word's bundle menu, then put it in Kotimaa — the PATCH that
    // this test leaves hanging.
    fireEvent.click(await screen.findByRole("button", { name: /add kissa to a bundle/i }));
    fireEvent.click(await screen.findByRole("button", { name: /\+ Kotimaa/i }));

    const swap = async (id) => {
      mocks.session = { data: { user: { id } }, isPending: false };
      await act(async () => { rerender(<Luku />); });
    };
    await swap("u2");
    await swap("u1");
    await act(async () => {
      rejectPatch(new Error("offline"));
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("does not carry a half-typed bundle name into the next account", async () => {
    // BundlePicker keeps its own transient state — the name, the open form,
    // and the saving flag that blocks a second create — and page.jsx does not
    // own it. Left mounted across a switch it hands all three to whoever signs
    // in next, with the create button still disabled behind an in-flight
    // request that is not theirs.
    let resolveCreate;
    vi.stubGlobal("fetch", vi.fn((url, opts = {}) => {
      if (String(url).startsWith("/api/bundles") && opts.method === "POST") {
        return new Promise((r) => { resolveCreate = r; });
      }
      if (String(url).startsWith("/api/bundles")) {
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ bundles: [] }) });
      }
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ words: [] }) });
    }));

    const { rerender } = render(<Luku />);
    await screen.findByText("Photograph a Finnish page");
    fireEvent.click(screen.getByRole("button", { name: /new/i }));
    fireEvent.change(screen.getByLabelText(/new bundle name/i), { target: { value: "Kotimaa" } });
    fireEvent.click(screen.getByRole("button", { name: /create/i }));

    mocks.session = { data: { user: { id: "u2" } }, isPending: false };
    await act(async () => { rerender(<Luku />); });

    // A fresh picker: no open form carrying the previous account's name.
    expect(screen.queryByLabelText(/new bundle name/i)).toBeNull();
    expect(resolveCreate).toBeTypeOf("function");
  });

  it("can still reach a bundle created before any word was saved", async () => {
    // The overlay is the only place a bundle can be deleted, and its launcher
    // used to be gated on the word count — so a bundle made before the first
    // save had no way out of the list.
    mockApi({ words: [], bundles: [KOTIMAA] });
    render(<Luku />);
    fireEvent.click(await screen.findByRole("button", { name: /0 words/i }));

    await screen.findByRole("dialog");
    fireEvent.click(screen.getByRole("button", { name: /^kotimaa \(/i }));
    screen.getByRole("button", { name: /delete bundle/i });
  });

  it("offers a bundle to review by name, with its due count", async () => {
    mockApi({ words: [IN_KOTIMAA, ELSEWHERE], bundles: [KOTIMAA, OTHER] });
    render(<Luku />);

    expect(await screen.findByText("Kotimaa")).toBeTruthy();
    expect(screen.getAllByText("1 due")).toHaveLength(2);
  });

  it("reviews only the words in the bundle that was picked", async () => {
    mockApi({ words: [IN_KOTIMAA, ELSEWHERE], bundles: [KOTIMAA, OTHER] });
    render(<Luku />);

    fireEvent.click(await screen.findByText("Kotimaa"));

    // One card, and it is the bundle's — not the other bundle's word, which is
    // just as overdue.
    expect(screen.getByText("1 / 1")).toBeTruthy();
    expect(screen.getByText("koira")).toBeTruthy();
    expect(screen.queryByText("kissa")).toBeNull();
  });

  it("names the bundle on the review screen", async () => {
    mockApi({ words: [IN_KOTIMAA], bundles: [KOTIMAA] });
    render(<Luku />);

    fireEvent.click(await screen.findByText("Kotimaa"));

    // The scan stage is gone, so the one "Kotimaa" left is the scope chip
    // naming what this session is a review of.
    expect(screen.getAllByText("Kotimaa")).toHaveLength(1);
    expect(screen.getByText("Review")).toBeTruthy();
  });

  it("holds back words added this session from the bundle's due review", async () => {
    // They are due the moment they are saved, and the keep-or-remove pass has
    // not run yet — grading them here would schedule them before triage, which
    // is exactly what the whole-vocabulary queue refuses to do.
    const { ocrLocal } = await import("../lib/ocr.js");
    mocks.translateWord.mockResolvedValue({ base: "koira", translations: ["dog"], formTranslation: "dog", pos: "noun" });
    localStorage.setItem("luku_bundle:u1", "10");
    mockApi({
      bundles: [KOTIMAA],
      saved: { ...WORD, id: 7, base: "koira", translations: ["dog"], bundle_ids: [10] },
    });
    render(<Luku />);
    await screen.findByText("Photograph a Finnish page");

    ocrLocal.mockResolvedValue("Koira juoksee.");
    const input = document.querySelector('input[type="file"]');
    await act(async () => { fireEvent.change(input, { target: { files: [new File(["x"], "p.jpg", { type: "image/jpeg" })] } }); });
    fireEvent.click(await screen.findByRole("button", { name: "Skip crop" }));
    await screen.findByText("Koira");
    await act(async () => { fireEvent.click(screen.getByText("Koira")); });
    fireEvent.click(await screen.findByRole("button", { name: /Add to review list/ }));
    await screen.findByRole("button", { name: "1 new" });

    // Back to Scan, where the bundle launcher lives.
    fireEvent.click(screen.getByText("Luku"));

    // The chip counts it as a word, not as a card due for grading.
    expect(await screen.findByText("Kotimaa")).toBeTruthy();
    expect(screen.getByText("1 word")).toBeTruthy();
    expect(screen.queryByText("1 due")).toBeNull();

    // And the session it starts is the practice pass, which writes no schedule.
    fireEvent.click(screen.getByText("Kotimaa"));
    expect(screen.getByText("Extra practice")).toBeTruthy();
  });

  it("practices a bundle with nothing due instead of showing an empty session", async () => {
    const notDue = { ...IN_KOTIMAA, next_review_at: "2999-01-01T00:00:00.000Z" };
    mockApi({ words: [notDue], bundles: [KOTIMAA] });
    render(<Luku />);

    fireEvent.click(await screen.findByText("Kotimaa"));

    expect(screen.getByText("Extra practice")).toBeTruthy();
    expect(screen.getByText("1 / 1")).toBeTruthy();
  });

  it("saves a word into the bundle being collected into", async () => {
    const { ocrLocal } = await import("../lib/ocr.js");
    localStorage.setItem("luku_bundle:u1", "10");
    mocks.translateWord.mockResolvedValue({ base: "koira", translations: ["dog"], formTranslation: "dog", pos: "noun" });
    const fetchMock = mockApi({
      bundles: [KOTIMAA],
      saved: { ...WORD, id: 2, base: "koira", translations: ["dog"], pos: "noun", bundle_ids: [10] },
    });
    render(<Luku />);
    await screen.findByText("Photograph a Finnish page");

    ocrLocal.mockResolvedValue("Koira juoksee.");
    const input = document.querySelector('input[type="file"]');
    await act(async () => { fireEvent.change(input, { target: { files: [new File(["x"], "p.jpg", { type: "image/jpeg" })] } }); });
    fireEvent.click(await screen.findByRole("button", { name: "Skip crop" }));
    await screen.findByText("Koira");
    await act(async () => { fireEvent.click(screen.getByText("Koira")); });
    fireEvent.click(await screen.findByRole("button", { name: /Add to review list/ }));

    await waitFor(() => {
      const post = fetchMock.mock.calls.find(([url, opts]) => String(url) === "/api/words" && opts?.method === "POST");
      expect(JSON.parse(post[1].body).bundleId).toBe(10);
    });
  });

  it("collects into no bundle when none is picked", async () => {
    const { ocrLocal } = await import("../lib/ocr.js");
    mocks.translateWord.mockResolvedValue({ base: "koira", translations: ["dog"], formTranslation: "dog", pos: "noun" });
    const fetchMock = mockApi({ bundles: [KOTIMAA], saved: { ...WORD, id: 2, base: "koira", translations: ["dog"] } });
    render(<Luku />);
    await screen.findByText("Photograph a Finnish page");

    ocrLocal.mockResolvedValue("Koira juoksee.");
    const input = document.querySelector('input[type="file"]');
    await act(async () => { fireEvent.change(input, { target: { files: [new File(["x"], "p.jpg", { type: "image/jpeg" })] } }); });
    fireEvent.click(await screen.findByRole("button", { name: "Skip crop" }));
    await screen.findByText("Koira");
    await act(async () => { fireEvent.click(screen.getByText("Koira")); });
    fireEvent.click(await screen.findByRole("button", { name: /Add to review list/ }));

    await waitFor(() => {
      const post = fetchMock.mock.calls.find(([url, opts]) => String(url) === "/api/words" && opts?.method === "POST");
      expect(JSON.parse(post[1].body).bundleId).toBeNull();
    });
  });

  it("keeps the words when a bundle is deleted from the word list", async () => {
    const fetchMock = mockApi({ words: [IN_KOTIMAA], bundles: [KOTIMAA] });
    render(<Luku />);

    fireEvent.click(await screen.findByRole("button", { name: "1 words" }));
    fireEvent.click(screen.getByRole("button", { name: "Kotimaa (1)" }));
    fireEvent.click(screen.getByRole("button", { name: /^delete bundle$/i }));
    fireEvent.click(screen.getByRole("button", { name: /delete bundle, keep words/i }));

    await waitFor(() => {
      expect(fetchMock.mock.calls.some(([url, opts]) => String(url) === "/api/bundles?id=10" && opts?.method === "DELETE")).toBe(true);
    });
    // The word is still listed, now in no bundle at all.
    expect(screen.getByText("koira")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /^Kotimaa \(/ })).toBeNull();
  });
});

describe("a deployment whose database is missing the migration", () => {
  beforeEach(() => {
    signedIn();
    localStorage.setItem("luku_api_key", "sk-ant-test");
  });

  /** Both list routes 503 the way the schema guard makes them. */
  function unmigrated() {
    const schemaError = {
      ok: false, status: 503,
      json: () => Promise.resolve({
        error: "This deployment's database is missing a table the app needs — run db/schema.sql against it.",
        schemaOutOfDate: true,
      }),
    };
    const fetchMock = vi.fn((url) => {
      if (String(url).startsWith("/api/words") || String(url).startsWith("/api/bundles")) {
        return Promise.resolve(schemaError);
      }
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({}) });
    });
    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
  }

  it("says what is wrong instead of looking like an empty account", async () => {
    // Before this, the only hint was that the word counters were missing —
    // which is indistinguishable from having saved no words yet.
    unmigrated();
    render(<Luku />);

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toMatch(/db\/schema\.sql/);
  });

  it("still lets the reader scan and read", async () => {
    // The vocabulary is unavailable; the rest of the app is not, so it is not
    // replaced by an error screen.
    unmigrated();
    render(<Luku />);

    await screen.findByRole("alert");
    expect(screen.getByText("Photograph a Finnish page")).toBeTruthy();
  });

  it("does not offer to dismiss a failure that dismissing cannot fix", async () => {
    unmigrated();
    render(<Luku />);

    await screen.findByRole("alert");
    expect(screen.queryByRole("button", { name: "Dismiss" })).toBeNull();
  });

  it("shows nothing once the migration has been run", async () => {
    mockApi({ words: [WORD] });
    render(<Luku />);

    await screen.findByRole("button", { name: "1 words" });
    expect(screen.queryByRole("alert")).toBeNull();
  });
});

describe("a bundle action that fails", () => {
  beforeEach(() => {
    signedIn();
    localStorage.setItem("luku_api_key", "sk-ant-test");
  });

  const KOTIMAA = { id: 10, name: "Kotimaa" };
  const WORDS = [{ ...WORD, id: 5, base: "koira", translations: ["dog"], bundle_ids: [] }];

  /** Loads fine, but refuses the membership edit. */
  function patchFails() {
    const fetchMock = vi.fn((url, opts = {}) => {
      if (String(url).startsWith("/api/words") && opts.method === "PATCH") {
        return Promise.resolve({ ok: false, status: 500, json: () => Promise.resolve({}) });
      }
      if (String(url).startsWith("/api/bundles")) {
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ bundles: [KOTIMAA] }) });
      }
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ words: WORDS }) });
    });
    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
  }

  it("reports the failure and puts the tag back", async () => {
    patchFails();
    render(<Luku />);

    fireEvent.click(await screen.findByRole("button", { name: "1 words" }));
    fireEvent.click(screen.getByRole("button", { name: "Add koira to a bundle" }));
    fireEvent.click(screen.getByRole("button", { name: "+ Kotimaa" }));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toMatch(/could not add that word/i);
    // Rolled back: the word is offered to the bundle again, not shown in it.
    await waitFor(() => expect(screen.getByRole("button", { name: "Add koira to a bundle" })).toBeTruthy());
  });

  it("can be dismissed, unlike a failed load", async () => {
    patchFails();
    render(<Luku />);

    fireEvent.click(await screen.findByRole("button", { name: "1 words" }));
    fireEvent.click(screen.getByRole("button", { name: "Add koira to a bundle" }));
    fireEvent.click(screen.getByRole("button", { name: "+ Kotimaa" }));
    await screen.findByRole("alert");

    fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(screen.queryByRole("alert")).toBeNull();
  });
});

describe("a word that fails to save", () => {
  const SCANNED = "Koira juoksee.";

  beforeEach(() => {
    signedIn();
    localStorage.setItem("luku_api_key", "sk-ant-test");
    mocks.translateWord.mockResolvedValue({ base: "koira", translations: ["dog"], formTranslation: "dog", pos: "noun" });
  });

  /** Everything loads; only the save is refused. */
  function saveFails(body = {}) {
    const fetchMock = vi.fn((url, opts = {}) => {
      if (String(url).startsWith("/api/words") && opts.method === "POST") {
        return Promise.resolve({ ok: false, status: 500, json: () => Promise.resolve(body) });
      }
      if (String(url).startsWith("/api/bundles")) {
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ bundles: [] }) });
      }
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ words: [] }) });
    });
    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
  }

  async function tapAndAdd() {
    const { ocrLocal } = await import("../lib/ocr.js");
    ocrLocal.mockResolvedValue(SCANNED);
    render(<Luku />);
    await screen.findByText("Photograph a Finnish page");
    const input = document.querySelector('input[type="file"]');
    await act(async () => { fireEvent.change(input, { target: { files: [new File(["x"], "p.jpg", { type: "image/jpeg" })] } }); });
    fireEvent.click(await screen.findByRole("button", { name: "Skip crop" }));
    await screen.findByText("Koira");
    await act(async () => { fireEvent.click(screen.getByText("Koira")); });
    fireEvent.click(await screen.findByRole("button", { name: /Add to review list/ }));
  }

  it("does not leave the reader believing the word was saved", async () => {
    // The optimistic tick replaces the Add button, so leaving it up after a
    // failure both misinforms the reader and removes their way to retry.
    saveFails();
    await tapAndAdd();

    await screen.findByRole("alert");
    expect(screen.queryByText("✓ Added to review")).toBeNull();
  });

  it("offers the add again, so the reader can retry", async () => {
    saveFails();
    await tapAndAdd();

    expect(await screen.findByRole("button", { name: /Add to review list/ })).toBeTruthy();
  });

  it("says why, using the server's own message when it sent one", async () => {
    saveFails({ error: "This deployment's database is missing a table the app needs — run db/schema.sql against it." });
    await tapAndAdd();

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toMatch(/db\/schema\.sql/);
  });

  it("falls back to the status when there is no message", async () => {
    saveFails();
    await tapAndAdd();

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toMatch(/Failed to save word \(500\)/);
  });

  it("keeps the word off the new-words bucket", async () => {
    // Nothing was saved, so there is nothing to triage. Waits on the rollback
    // rather than the banner, so it is the bookkeeping being asserted here and
    // not the error reporting the tests above already cover.
    saveFails();
    await tapAndAdd();

    await screen.findByRole("button", { name: /Add to review list/ });
    expect(screen.queryByRole("button", { name: /new$/ })).toBeNull();
  });
});

describe("a word that fails to delete", () => {
  beforeEach(() => {
    signedIn();
    localStorage.setItem("luku_api_key", "sk-ant-test");
  });

  /** The list loads; only the DELETE is refused. */
  function deleteFails(body = {}) {
    const fetchMock = vi.fn((url, opts = {}) => {
      if (String(url).startsWith("/api/words") && opts.method === "DELETE") {
        return Promise.resolve({ ok: false, status: 500, json: () => Promise.resolve(body) });
      }
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ words: [WORD] }) });
    });
    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
  }

  async function openListAndDelete() {
    render(<Luku />);
    fireEvent.click(await screen.findByRole("button", { name: "1 words" }));
    fireEvent.click(await screen.findByRole("button", { name: /^delete$/i }));
    fireEvent.click(await screen.findByRole("button", { name: /sure\?/i }));
  }

  it("says why, rather than putting the row back unexplained", async () => {
    // The rollback alone reads as the delete never having been asked for.
    deleteFails({ error: "This deployment's database is missing a table the app needs — run db/schema.sql against it." });
    await openListAndDelete();

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toMatch(/db\/schema\.sql/);
  });

  it("falls back to naming the action when the server sent no message", async () => {
    deleteFails();
    await openListAndDelete();

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toMatch(/Could not delete that word \(500\)/);
  });
});

describe("a failed delete from the vocabulary overlay", () => {
  beforeEach(() => { signedIn(); localStorage.setItem("luku_api_key", "sk-ant-test"); });

  const openListAndDelete = async (fetchImpl) => {
    vi.stubGlobal("fetch", vi.fn(fetchImpl));
    render(<Luku />);
    fireEvent.click(await screen.findByRole("button", { name: "1 words" }));
    fireEvent.click(await screen.findByRole("button", { name: /^delete$/i }));
    fireEvent.click(await screen.findByRole("button", { name: /sure\?/i }));
  };

  it("reports inside the dialog, not behind its backdrop", async () => {
    // page.jsx's banner sits under a fixed backdrop the dialog declares
    // aria-modal over, so a reader with the overlay open cannot see it — and a
    // test that only asserts role="alert" cannot tell the difference. Assert
    // where it is, not just that it exists.
    await openListAndDelete((url, opts = {}) => {
      if (String(url).startsWith("/api/words") && opts.method === "DELETE") {
        return Promise.resolve({ ok: false, status: 500, json: () => Promise.resolve({ error: "nope" }) });
      }
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ words: [WORD] }) });
    });

    const alert = await screen.findByRole("alert");
    expect(screen.getByRole("dialog").contains(alert)).toBe(true);
  });

  it("stops reporting a failure the retry has since fixed", async () => {
    let fail = true;
    await openListAndDelete((url, opts = {}) => {
      if (String(url).startsWith("/api/words") && opts.method === "DELETE") {
        const first = fail; fail = false;
        return Promise.resolve(first
          ? { ok: false, status: 500, json: () => Promise.resolve({ error: "nope" }) }
          : { ok: true, status: 200, json: () => Promise.resolve({ ok: true }) });
      }
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ words: [WORD] }) });
    });
    await screen.findByRole("alert");

    fireEvent.click(await screen.findByRole("button", { name: /^delete$/i }));
    fireEvent.click(await screen.findByRole("button", { name: /sure\?/i }));

    await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
  });
});

describe("an action failure from a previous account", () => {
  it("does not follow the reader into the next session", async () => {
    // Luku stays mounted while it renders <SignIn />, so the banner outlives a
    // sign-out unless the account change clears it.
    signedIn();
    localStorage.setItem("luku_api_key", "sk-ant-test");
    vi.stubGlobal("fetch", vi.fn((url, opts = {}) => {
      if (String(url).startsWith("/api/words") && opts.method === "DELETE") {
        return Promise.resolve({ ok: false, status: 500, json: () => Promise.resolve({}) });
      }
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ words: [WORD] }) });
    }));

    const { rerender } = render(<Luku />);
    fireEvent.click(await screen.findByRole("button", { name: "1 words" }));
    fireEvent.click(await screen.findByRole("button", { name: /^delete$/i }));
    fireEvent.click(await screen.findByRole("button", { name: /sure\?/i }));
    await screen.findByRole("alert");

    mocks.session = { data: { user: { id: "u2" } }, isPending: false };
    await act(async () => { rerender(<Luku />); });
    await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
  });
});

describe("signing in as someone else", () => {
  const SCANNED = "Koira juoksee.";

  beforeEach(() => {
    signedIn();
    localStorage.setItem("luku_api_key", "sk-ant-test");
  });

  /** Scans a page so there is something on screen that belongs to user u1. */
  async function scanAsFirstAccount() {
    const { ocrLocal } = await import("../lib/ocr.js");
    ocrLocal.mockResolvedValue(SCANNED);
    const view = render(<Luku />);
    await screen.findByText("Photograph a Finnish page");
    const input = document.querySelector('input[type="file"]');
    await act(async () => { fireEvent.change(input, { target: { files: [new File(["x"], "p.jpg", { type: "image/jpeg" })] } }); });
    fireEvent.click(await screen.findByRole("button", { name: "Skip crop" }));
    await screen.findByText("Koira");
    return view;
  }

  const switchTo = async (rerender, id) => {
    mocks.session = { data: { user: { id } }, isPending: false };
    await act(async () => { rerender(<Luku />); });
  };

  it("does not open on the previous account's scanned page", async () => {
    mockApi({ words: [] });
    const { rerender } = await scanAsFirstAccount();

    await switchTo(rerender, "u2");

    expect(screen.queryByText("Koira")).toBeNull();
    await screen.findByText("Photograph a Finnish page");
  });

  it("does not file a translation that answered after the switch under the new account", async () => {
    // The cache is keyed per account, but the setter writes under whoever is
    // signed in when it runs — so the guard has to be at the call site.
    mockApi({ words: [] });
    let resolveLookup;
    mocks.translateWord.mockImplementation(() => new Promise((r) => { resolveLookup = r; }));
    const { rerender } = await scanAsFirstAccount();
    await act(async () => { fireEvent.click(screen.getByText("Koira")); });

    await switchTo(rerender, "u2");
    await act(async () => {
      resolveLookup({ base: "koira", translations: ["dog"], formTranslation: "dog", pos: "noun" });
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(localStorage.getItem("luku_session:u2")).toBeNull();
  });

  it("does not let the last scan's lookup repopulate the next scan's session", async () => {
    // screenRef used to move only on an account change, but an AI re-scan and
    // Scan another both empty the session under the same account.
    // Token keys collide across pages, so a lookup still running from the last
    // one would land its entry on the new page's word.
    let resolveLookup;
    mocks.translateWord.mockImplementation(() => new Promise((r) => { resolveLookup = r; }));
    const { ocrImage } = await import("../lib/api.js");
    ocrImage.mockResolvedValue("Kissa nukkuu.");
    mockApi({ words: [] });

    await scanAsFirstAccount();
    await act(async () => { fireEvent.click(screen.getByText("Koira")); });
    // The AI re-scan replaces the text and empties the session under the very
    // same account — the reachable form of the same reset.
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: /re-scan with ai/i })); });
    await screen.findByText("Kissa");

    await act(async () => {
      resolveLookup({ base: "koira", translations: ["dog"], formTranslation: "dog", pos: "noun" });
      await new Promise((r) => setTimeout(r, 0));
    });

    const stored = JSON.parse(localStorage.getItem("luku_session:u1") || "{}");
    expect(Object.keys(stored)).toHaveLength(0);
  });

  it("does not let an obsolete lookup release the current one's marker", async () => {
    // xlating is the re-entry guard: one lookup at a time. Its cleanup ran
    // unguarded, so a lookup left over from the previous screen cleared the
    // marker the *current* lookup was holding and let a second start beside it.
    const resolvers = [];
    mocks.translateWord.mockImplementation(() => new Promise((r) => { resolvers.push(r); }));
    const { ocrImage } = await import("../lib/api.js");
    ocrImage.mockResolvedValue("Kissa nukkuu.");
    mockApi({ words: [] });

    await scanAsFirstAccount();
    await act(async () => { fireEvent.click(screen.getByText("Koira")); });   // lookup 1
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: /re-scan with ai/i })); });
    await screen.findByText("Kissa");
    await act(async () => { fireEvent.click(screen.getByText("Kissa")); });   // lookup 2, holds the marker

    await act(async () => {
      resolvers[0]({ base: "koira", translations: ["dog"], formTranslation: "dog", pos: "noun" });
      await new Promise((r) => setTimeout(r, 0));
    });
    await act(async () => { fireEvent.click(screen.getByText("nukkuu")); });

    // Still two: lookup 2 has the marker, so the third tap is refused.
    expect(mocks.translateWord).toHaveBeenCalledTimes(2);
  });

  it("does not persist an add that never landed", async () => {
    // The optimistic tick belongs on the popup, which is ephemeral. Written
    // into the session cache it is persisted under the account and survives
    // the sign-out — so a save that fails once the screen is gone leaves the
    // reader told the word is on their list, with no Add button to retry.
    let rejectSave;
    vi.stubGlobal("fetch", vi.fn((url, opts = {}) => {
      if (String(url).startsWith("/api/words") && opts.method === "POST") {
        return new Promise((_r, rej) => { rejectSave = rej; });
      }
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ words: [] }) });
    }));
    mocks.translateWord.mockResolvedValue({ base: "koira", translations: ["dog"], formTranslation: "dog", pos: "noun" });

    const { rerender } = await scanAsFirstAccount();
    await act(async () => { fireEvent.click(screen.getByText("Koira")); });
    fireEvent.click(await screen.findByRole("button", { name: /add to review/i }));

    await switchTo(rerender, "u2");
    await act(async () => {
      rejectSave(new Error("offline"));
      await new Promise((r) => setTimeout(r, 0));
    });

    const stored = JSON.parse(localStorage.getItem("luku_session:u1") || "{}");
    for (const entry of Object.values(stored)) expect(entry.added).not.toBe(true);
  });

  it("does not put the previous account's scan on the next one's screen", async () => {
    // OCR outlives the screen that started it. image.reset() cleared what was
    // drawn but not the run itself, so the old scan still called onTextReady —
    // landing A's photographed page, at the read stage, in front of B.
    const { ocrLocal } = await import("../lib/ocr.js");
    let finishOcr;
    ocrLocal.mockImplementation(() => new Promise((r) => { finishOcr = r; }));
    mockApi({ words: [] });

    const { rerender } = render(<Luku />);
    await screen.findByText("Photograph a Finnish page");
    const input = document.querySelector('input[type="file"]');
    await act(async () => { fireEvent.change(input, { target: { files: [new File(["x"], "p.jpg", { type: "image/jpeg" })] } }); });
    fireEvent.click(await screen.findByRole("button", { name: "Skip crop" }));

    await switchTo(rerender, "u2");
    await act(async () => { finishOcr(SCANNED); await new Promise((r) => setTimeout(r, 0)); });

    expect(screen.queryByText("Koira")).toBeNull();
    await screen.findByText("Photograph a Finnish page");
  });

  it("does not leave a delete from the previous screen blocking the next one", async () => {
    // deletingRef is the re-entry guard. Left holding an id across the switch,
    // the next screen's delete of that word returns immediately and the
    // control stays disabled — silently — until the old request settles.
    let settleDelete;
    vi.stubGlobal("fetch", vi.fn((url, opts = {}) => {
      if (String(url).startsWith("/api/words") && opts.method === "DELETE") {
        return new Promise((r) => { settleDelete = r; });
      }
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ words: [WORD] }) });
    }));

    const { rerender } = render(<Luku />);
    fireEvent.click(await screen.findByRole("button", { name: "1 words" }));
    fireEvent.click(await screen.findByRole("button", { name: /^delete$/i }));
    fireEvent.click(await screen.findByRole("button", { name: /sure\?/i }));

    await switchTo(rerender, "u2");
    await switchTo(rerender, "u1");

    // The same word is on screen again for u1; deleting it must issue a
    // request rather than be swallowed by the previous screen's bookkeeping.
    fireEvent.click(await screen.findByRole("button", { name: "1 words" }));
    fireEvent.click(await screen.findByRole("button", { name: /^delete$/i }));
    fireEvent.click(await screen.findByRole("button", { name: /sure\?/i }));

    await waitFor(() => {
      const deletes = fetch.mock.calls.filter(([, o]) => o?.method === "DELETE");
      expect(deletes.length).toBe(2);
    });
    expect(settleDelete).toBeTypeOf("function");
  });

  it("does not mark a word new when its save lands after signing back in", async () => {
    // The guard used to compare account ids, which cannot tell an
    // A -> B -> A round trip from the original A session: the id matches
    // again, so a save from before the sign-out passes and marks its word
    // "new this session" on a screen that was reset — holding it out of the
    // due queue for a session that never added it.
    let resolveSave;
    vi.stubGlobal("fetch", vi.fn((url, opts = {}) => {
      if (String(url).startsWith("/api/words") && opts.method === "POST") {
        return new Promise((r) => { resolveSave = r; });
      }
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ words: [] }) });
    }));
    mocks.translateWord.mockResolvedValue({ base: "koira", translations: ["dog"], formTranslation: "dog", pos: "noun" });

    const { rerender } = await scanAsFirstAccount();
    await act(async () => { fireEvent.click(screen.getByText("Koira")); });
    fireEvent.click(await screen.findByRole("button", { name: /add to review/i }));

    await switchTo(rerender, "u2");
    await switchTo(rerender, "u1");
    await act(async () => {
      resolveSave({ ok: true, status: 200, json: () => Promise.resolve({ word: { ...WORD, id: 7, base: "koira" } }) });
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(screen.queryByRole("button", { name: /\d+ new/ })).toBeNull();
  });

  it("closes the Telegram panel, which never reloads its own status", async () => {
    // TelegramConnect fetches once on mount, so a panel carried across the
    // switch keeps showing the previous account's linked handle.
    mockApi({ words: [] });
    const { rerender } = render(<Luku />);
    await screen.findByText("Photograph a Finnish page");
    fireEvent.click(screen.getByRole("button", { name: /menu/i }));
    fireEvent.click(await screen.findByRole("menuitem", { name: /telegram/i }));
    await screen.findByRole("dialog");

    await switchTo(rerender, "u2");

    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("does not restore the previous account's word when its delete fails after the switch", async () => {
    let rejectDelete;
    vi.stubGlobal("fetch", vi.fn((url, opts = {}) => {
      if (String(url).startsWith("/api/words") && opts.method === "DELETE") {
        return new Promise((_r, rej) => { rejectDelete = rej; });
      }
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ words: [WORD] }) });
    }));

    const { rerender } = render(<Luku />);
    fireEvent.click(await screen.findByRole("button", { name: "1 words" }));
    fireEvent.click(await screen.findByRole("button", { name: /^delete$/i }));
    fireEvent.click(await screen.findByRole("button", { name: /sure\?/i }));

    await switchTo(rerender, "u2");
    await act(async () => {
      rejectDelete(new Error("offline"));
      await new Promise((r) => setTimeout(r, 0));
    });

    // u2's own load answered with the same fixture, but nothing from u1's
    // rollback may appear: no banner, and no word put back by that catch.
    expect(screen.queryByRole("alert")).toBeNull();
  });
});

