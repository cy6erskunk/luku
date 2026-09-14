// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, within } from "@testing-library/react";
import ModelSettings from "../ModelSettings.jsx";
import { MODELS, TASKS, DEFAULT_MODELS } from "@/lib/shared/models.js";

afterEach(cleanup);

const OTHER = MODELS.find((m) => m.id !== DEFAULT_MODELS.ocr);

function renderPanel(props = {}) {
  const handlers = { models: { ...DEFAULT_MODELS }, onPick: vi.fn(), onClose: vi.fn(), ...props };
  render(<ModelSettings {...handlers} />);
  return handlers;
}

const groupFor = (task) => screen.getByRole("group", { name: new RegExp(task.label) });

describe("ModelSettings", () => {
  it("offers every model for every task", () => {
    renderPanel();
    for (const task of TASKS) {
      const radios = within(groupFor(task)).getAllByRole("radio");
      expect(radios).toHaveLength(MODELS.length);
    }
  });

  it("shows each task's current model as the checked one", () => {
    renderPanel({ models: { ...DEFAULT_MODELS, ocr: OTHER.id } });
    const checked = screen.getAllByRole("radio", { checked: true });
    // One per task, and the OCR group's is the one that was passed in.
    expect(checked).toHaveLength(TASKS.length);
    expect(within(groupFor(TASKS[0])).getByRole("radio", { checked: true })).toHaveProperty("value", OTHER.id);
  });

  it("reports a pick as a task and a model", () => {
    const { onPick } = renderPanel();
    fireEvent.click(within(groupFor(TASKS[1])).getByRole("radio", { name: new RegExp(OTHER.label) }));
    expect(onPick).toHaveBeenCalledWith(TASKS[1].id, OTHER.id);
  });

  it("keeps the two tasks independent", () => {
    renderPanel();
    // Separate radio groups, or picking a model for one would silently move
    // the other — the whole point of the panel is that they can differ.
    const names = TASKS.map((t) => within(groupFor(t)).getAllByRole("radio")[0].name);
    expect(new Set(names).size).toBe(TASKS.length);
  });

  it("closes from the ✕, from Done and from the backdrop", () => {
    for (const target of ["Close", "Done"]) {
      const { onClose } = renderPanel();
      fireEvent.click(screen.getByRole("button", { name: target }));
      expect(onClose).toHaveBeenCalled();
      cleanup();
    }
    const { onClose } = renderPanel();
    fireEvent.click(screen.getByTestId("models-backdrop"));
    expect(onClose).toHaveBeenCalled();
  });

  it("does not close when the panel itself is clicked", () => {
    const { onClose } = renderPanel();
    fireEvent.click(screen.getByRole("dialog"));
    expect(onClose).not.toHaveBeenCalled();
  });

  it("is a modal dialog, and Escape leaves it", () => {
    const { onClose } = renderPanel();
    expect(screen.getByRole("dialog")).toHaveProperty("ariaModal", "true");
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
  });
});
