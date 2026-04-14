// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import SignIn from "../SignIn.jsx";

afterEach(cleanup);

vi.mock("../lib/authClient", () => ({
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
});
