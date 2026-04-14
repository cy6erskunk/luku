// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";

afterEach(cleanup);
import ApiKeyScreen from "../ApiKeyScreen.jsx";

// Stub out Next.js "use client" boundary — not needed in tests
vi.mock("../../lib/utils", () => ({
  SKIP_KEY: "__skip__",
}));

const setup = (props = {}) => {
  const onSave = props.onSave ?? vi.fn();
  const onSkip = props.onSkip ?? vi.fn();
  render(<ApiKeyScreen onSave={onSave} onSkip={onSkip} stage={props.stage ?? 0} />);
  return {
    onSave,
    onSkip,
    input: screen.getByPlaceholderText("sk-ant-..."),
    saveBtn: screen.getByRole("button", { name: /start reading|save key/i }),
    skipBtn: screen.getByRole("button", { name: /skip/i }),
  };
};

describe("ApiKeyScreen", () => {
  it("renders the key input and both buttons", () => {
    const { input, saveBtn, skipBtn } = setup();
    expect(input).toBeTruthy();
    expect(saveBtn).toBeTruthy();
    expect(skipBtn).toBeTruthy();
  });

  it("save button is disabled when input is empty", () => {
    const { saveBtn } = setup();
    expect(saveBtn.disabled).toBe(true);
  });

  it("save button is disabled when key does not start with 'sk-'", () => {
    const { input, saveBtn } = setup();
    fireEvent.change(input, { target: { value: "not-a-key" } });
    expect(saveBtn.disabled).toBe(true);
  });

  it("save button is enabled when key starts with 'sk-'", () => {
    const { input, saveBtn } = setup();
    fireEvent.change(input, { target: { value: "sk-ant-abc123" } });
    expect(saveBtn.disabled).toBe(false);
  });

  it("calls onSave with the key when save button is clicked", () => {
    const { input, saveBtn, onSave } = setup();
    fireEvent.change(input, { target: { value: "sk-ant-abc123" } });
    fireEvent.click(saveBtn);
    expect(onSave).toHaveBeenCalledWith("sk-ant-abc123");
  });

  it("does not call onSave when key is invalid and button is clicked", () => {
    const { input, saveBtn, onSave } = setup();
    fireEvent.change(input, { target: { value: "bad-key" } });
    fireEvent.click(saveBtn);
    expect(onSave).not.toHaveBeenCalled();
  });

  it("calls onSave when Enter is pressed with a valid key", () => {
    const { input, onSave } = setup();
    fireEvent.change(input, { target: { value: "sk-ant-abc123" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onSave).toHaveBeenCalledWith("sk-ant-abc123");
  });

  it("does not call onSave when Enter is pressed with an invalid key", () => {
    const { input, onSave } = setup();
    fireEvent.change(input, { target: { value: "bad-key" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onSave).not.toHaveBeenCalled();
  });

  it("calls onSkip when skip button is clicked", () => {
    const { skipBtn, onSkip } = setup();
    fireEvent.click(skipBtn);
    expect(onSkip).toHaveBeenCalled();
  });

  it("shows 'Start reading →' when stage is 0", () => {
    setup({ stage: 0 });
    expect(screen.getByRole("button", { name: /start reading/i })).toBeTruthy();
  });

  it("shows 'Save key & continue →' when stage is 1", () => {
    setup({ stage: 1 });
    expect(screen.getByRole("button", { name: /save key & continue/i })).toBeTruthy();
  });
});
