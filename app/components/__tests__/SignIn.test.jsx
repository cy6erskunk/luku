// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import SignIn, { AUTH_UNAVAILABLE } from "../SignIn.jsx";
import { authClient } from "../../lib/authClient";

afterEach(cleanup);

vi.mock("../../lib/report.js", () => ({ reportClientError: vi.fn() }));
vi.mock("../../lib/authClient", () => ({
  authClient: {
    signIn: { social: vi.fn(), email: vi.fn() },
    signUp: { email: vi.fn() },
  },
}));

describe("SignIn", () => {
  it("renders the main screen with social and email buttons", () => {
    render(<SignIn />);
    expect(screen.getByRole("button", { name: /continue with google/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /continue with github/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /sign in with email/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /create account/i })).toBeTruthy();
  });

  it("switches to sign-in form when 'Sign in with email' is clicked", () => {
    render(<SignIn />);
    fireEvent.click(screen.getByRole("button", { name: /sign in with email/i }));
    expect(screen.getByPlaceholderText("Email")).toBeTruthy();
    expect(screen.getByPlaceholderText("Password")).toBeTruthy();
    expect(screen.getByRole("button", { name: /^sign in$/i })).toBeTruthy();
  });

  it("switches to sign-up form when 'Create account' is clicked", () => {
    render(<SignIn />);
    fireEvent.click(screen.getByRole("button", { name: /create account/i }));
    expect(screen.getByPlaceholderText("Name (optional)")).toBeTruthy();
    expect(screen.getByRole("button", { name: /^create account$/i })).toBeTruthy();
  });

  it("returns to main screen from sign-in form via Back button", () => {
    render(<SignIn />);
    fireEvent.click(screen.getByRole("button", { name: /sign in with email/i }));
    fireEvent.click(screen.getByRole("button", { name: /← back/i }));
    expect(screen.getByRole("button", { name: /continue with google/i })).toBeTruthy();
  });

  it("returns to main screen from sign-up form via Back button", () => {
    render(<SignIn />);
    fireEvent.click(screen.getByRole("button", { name: /create account/i }));
    fireEvent.click(screen.getByRole("button", { name: /← back/i }));
    expect(screen.getByRole("button", { name: /continue with google/i })).toBeTruthy();
  });

  it("sign-in button is disabled when email or password is empty", () => {
    render(<SignIn />);
    fireEvent.click(screen.getByRole("button", { name: /sign in with email/i }));
    expect(screen.getByRole("button", { name: /^sign in$/i }).disabled).toBe(true);
  });

  it("sign-in button is enabled when both email and password are filled", () => {
    render(<SignIn />);
    fireEvent.click(screen.getByRole("button", { name: /sign in with email/i }));
    fireEvent.change(screen.getByPlaceholderText("Email"), { target: { value: "a@b.com" } });
    fireEvent.change(screen.getByPlaceholderText("Password"), { target: { value: "secret" } });
    expect(screen.getByRole("button", { name: /^sign in$/i }).disabled).toBe(false);
  });

  it("shows a sentence, not the status line, when the auth server fails", async () => {
    // What the auth client returns when the server's body has no `message`.
    authClient.signIn.social.mockResolvedValueOnce({ error: { status: 500, message: "HTTP 500 " } });
    render(<SignIn />);
    fireEvent.click(screen.getByRole("button", { name: /continue with google/i }));

    expect(await screen.findByText(AUTH_UNAVAILABLE)).toBeTruthy();
    expect(screen.queryByText(/HTTP 500/)).toBeNull();
  });

  it("keeps the server's message for a refusal meant for the reader", async () => {
    authClient.signIn.email.mockResolvedValueOnce({ error: { status: 401, message: "Invalid email or password" } });
    render(<SignIn />);
    fireEvent.click(screen.getByRole("button", { name: /sign in with email/i }));
    fireEvent.change(screen.getByPlaceholderText("Email"), { target: { value: "a@b.com" } });
    fireEvent.change(screen.getByPlaceholderText("Password"), { target: { value: "wrong" } });
    fireEvent.click(screen.getByRole("button", { name: /^sign in$/i }));

    expect(await screen.findByText("Invalid email or password")).toBeTruthy();
  });
});
