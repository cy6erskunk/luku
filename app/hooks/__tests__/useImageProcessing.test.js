// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";

vi.mock("../../lib/image.js", () => ({
  fileToBase64: vi.fn(),
  getCroppedImg: vi.fn(),
}));
vi.mock("../../lib/ocr.js", () => ({ ocrLocal: vi.fn() }));
vi.mock("../../lib/api.js", () => ({ ocrImage: vi.fn() }));

import { fileToBase64, getCroppedImg } from "../../lib/image.js";
import { ocrLocal } from "../../lib/ocr.js";
import { useImageProcessing } from "../useImageProcessing.js";

const AREA = { x: 10, y: 20, width: 300, height: 400 };

beforeEach(() => {
  vi.clearAllMocks();
  fileToBase64.mockResolvedValue({ base64: "WHOLE", mediaType: "image/jpeg" });
  getCroppedImg.mockResolvedValue({ base64: "CROP", mediaType: "image/jpeg" });
});

// Picks a file, waits for the cropper to have its image, and sets a crop area,
// which is what the cropper component would do.
async function openCropper(result) {
  const file = new File(["x"], "page.jpg", { type: "image/jpeg" });
  act(() => result.current.onFile({ target: { files: [file], value: "page.jpg" } }));
  await waitFor(() => expect(result.current.cropImage).toMatch(/^data:/));
  act(() => result.current.onCropComplete(null, AREA));
}

describe("useImageProcessing – crop and scan", () => {
  it("scans the cropped region and hands its text on", async () => {
    ocrLocal.mockResolvedValue("  Hyvää huomenta  ");
    const onTextReady = vi.fn();
    const { result } = renderHook(() => useImageProcessing({ savedKey: "", onTextReady }));

    await openCropper(result);
    const image = result.current.cropImage;
    await act(() => result.current.cropAndProcess());

    expect(getCroppedImg).toHaveBeenCalledWith(image, AREA);
    expect(fileToBase64).not.toHaveBeenCalled();
    expect(ocrLocal).toHaveBeenCalledWith("CROP", "image/jpeg", expect.any(Function));
    expect(onTextReady).toHaveBeenCalledWith("Hyvää huomenta");
    expect(result.current.preview).toBe("data:image/jpeg;base64,CROP");
    expect(result.current.ocrSource).toBe("local");
    expect(result.current.cropImage).toBeNull();
    expect(result.current.busy).toBe(false);
  });

  it("says so when the cropped region has no text", async () => {
    ocrLocal.mockResolvedValue("   ");
    const onTextReady = vi.fn();
    const { result } = renderHook(() => useImageProcessing({ savedKey: "", onTextReady }));

    await openCropper(result);
    await act(() => result.current.cropAndProcess());

    expect(onTextReady).not.toHaveBeenCalled();
    expect(result.current.err).toBe("No text found — try a clearer photo.");
    expect(result.current.busy).toBe(false);
  });

  it("shows the error when cropping fails", async () => {
    getCroppedImg.mockRejectedValue(new Error("Cannot decode image"));
    const onTextReady = vi.fn();
    const { result } = renderHook(() => useImageProcessing({ savedKey: "", onTextReady }));

    await openCropper(result);
    await act(() => result.current.cropAndProcess());

    expect(ocrLocal).not.toHaveBeenCalled();
    expect(result.current.err).toBe("Cannot decode image");
    expect(result.current.busy).toBe(false);
    expect(result.current.step).toBe("");
  });

  it("skipping the crop scans the whole image instead", async () => {
    ocrLocal.mockResolvedValue("Kiitos");
    const onTextReady = vi.fn();
    const { result } = renderHook(() => useImageProcessing({ savedKey: "", onTextReady }));

    await openCropper(result);
    act(() => result.current.skipCrop());
    await waitFor(() => expect(onTextReady).toHaveBeenCalledWith("Kiitos"));

    expect(fileToBase64).toHaveBeenCalledTimes(1);
    expect(getCroppedImg).not.toHaveBeenCalled();
    expect(result.current.preview).toBe("data:image/jpeg;base64,WHOLE");
  });
});
