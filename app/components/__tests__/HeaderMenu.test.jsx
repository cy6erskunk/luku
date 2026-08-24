// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import HeaderMenu from "../HeaderMenu.jsx";

afterEach(cleanup);

const setup = (props = {}) => {
  const handlers = { onTelegram: vi.fn(), onChangeKey: vi.fn(), onSignOut: vi.fn(), ...props };
  render(<HeaderMenu {...handlers} />);
  return handlers;
};

const toggle = () => screen.getByRole("button", { name: "Menu" });

describe("HeaderMenu", () => {
  it("keeps the actions hidden until the menu is opened", () => {
    setup();
    expect(screen.queryByRole("menu")).toBeNull();
    expect(toggle().getAttribute("aria-expanded")).toBe("false");

    fireEvent.click(toggle());

    expect(screen.getByRole("menu")).toBeTruthy();
    expect(toggle().getAttribute("aria-expanded")).toBe("true");
    for (const name of ["Telegram", "API key", "Sign out"]) {
      expect(screen.getByRole("menuitem", { name })).toBeTruthy();
    }
  });

  it.each([
    ["Telegram", "onTelegram"],
    ["API key", "onChangeKey"],
    ["Sign out", "onSignOut"],
  ])("runs %s and closes", (name, prop) => {
    const handlers = setup();
    fireEvent.click(toggle());
    fireEvent.click(screen.getByRole("menuitem", { name }));

    expect(handlers[prop]).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("closes on an outside press but not on a press inside the menu", () => {
    setup();
    fireEvent.click(toggle());

    fireEvent.mouseDown(screen.getByRole("menu"));
    expect(screen.queryByRole("menu")).toBeTruthy();

    fireEvent.mouseDown(document.body);
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("closes on Escape and returns focus to the toggle", () => {
    setup();
    fireEvent.click(toggle());

    fireEvent.keyDown(document, { key: "Escape" });

    expect(screen.queryByRole("menu")).toBeNull();
    expect(document.activeElement).toBe(toggle());
  });

  it("stops clicks from reaching the page behind it", () => {
    const onBackdrop = vi.fn();
    const { container } = render(
      <div onClick={onBackdrop}><HeaderMenu onTelegram={vi.fn()} onChangeKey={vi.fn()} onSignOut={vi.fn()} /></div>
    );
    const btn = container.querySelector('button[aria-label="Menu"]');
    fireEvent.click(btn);
    expect(onBackdrop).not.toHaveBeenCalled();
  });
});
