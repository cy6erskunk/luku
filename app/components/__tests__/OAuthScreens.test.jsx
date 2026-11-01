// @vitest-environment jsdom
/**
 * The login and consent pages of the MCP connection flow. The auth client is
 * mocked at its boundary; what is under test is that each page resumes the
 * authorization through the right call, refuses to pretend there is one to
 * resume when Neon did not send the reader here, and says so when a call
 * fails rather than leaving a dead button.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";

const mocks = vi.hoisted(() => ({
  session: { data: null, isPending: false },
  continue: vi.fn(),
  consent: vi.fn(),
  publicClient: vi.fn(),
  signOut: vi.fn(),
  report: vi.fn(),
}));

vi.mock("../../lib/authClient", () => ({
  authClient: {
    useSession: () => mocks.session,
    signOut: mocks.signOut,
    signIn: { social: vi.fn(), email: vi.fn() },
    signUp: { email: vi.fn() },
    oauth2: { continue: mocks.continue, consent: mocks.consent, publicClient: mocks.publicClient },
  },
}));
vi.mock("../../lib/report.js", () => ({ reportClientError: mocks.report }));

const { OAuthLogin, OAuthConsent } = await import("../OAuthScreens.jsx");

const SIGNED = "?client_id=https%3A%2F%2Fclaude.ai%2Fclient.json&scope=openid&sig=abc&ba_param=x";
const at = (search) => window.history.replaceState(null, "", `/oauth/login${search}`);
const signedIn = () => { mocks.session = { data: { user: { id: "u1", email: "reader@example.com" } }, isPending: false }; };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.session = { data: null, isPending: false };
  mocks.publicClient.mockResolvedValue({ data: { client_name: "Claude" } });
});
afterEach(cleanup);

describe("OAuthLogin", () => {
  it("explains itself instead of resuming anything when Neon did not send the reader", async () => {
    at("");
    signedIn();
    render(<OAuthLogin />);

    expect(await screen.findByText(/start from that app/i)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /continue$/i })).toBeNull();
  });

  it("shows the sign-in screen, with its reason, when signed out", async () => {
    at(SIGNED);
    render(<OAuthLogin />);

    expect(await screen.findByText(/read and refine your luku cards/i)).toBeTruthy();
    expect(screen.getByRole("button", { name: /continue with google/i })).toBeTruthy();
  });

  it("resumes the authorization as the signed-in account", async () => {
    at(SIGNED);
    signedIn();
    // A relative URL, so jsdom can follow it without a cross-origin navigation.
    mocks.continue.mockResolvedValue({ data: { redirect: true, url: "/oauth/consent?sig=def" } });
    render(<OAuthLogin />);

    fireEvent.click(await screen.findByRole("button", { name: /^continue$/i }));

    await waitFor(() => expect(mocks.continue).toHaveBeenCalledWith({ selected: true }));
    expect(screen.getByText("reader@example.com")).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("says so, and re-enables the button, when continuing fails", async () => {
    at(SIGNED);
    signedIn();
    mocks.continue.mockResolvedValue({ error: { status: 400, message: "missing oauth query" } });
    render(<OAuthLogin />);

    fireEvent.click(await screen.findByRole("button", { name: /^continue$/i }));

    expect((await screen.findByRole("alert")).textContent).toMatch(/could not continue/i);
    expect(mocks.report).toHaveBeenCalled();
    expect(screen.getByRole("button", { name: /^continue$/i }).disabled).toBe(false);
  });

  it.each([["prompt=login", "&prompt=login"], ["max_age", "&max_age=0"]])(
    "asks for a fresh sign-in instead of continuing when the client sends %s", async (_label, extra) => {
      // Continuing with the existing session would land straight back here.
      at(SIGNED + extra);
      signedIn();
      render(<OAuthLogin />);

      expect(await screen.findByText(/sign in again/i)).toBeTruthy();
      expect(screen.queryByRole("button", { name: /^continue$/i })).toBeNull();
    },
  );

  it("says so, rather than leaving a dead button, when the reply has nowhere to go", async () => {
    at(SIGNED);
    signedIn();
    mocks.continue.mockResolvedValue({ data: { redirect: false } });
    render(<OAuthLogin />);

    fireEvent.click(await screen.findByRole("button", { name: /^continue$/i }));

    expect((await screen.findByRole("alert")).textContent).toMatch(/could not continue/i);
    expect(screen.getByRole("button", { name: /^continue$/i }).disabled).toBe(false);
  });

  it("reports a sign-out that fails instead of dropping it", async () => {
    at(SIGNED);
    signedIn();
    mocks.signOut.mockResolvedValue({ error: { status: 500, message: "down" } });
    render(<OAuthLogin />);

    fireEvent.click(await screen.findByRole("button", { name: /different account/i }));

    expect((await screen.findByRole("alert")).textContent).toMatch(/could not sign out/i);
    expect(mocks.report).toHaveBeenCalled();
  });

  it("offers another account by signing out, keeping the signed query", async () => {
    at(SIGNED);
    signedIn();
    render(<OAuthLogin />);

    fireEvent.click(await screen.findByRole("button", { name: /different account/i }));

    expect(mocks.signOut).toHaveBeenCalled();
    expect(window.location.search).toBe(SIGNED);
  });
});

describe("OAuthConsent", () => {
  it("names the client and what it will be able to change", async () => {
    at(SIGNED);
    signedIn();
    render(<OAuthConsent />);

    expect(await screen.findByText("Claude")).toBeTruthy();
    expect(mocks.publicClient).toHaveBeenCalledWith({ query: { client_id: "https://claude.ai/client.json" } });
    expect(screen.getByText(/cannot\s+reschedule, rename or delete/i)).toBeTruthy();
  });

  it("shows where approving sends the code, which a client's self-chosen name cannot hide", async () => {
    at("?client_id=abc123&redirect_uri=https%3A%2F%2Fevil.example%2Fcallback&sig=abc");
    signedIn();
    mocks.publicClient.mockResolvedValue({ data: { client_name: "Claude" } });
    render(<OAuthConsent />);

    expect(await screen.findByText("Claude")).toBeTruthy();
    expect(screen.getByText(/sends you back to evil\.example/i)).toBeTruthy();
  });

  it("falls back to a generic name when the client cannot be looked up", async () => {
    at(SIGNED);
    signedIn();
    mocks.publicClient.mockRejectedValue(new Error("network"));
    render(<OAuthConsent />);

    expect(await screen.findByText("An app")).toBeTruthy();
    await waitFor(() => expect(mocks.report).toHaveBeenCalled());
  });

  it.each([["Allow", true], ["Deny", false]])("answers %s with accept: %s", async (label, accept) => {
    at(SIGNED);
    signedIn();
    mocks.consent.mockResolvedValue({ data: { redirect: true, url: "/done" } });
    render(<OAuthConsent />);

    fireEvent.click(await screen.findByRole("button", { name: label }));

    await waitFor(() => expect(mocks.consent).toHaveBeenCalledWith({ accept }));
  });

  it("says so when the answer cannot be sent", async () => {
    at(SIGNED);
    signedIn();
    mocks.consent.mockRejectedValue(new Error("network"));
    render(<OAuthConsent />);

    fireEvent.click(await screen.findByRole("button", { name: "Allow" }));

    expect((await screen.findByRole("alert")).textContent).toMatch(/could not send your answer/i);
  });
});
