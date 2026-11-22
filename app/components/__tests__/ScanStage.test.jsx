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

  it("does not claim the reader is caught up while the list is loading", () => {
    render(<ScanStage image={image()} loadingWords dueWords={[]} repeatWords={[]} />);

    expect(screen.getByText("Loading your words…")).toBeTruthy();
    expect(screen.queryByText("All caught up")).toBeNull();
  });

  it("takes a dropped image anywhere on the screen", () => {
    const img = image();
    render(<ScanStage image={img} dueWords={words(2)} repeatWords={[]} />);

    fireEvent.drop(screen.getByText("Photograph a Finnish page"), { dataTransfer: { files: [] } });
    expect(img.onDrop).toHaveBeenCalled();
  });

  it("ignores a drop while a scan is running", () => {
    const img = image({ busy: true, step: "Reading…" });
    render(<ScanStage image={img} dueWords={[]} repeatWords={[]} />);

    fireEvent.drop(screen.getByText("Photograph a Finnish page"), { dataTransfer: { files: [] } });
    expect(img.onDrop).not.toHaveBeenCalled();
  });
});
