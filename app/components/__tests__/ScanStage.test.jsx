// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import ScanStage from "../ScanStage.jsx";

afterEach(cleanup);

const image = (over = {}) => ({ busy: false, fileRef: { current: null }, camRef: { current: null }, onFile: vi.fn(), onDrop: vi.fn(), ...over });
const words = (n) => Array.from({ length: n }, (_, i) => ({ id: i + 1 }));

describe("ScanStage", () => {
  it("offers reverse practice when nothing is due or repeatable", () => {
    // Every due word added this session is held out of both lists, but the
    // words already learned can still be practised in reverse.
    const onStartReverse = vi.fn();
    render(<ScanStage image={image()} dueWords={[]} repeatWords={[]} reverseCount={3} onStartReverse={onStartReverse} />);

    fireEvent.click(screen.getByRole("button", { name: /Reverse practice/ }));
    expect(onStartReverse).toHaveBeenCalled();
    expect(screen.queryByText("All caught up")).toBeNull();
  });

  it("says the word list is loading rather than offering no review at all", () => {
    render(<ScanStage image={image()} loadingWords dueWords={[]} repeatWords={[]} />);

    expect(screen.getByText("Loading your words…")).toBeTruthy();
  });

  it("takes a dropped image anywhere on the screen", () => {
    const img = image();
    render(<ScanStage image={img} dueWords={words(2)} repeatWords={[]} />);

    fireEvent.drop(screen.getByText("Photograph a Finnish page"), { dataTransfer: { files: [], types: ["Files"] } });
    expect(img.onDrop).toHaveBeenCalled();
  });

  it("leaves a drag of text or a link to the browser", () => {
    const img = image();
    render(<ScanStage image={img} dueWords={[]} repeatWords={[]} />);

    fireEvent.drop(screen.getByText("Photograph a Finnish page"), { dataTransfer: { files: [], types: ["text/plain"] } });
    expect(img.onDrop).not.toHaveBeenCalled();
  });

  it("keeps the failed photo on screen beside the error", () => {
    const { container } = render(<ScanStage image={image({ preview: "data:image/png;base64,x", err: "No text found" })} dueWords={[]} repeatWords={[]} />);

    expect(container.querySelector("img")).toBeTruthy();
  });

  it("ignores a drop while a scan is running", () => {
    const img = image({ busy: true, step: "Reading…" });
    render(<ScanStage image={img} dueWords={[]} repeatWords={[]} />);

    // false: the default was prevented, so the browser doesn't navigate away
    // to the dropped file mid-scan.
    const notPrevented = fireEvent.drop(screen.getByText("Photograph a Finnish page"), { dataTransfer: { files: [], types: ["Files"] } });
    expect(notPrevented).toBe(false);
    expect(img.onDrop).not.toHaveBeenCalled();
  });
});
