// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup, act } from "@testing-library/react";
import { StrictMode } from "react";
import BundlePicker from "../BundlePicker.jsx";

const BUNDLES = [
  { id: 1, name: "Kotimaa" },
  { id: 2, name: "Luku 3" },
];

afterEach(cleanup);

function renderPicker(props = {}) {
  const onSelect = vi.fn();
  const onCreate = vi.fn(() => Promise.resolve({ id: 3, name: "Uusi" }));
  render(<BundlePicker bundles={BUNDLES} activeBundleId={null} onSelect={onSelect} onCreate={onCreate} {...props} />);
  return { onSelect, onCreate };
}

describe("BundlePicker", () => {
  it("offers every bundle plus no bundle at all", () => {
    renderPicker();
    expect(screen.getByRole("option", { name: "No bundle" })).toBeTruthy();
    expect(screen.getByRole("option", { name: "Kotimaa" })).toBeTruthy();
    expect(screen.getByRole("option", { name: "Luku 3" })).toBeTruthy();
  });

  it("shows the word count beside each name when given one", () => {
    renderPicker({ counts: { 1: 12, 2: 0 } });
    expect(screen.getByRole("option", { name: "Kotimaa (12)" })).toBeTruthy();
    expect(screen.getByRole("option", { name: "Luku 3 (0)" })).toBeTruthy();
  });

  it("reports the picked bundle as a number", () => {
    const { onSelect } = renderPicker();
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "2" } });
    expect(onSelect).toHaveBeenCalledWith(2);
  });

  it("reports null when the reader picks no bundle", () => {
    const { onSelect } = renderPicker({ activeBundleId: 2 });
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "" } });
    expect(onSelect).toHaveBeenCalledWith(null);
  });

  it("shows the active bundle as the current value", () => {
    renderPicker({ activeBundleId: 2 });
    expect(screen.getByRole("combobox").value).toBe("2");
  });

  it("still shows a selection the list cannot name yet", () => {
    // On a reload the remembered id is read from localStorage before
    // /api/bundles answers, and a failed load leaves it set against an empty
    // list. With no option carrying that value the select falls off its own
    // value and reads as unselected, while every word added still goes into
    // the remembered bundle.
    renderPicker({ bundles: [], activeBundleId: 7 });
    expect(screen.getByRole("combobox").value).toBe("7");
    expect(screen.getByRole("option", { name: "Remembered bundle" })).toBeTruthy();
  });

  it("drops the placeholder once the list carries the active bundle", () => {
    renderPicker({ activeBundleId: 2 });
    expect(screen.queryByRole("option", { name: "Remembered bundle" })).toBeNull();
    expect(screen.getByRole("combobox").value).toBe("2");
  });

  it("creates a bundle and selects it straight away", async () => {
    const { onSelect, onCreate } = renderPicker();
    fireEvent.click(screen.getByRole("button", { name: /new/i }));
    fireEvent.change(screen.getByLabelText(/new bundle name/i), { target: { value: "Uusi" } });
    fireEvent.click(screen.getByRole("button", { name: /create/i }));
    await waitFor(() => expect(onCreate).toHaveBeenCalledWith("Uusi"));
    await waitFor(() => expect(onSelect).toHaveBeenCalledWith(3));
    // Back to the select, with the new bundle available to pick again.
    await waitFor(() => expect(screen.getByRole("combobox")).toBeTruthy());
  });

  it("keeps the typed name when the create was withheld", async () => {
    // createBundle answers null when the account moved under it, or when it
    // named a bundle this session has already deleted. Nothing was created, so
    // clearing the field would throw away what the reader — who by then may be
    // a different account — has typed.
    const onCreate = vi.fn(() => Promise.resolve(null));
    const onSelect = vi.fn();
    render(<BundlePicker bundles={BUNDLES} activeBundleId={null} onSelect={onSelect} onCreate={onCreate} />);
    fireEvent.click(screen.getByRole("button", { name: /new/i }));
    fireEvent.change(screen.getByLabelText(/new bundle name/i), { target: { value: "Uusi" } });
    fireEvent.click(screen.getByRole("button", { name: /create/i }));

    await waitFor(() => expect(onCreate).toHaveBeenCalledWith("Uusi"));
    expect(onSelect).not.toHaveBeenCalled();
    expect(screen.getByLabelText(/new bundle name/i).value).toBe("Uusi");
  });

  it("still selects under Strict Mode, which mounts twice", async () => {
    // The App Router runs development in Strict Mode, so the effect's
    // setup/cleanup pair runs twice. A cleanup-only mounted flag is left false
    // by the first cleanup and never set again, so every create looks like it
    // came from an unmounted picker and none is ever selected.
    const onCreate = vi.fn(() => Promise.resolve({ id: 3, name: "Uusi" }));
    const onSelect = vi.fn();
    render(
      <StrictMode>
        <BundlePicker bundles={BUNDLES} activeBundleId={null} onSelect={onSelect} onCreate={onCreate} />
      </StrictMode>
    );
    fireEvent.click(screen.getByRole("button", { name: /new/i }));
    fireEvent.change(screen.getByLabelText(/new bundle name/i), { target: { value: "Uusi" } });
    fireEvent.click(screen.getByRole("button", { name: /create/i }));

    await waitFor(() => expect(onSelect).toHaveBeenCalledWith(3));
  });

  it("does not select a bundle created by a picker that is gone", async () => {
    // page.jsx keys this component on the account, so a switch unmounts it —
    // but onSelect is page.jsx's own callback, shared by every instance, so a
    // create still running from the old one can still write a selection into
    // the new screen. Signing back in as the same account restores the id the
    // hook compares, so its own guard lets that response through.
    let resolveCreate;
    const onCreate = vi.fn(() => new Promise((r) => { resolveCreate = r; }));
    const onSelect = vi.fn();
    const { unmount } = render(
      <BundlePicker bundles={BUNDLES} activeBundleId={null} onSelect={onSelect} onCreate={onCreate} />
    );
    fireEvent.click(screen.getByRole("button", { name: /new/i }));
    fireEvent.change(screen.getByLabelText(/new bundle name/i), { target: { value: "Uusi" } });
    fireEvent.click(screen.getByRole("button", { name: /create/i }));
    await waitFor(() => expect(onCreate).toHaveBeenCalled());

    unmount();
    await act(async () => { resolveCreate({ id: 3, name: "Uusi" }); await Promise.resolve(); });

    expect(onSelect).not.toHaveBeenCalled();
  });

  it("trims the typed name before creating", async () => {
    const { onCreate } = renderPicker();
    fireEvent.click(screen.getByRole("button", { name: /new/i }));
    fireEvent.change(screen.getByLabelText(/new bundle name/i), { target: { value: "  Uusi  " } });
    fireEvent.click(screen.getByRole("button", { name: /create/i }));
    await waitFor(() => expect(onCreate).toHaveBeenCalledWith("Uusi"));
  });

  it("will not create an empty name", () => {
    const { onCreate } = renderPicker();
    fireEvent.click(screen.getByRole("button", { name: /new/i }));
    fireEvent.change(screen.getByLabelText(/new bundle name/i), { target: { value: "   " } });
    fireEvent.click(screen.getByRole("button", { name: /create/i }));
    expect(onCreate).not.toHaveBeenCalled();
  });

  it("keeps what was typed and says so when the create fails", async () => {
    const onCreate = vi.fn(() => Promise.reject(new Error("nope")));
    render(<BundlePicker bundles={BUNDLES} activeBundleId={null} onSelect={vi.fn()} onCreate={onCreate} />);
    fireEvent.click(screen.getByRole("button", { name: /new/i }));
    fireEvent.change(screen.getByLabelText(/new bundle name/i), { target: { value: "Uusi" } });
    fireEvent.click(screen.getByRole("button", { name: /create/i }));
    await waitFor(() => expect(screen.getByText(/could not create/i)).toBeTruthy());
    expect(screen.getByLabelText(/new bundle name/i).value).toBe("Uusi");
  });

  it("goes back to the select on cancel", () => {
    renderPicker();
    fireEvent.click(screen.getByRole("button", { name: /new/i }));
    fireEvent.click(screen.getByRole("button", { name: /cancel/i }));
    expect(screen.getByRole("combobox")).toBeTruthy();
  });

  it("labels the select with the caller's wording", () => {
    renderPicker({ label: "Adding words to" });
    expect(screen.getByLabelText("Adding words to")).toBeTruthy();
  });
});
