// @vitest-environment jsdom
/**
 * The connect panel. The cases that matter are the ones CLAUDE.md's checklist
 * for request-waiting UI names: a token shown once and only once, a failure
 * reported where the reader can actually reach it, and a reply landing after
 * the panel is gone writing to nothing while still telling what was lost.
 */
import { StrictMode } from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor, act } from "@testing-library/react";
import McpConnect from "../McpConnect.jsx";

const ENDPOINT = "https://luku.test/api/mcp";
const TOKEN = "luku_mcp_ZXhhbXBsZXRva2VudmFsdWU";

const jsonOk = (body) => ({ ok: true, json: () => Promise.resolve(body) });

/** Routes fetch by method so GET/POST/DELETE can be driven independently. */
function stubApi({ tokens = [], post, del } = {}) {
  const calls = [];
  vi.stubGlobal("fetch", vi.fn((url, opts = {}) => {
    const method = opts.method ?? "GET";
    calls.push({ url, method, body: opts.body });
    if (method === "POST") return Promise.resolve(post ?? jsonOk({ token: TOKEN, id: "abcdef12" }));
    if (method === "DELETE") return Promise.resolve(del ?? jsonOk({ ok: true }));
    return Promise.resolve(jsonOk({ tokens: typeof tokens === "function" ? tokens(calls.length) : tokens }));
  }));
  return calls;
}

const setup = (props = {}) =>
  render(<McpConnect endpoint={ENDPOINT} onClose={() => {}} {...props} />);

beforeEach(() => {
  vi.stubGlobal("navigator", { clipboard: { writeText: vi.fn(() => Promise.resolve()) } });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("minting", () => {
  it("shows the token once and says it will not be shown again", async () => {
    stubApi();
    setup();

    fireEvent.click(await screen.findByRole("button", { name: "Create a token" }));

    expect(await screen.findByText(TOKEN)).toBeTruthy();
    expect(screen.getByText(/not shown again/i)).toBeTruthy();
  });

  it("sends the label the reader typed", async () => {
    const calls = stubApi();
    setup();

    fireEvent.change(await screen.findByLabelText(/what is connecting/i), {
      target: { value: "Claude Desktop" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create a token" }));

    await waitFor(() => expect(calls.some((c) => c.method === "POST")).toBe(true));
    const post = calls.find((c) => c.method === "POST");
    expect(JSON.parse(post.body)).toEqual({ label: "Claude Desktop" });
  });

  it("stops showing the token once the reader is done with it", async () => {
    stubApi();
    setup();

    fireEvent.click(await screen.findByRole("button", { name: "Create a token" }));
    fireEvent.click(await screen.findByRole("button", { name: "Done" }));

    await waitFor(() => expect(screen.queryByText(TOKEN)).toBeNull());
  });

  it("puts the real token in the command, so setup is one copy not two", async () => {
    stubApi();
    setup();

    fireEvent.click(await screen.findByRole("button", { name: "Create a token" }));

    const command = await screen.findByText(new RegExp(`claude mcp add .*${ENDPOINT}`));
    expect(command.textContent).toContain(TOKEN);
    expect(command.textContent).not.toContain("<token>");
  });

  it("copies the token and the whole command separately", async () => {
    stubApi();
    setup();

    fireEvent.click(await screen.findByRole("button", { name: "Create a token" }));
    fireEvent.click(await screen.findByRole("button", { name: "Copy token" }));

    await waitFor(() => expect(navigator.clipboard.writeText).toHaveBeenCalledWith(TOKEN));

    fireEvent.click(await screen.findByRole("button", { name: "Copy command" }));

    await waitFor(() => {
      const copied = navigator.clipboard.writeText.mock.calls.at(-1)[0];
      expect(copied).toContain("claude mcp add");
      expect(copied).toContain(TOKEN);
    });
  });

  it("gives the connector route for Desktop, claude.ai and mobile", async () => {
    stubApi();
    setup();

    fireEvent.click(await screen.findByRole("button", { name: "Create a token" }));

    expect(await screen.findByText(/Customize → Connectors/)).toBeTruthy();
    expect(screen.getByText(/No sign-in/)).toBeTruthy();
  });

  it("offers the header value with the Bearer scheme already in it", async () => {
    // Claude sends a request header verbatim and prepends no scheme, so a bare
    // token arrives as `Authorization: luku_mcp_…` and the server refuses it.
    stubApi();
    setup();

    fireEvent.click(await screen.findByRole("button", { name: "Create a token" }));
    fireEvent.click(await screen.findByRole("button", { name: "Copy header value" }));

    await waitFor(() =>
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith(`Bearer ${TOKEN}`));
  });

  it("stops showing the token once that very token is revoked", async () => {
    // Otherwise the "copy it now" box keeps offering a dead credential.
    stubApi({ tokens: [{ id: "abcdef12", label: "Laptop", last_used_at: null }] });
    setup();

    fireEvent.click(await screen.findByRole("button", { name: "Create a token" }));
    expect(await screen.findByText(TOKEN)).toBeTruthy();

    fireEvent.click(await screen.findByRole("button", { name: /Revoke Laptop/ }));

    await waitFor(() => expect(screen.queryByText(TOKEN)).toBeNull());
  });

  it("keeps showing the token when a different client is revoked", async () => {
    stubApi({ tokens: [{ id: "99999999", label: "Old laptop", last_used_at: null }] });
    setup();

    fireEvent.click(await screen.findByRole("button", { name: "Create a token" }));
    expect(await screen.findByText(TOKEN)).toBeTruthy();

    fireEvent.click(await screen.findByRole("button", { name: /Revoke Old laptop/ }));

    await waitFor(() => expect(screen.queryByText("Old laptop")).toBeNull());
    expect(screen.getByText(TOKEN)).toBeTruthy();
  });
});

describe("failures", () => {
  it("reports hitting the connection cap inside the dialog", async () => {
    stubApi({ post: { ok: false, status: 409, json: () => Promise.resolve({ error: "At most 20 connections. Revoke one first." }) } });
    setup();

    fireEvent.click(await screen.findByRole("button", { name: "Create a token" }));

    expect((await screen.findByRole("alert")).textContent).toContain("At most 20");
  });

  it("reports a refused mint inside the dialog, where the reader can reach it", async () => {
    // The page banner is a sibling of this overlay, so it would sit outside
    // the focus trap and inside the subtree aria-modal declares inert.
    stubApi({ post: { ok: false, json: () => Promise.resolve({ error: "Nope" }) } });
    setup();

    fireEvent.click(await screen.findByRole("button", { name: "Create a token" }));

    expect((await screen.findByRole("alert")).textContent).toContain("Nope");
  });

  it("reports a failed load rather than looking like an account with nothing connected", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve({ ok: false, status: 500, json: () => Promise.resolve({}) })));
    setup();

    expect(await screen.findByRole("alert")).toBeTruthy();
  });

  it("reports a refused revoke and leaves the client listed", async () => {
    stubApi({
      tokens: [{ id: "abcdef12", label: "Laptop", last_used_at: null }],
      del: { ok: false, status: 500, json: () => Promise.resolve({}) },
    });
    setup();

    fireEvent.click(await screen.findByRole("button", { name: /Revoke Laptop/ }));

    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(screen.getByText("Laptop")).toBeTruthy();
  });

  it("still shows the token under Strict Mode's double effect run", async () => {
    // The App Router runs every effect setup -> cleanup -> setup in
    // development. A mounted ref that is only cleared on cleanup reads false
    // for the rest of the component's life, and every mint then reports itself
    // lost instead of showing the token.
    stubApi();
    const onLost = vi.fn();
    render(
      <StrictMode>
        <McpConnect endpoint={ENDPOINT} onClose={() => {}} onLost={onLost} />
      </StrictMode>,
    );

    fireEvent.click(await screen.findByRole("button", { name: "Create a token" }));

    expect(await screen.findByText(TOKEN)).toBeTruthy();
    expect(onLost).not.toHaveBeenCalled();
  });

  it("does not claim a token was lost when the mint that failed stored nothing", async () => {
    // A refused mint created no row, so sending the reader off to revoke an
    // orphaned token would point them at something that does not exist.
    let release;
    const pending = new Promise((resolve) => { release = resolve; });
    vi.stubGlobal("fetch", vi.fn((url, opts = {}) =>
      (opts.method === "POST" ? pending : Promise.resolve(jsonOk({ tokens: [] })))));

    const onLost = vi.fn();
    setup({ onLost });

    fireEvent.click(await screen.findByRole("button", { name: "Create a token" }));
    cleanup();
    await act(async () => {
      release({ ok: false, status: 401, json: () => Promise.resolve({ error: "Unauthorized" }) });
      await pending;
    });

    expect(onLost).not.toHaveBeenCalled();
  });

  it("tells what was lost when a mint lands after the panel is gone", async () => {
    // A token minted but never displayed is a row the reader cannot use and
    // cannot recognise in the list, so the loss has to outlive the panel.
    let release;
    const pending = new Promise((resolve) => { release = resolve; });
    vi.stubGlobal("fetch", vi.fn((url, opts = {}) =>
      (opts.method === "POST" ? pending : Promise.resolve(jsonOk({ tokens: [] })))));

    const onLost = vi.fn();
    setup({ onLost });

    fireEvent.click(await screen.findByRole("button", { name: "Create a token" }));
    cleanup();
    await act(async () => { release(jsonOk({ token: TOKEN })); await pending; });

    expect(onLost).toHaveBeenCalled();
  });
});

describe("the connected list", () => {
  it("lists a connected client and when it was last used", async () => {
    stubApi({ tokens: [{ id: "abcdef12", label: "Laptop", last_used_at: "2026-10-01T10:00:00.000Z" }] });
    setup();

    expect(await screen.findByText("Laptop")).toBeTruthy();
    expect(screen.getByText(/Last used/)).toBeTruthy();
  });

  it("says so when a client has never been used, rather than showing nothing", async () => {
    stubApi({ tokens: [{ id: "abcdef12", label: "Laptop", last_used_at: null }] });
    setup();

    expect(await screen.findByText("Never used")).toBeTruthy();
  });

  it("names an unlabelled client rather than rendering a blank row", async () => {
    stubApi({ tokens: [{ id: "abcdef12", label: null, last_used_at: null }] });
    setup();

    expect(await screen.findByText("Unnamed client")).toBeTruthy();
  });

  it("drops a revoked client from the list", async () => {
    stubApi({ tokens: [{ id: "abcdef12", label: "Laptop", last_used_at: null }] });
    setup();

    fireEvent.click(await screen.findByRole("button", { name: /Revoke Laptop/ }));

    await waitFor(() => expect(screen.queryByText("Laptop")).toBeNull());
  });

  it("revokes by the short id, which is all the browser is given", async () => {
    const calls = stubApi({ tokens: [{ id: "abcdef12", label: "Laptop", last_used_at: null }] });
    setup();

    fireEvent.click(await screen.findByRole("button", { name: /Revoke Laptop/ }));

    await waitFor(() => expect(calls.some((c) => c.method === "DELETE")).toBe(true));
    expect(calls.find((c) => c.method === "DELETE").url).toContain("id=abcdef12");
  });
});

describe("the dialog contract", () => {
  it("closes on a click outside the panel", async () => {
    stubApi();
    const onClose = vi.fn();
    setup({ onClose });

    fireEvent.click(await screen.findByTestId("mcp-backdrop"));

    expect(onClose).toHaveBeenCalled();
  });

  it("does not close on a click inside the panel", async () => {
    stubApi();
    const onClose = vi.fn();
    setup({ onClose });

    fireEvent.click(await screen.findByRole("dialog"));

    expect(onClose).not.toHaveBeenCalled();
  });

  it("closes on Escape, through the one global handler meant to win", async () => {
    // useDialog catches Escape on document in the capture phase and stops it,
    // so HeaderMenu's listener does not also fire and close two things.
    stubApi();
    const onClose = vi.fn();
    setup({ onClose });
    await screen.findByRole("dialog");

    fireEvent.keyDown(document, { key: "Escape" });

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("is a modal dialog with an accessible name", async () => {
    stubApi();
    setup();

    const dialog = await screen.findByRole("dialog");
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    expect(screen.getByText("Refine with Claude")).toBeTruthy();
  });
});
