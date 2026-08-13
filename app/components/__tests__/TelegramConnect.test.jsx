// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import TelegramConnect from "../TelegramConnect.jsx";

const UNLINKED = { linked: false };
const LINKED = {
  linked: true,
  username: "matti",
  remindersEnabled: true,
  reminderHour: 9,
  timezone: "Europe/Helsinki",
};

/** Routes fetch by method so the component's GET/POST/DELETE can be driven independently. */
function stubApi({ status = UNLINKED, post, del } = {}) {
  const calls = [];
  vi.stubGlobal("fetch", vi.fn((url, opts = {}) => {
    const method = opts.method ?? "GET";
    calls.push({ url, method });
    if (method === "POST") return Promise.resolve(post ?? { ok: true, json: () => Promise.resolve({}) });
    if (method === "DELETE") return Promise.resolve(del ?? { ok: true, json: () => Promise.resolve({ ok: true }) });
    const body = typeof status === "function" ? status(calls.length) : status;
    return Promise.resolve({ ok: true, json: () => Promise.resolve(body) });
  }));
  return calls;
}

const jsonOk = (body) => ({ ok: true, json: () => Promise.resolve(body) });

beforeEach(() => {
  vi.stubGlobal("open", vi.fn());
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("TelegramConnect — unlinked", () => {
  it("offers a connect button", async () => {
    stubApi();
    render(<TelegramConnect onClose={() => {}} />);
    expect(await screen.findByRole("button", { name: /connect telegram/i })).toBeTruthy();
  });

  it("opens the deep link returned by the server", async () => {
    stubApi({ post: jsonOk({ url: "https://t.me/LukuTestBot?start=abc", code: "abc" }) });
    render(<TelegramConnect onClose={() => {}} />);

    fireEvent.click(await screen.findByRole("button", { name: /connect telegram/i }));

    await waitFor(() => expect(window.open).toHaveBeenCalledWith("https://t.me/LukuTestBot?start=abc", "_blank", "noopener"));
  });

  it("shows the /link fallback once a code is outstanding", async () => {
    stubApi({ post: jsonOk({ url: "https://t.me/b?start=abc", code: "abc" }) });
    render(<TelegramConnect onClose={() => {}} />);

    fireEvent.click(await screen.findByRole("button", { name: /connect telegram/i }));

    expect(await screen.findByText(/\/link abc/)).toBeTruthy();
    expect(screen.getByText(/expires in 10 minutes/i)).toBeTruthy();
  });

  it("surfaces a server error instead of opening a window", async () => {
    stubApi({ post: { ok: false, status: 503, json: () => Promise.resolve({ error: "Telegram bot is not configured" }) } });
    render(<TelegramConnect onClose={() => {}} />);

    fireEvent.click(await screen.findByRole("button", { name: /connect telegram/i }));

    expect(await screen.findByText(/not configured/i)).toBeTruthy();
    expect(window.open).not.toHaveBeenCalled();
  });

  it("flips to connected when polling sees the bot claim the code", async () => {
    vi.useFakeTimers();
    // First GET reports unlinked; every later GET reports linked.
    stubApi({
      status: (n) => (n === 1 ? UNLINKED : LINKED),
      post: jsonOk({ url: "https://t.me/b?start=abc", code: "abc" }),
    });
    render(<TelegramConnect onClose={() => {}} />);

    await vi.waitFor(() => screen.getByRole("button", { name: /connect telegram/i }));
    fireEvent.click(screen.getByRole("button", { name: /connect telegram/i }));
    await vi.waitFor(() => screen.getByText(/\/link abc/));

    await vi.advanceTimersByTimeAsync(2000);

    await vi.waitFor(() => expect(screen.getByText(/connected as @matti/i)).toBeTruthy());
    vi.useRealTimers();
  });
});

describe("TelegramConnect — linked", () => {
  it("shows the account and reminder schedule", async () => {
    stubApi({ status: LINKED });
    render(<TelegramConnect onClose={() => {}} />);

    expect(await screen.findByText(/connected as @matti/i)).toBeTruthy();
    expect(screen.getByText(/09:00 \(Europe\/Helsinki\)/)).toBeTruthy();
  });

  it("says so when reminders are paused", async () => {
    stubApi({ status: { ...LINKED, remindersEnabled: false } });
    render(<TelegramConnect onClose={() => {}} />);
    expect(await screen.findByText(/reminders are paused/i)).toBeTruthy();
  });

  it("requires confirmation before disconnecting", async () => {
    const calls = stubApi({ status: LINKED });
    render(<TelegramConnect onClose={() => {}} />);

    fireEvent.click(await screen.findByRole("button", { name: /^disconnect$/i }));
    expect(calls.some((c) => c.method === "DELETE")).toBe(false);

    fireEvent.click(screen.getByRole("button", { name: /really disconnect/i }));
    await waitFor(() => expect(calls.some((c) => c.method === "DELETE")).toBe(true));
    expect(await screen.findByRole("button", { name: /connect telegram/i })).toBeTruthy();
  });

  it("can back out of disconnecting", async () => {
    const calls = stubApi({ status: LINKED });
    render(<TelegramConnect onClose={() => {}} />);

    fireEvent.click(await screen.findByRole("button", { name: /^disconnect$/i }));
    fireEvent.click(screen.getByRole("button", { name: /cancel/i }));

    expect(screen.getByRole("button", { name: /^disconnect$/i })).toBeTruthy();
    expect(calls.some((c) => c.method === "DELETE")).toBe(false);
  });
});

describe("TelegramConnect — dismissal", () => {
  it("closes on the backdrop and the ✕ button but not on the panel", async () => {
    stubApi({ status: LINKED });
    const onClose = vi.fn();
    render(<TelegramConnect onClose={onClose} />);

    await screen.findByText(/connected as @matti/i);

    fireEvent.click(screen.getByRole("dialog"));
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.click(screen.getByLabelText("Close"));
    expect(onClose).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByTestId("telegram-backdrop"));
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
