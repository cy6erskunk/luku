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
    // The activated item unmounts with the menu, so focus has to be handed
    // back rather than left on <body>.
    expect(document.activeElement).toBe(toggle());
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

  it("moves focus into the menu when it opens", () => {
    setup();
    fireEvent.click(toggle());

    expect(document.activeElement).toBe(screen.getByRole("menuitem", { name: "Telegram" }));
    // One tab stop: only the focused item is reachable with Tab.
    const tabbable = screen
      .getAllByRole("menuitem")
      .filter((el) => el.getAttribute("tabindex") === "0");
    expect(tabbable).toEqual([screen.getByRole("menuitem", { name: "Telegram" })]);
  });

  it.each([
    ["ArrowDown", "Telegram"],
    ["ArrowUp", "Sign out"],
  ])("opens on %s from the toggle and focuses %s", (key, name) => {
    setup();
    toggle().focus();

    fireEvent.keyDown(toggle(), { key });

    expect(screen.getByRole("menu")).toBeTruthy();
    expect(document.activeElement).toBe(screen.getByRole("menuitem", { name }));
  });

  it("walks the items with the arrow keys and wraps at both ends", () => {
    setup();
    fireEvent.click(toggle());
    const menu = screen.getByRole("menu");
    const at = (name) => document.activeElement === screen.getByRole("menuitem", { name });

    fireEvent.keyDown(menu, { key: "ArrowDown" });
    expect(at("API key")).toBe(true);
    fireEvent.keyDown(menu, { key: "ArrowDown" });
    expect(at("Sign out")).toBe(true);
    fireEvent.keyDown(menu, { key: "ArrowDown" });
    expect(at("Telegram")).toBe(true);
    fireEvent.keyDown(menu, { key: "ArrowUp" });
    expect(at("Sign out")).toBe(true);
  });

  it("jumps to the first and last item with Home and End", () => {
    setup();
    fireEvent.click(toggle());
    const menu = screen.getByRole("menu");

    fireEvent.keyDown(menu, { key: "End" });
    expect(document.activeElement).toBe(screen.getByRole("menuitem", { name: "Sign out" }));

    fireEvent.keyDown(menu, { key: "Home" });
    expect(document.activeElement).toBe(screen.getByRole("menuitem", { name: "Telegram" }));
  });

  it("closes on Tab and hands focus back so the tab sequence continues", () => {
    setup();
    fireEvent.click(toggle());

    // Not prevented — the browser moves on from wherever focus sits.
    const notPrevented = fireEvent.keyDown(screen.getByRole("menu"), { key: "Tab" });

    expect(notPrevented).toBe(true);
    expect(screen.queryByRole("menu")).toBeNull();
    expect(document.activeElement).toBe(toggle());
  });

  it("names the menu after the toggle that opens it", () => {
    setup();
    fireEvent.click(toggle());

    const menu = screen.getByRole("menu");
    expect(menu.getAttribute("aria-labelledby")).toBe(toggle().id);
    expect(toggle().getAttribute("aria-controls")).toBe(menu.id);
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
