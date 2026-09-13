// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import Notice from "../Notice.jsx";

afterEach(cleanup);

describe("Notice", () => {
  it("renders nothing without a message", () => {
    const { container } = render(<Notice message="" />);
    expect(container.firstChild).toBeNull();
  });

  it("announces the message to assistive technology", () => {
    render(<Notice message="Couldn't load your word list." />);
    expect(screen.getByRole("alert").textContent).toContain("Couldn't load your word list.");
  });

  it("offers no controls the caller did not hand it", () => {
    render(<Notice message="Something went wrong." />);
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("names the dismiss control, which carries only a glyph", () => {
    const onDismiss = vi.fn();
    render(<Notice message="Something went wrong." onDismiss={onDismiss} />);
    fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("keeps a click on its own controls off the page behind it", () => {
    // page.jsx closes the translation popup on any click that reaches it.
    // Retrying a failed load is not a click on the reader.
    const onPageClick = vi.fn();
    const onRetry = vi.fn();
    render(<div onClick={onPageClick}><Notice message="Nope." onRetry={onRetry} /></div>);

    fireEvent.click(screen.getByRole("button", { name: "Retry" }));

    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(onPageClick).not.toHaveBeenCalled();
  });
});
