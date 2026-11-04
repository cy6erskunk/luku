// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fileToBase64, getCroppedImg } from "../image.js";

// jsdom decodes no images and has no canvas, so both are stood in for at the
// boundary: an Image whose size is set per test, and a canvas that records what
// was drawn and encodes to a string whose length depends on the JPEG quality.

let imageSize;
let decodeFails;
let canvases;
let encodedLength; // (quality) => base64 length

class FakeImage {
  set src(value) {
    this._src = value;
    setTimeout(() => {
      if (decodeFails) { this.onerror?.(); return; }
      this.width = imageSize.width;
      this.height = imageSize.height;
      this.onload?.();
    });
  }
  get src() { return this._src; }
}

function fakeCanvas({ context = true } = {}) {
  const canvas = {
    width: 0,
    height: 0,
    draws: [],
    qualities: [],
    getContext: () => (context ? { drawImage: (...args) => canvas.draws.push(args) } : null),
    toDataURL: (type, quality) => {
      canvas.qualities.push(quality);
      return `data:${type};base64,${"A".repeat(encodedLength(quality))}`;
    },
  };
  return canvas;
}

let canvasOptions;

beforeEach(() => {
  imageSize = { width: 800, height: 600 };
  decodeFails = false;
  canvases = [];
  canvasOptions = {};
  encodedLength = () => 1000;
  vi.stubGlobal("Image", FakeImage);
  const create = document.createElement.bind(document);
  vi.spyOn(document, "createElement").mockImplementation((tag) => {
    if (tag !== "canvas") return create(tag);
    const c = fakeCanvas(canvasOptions);
    canvases.push(c);
    return c;
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const file = () => new File(["x"], "page.jpg", { type: "image/jpeg" });

describe("fileToBase64", () => {
  it("scales the longer side down to 1024px and draws the whole image", async () => {
    imageSize = { width: 4000, height: 3000 };
    const out = await fileToBase64(file());

    const [c] = canvases;
    expect([c.width, c.height]).toEqual([1024, 768]);
    const [img, ...rect] = c.draws[0];
    expect(img).toBeInstanceOf(FakeImage);
    // Whatever argument form is used, the destination is the whole canvas.
    expect(rect.slice(-4)).toEqual([0, 0, 1024, 768]);
    expect(out).toEqual({ base64: "A".repeat(1000), mediaType: "image/jpeg" });
  });

  it("never scales a small image up", async () => {
    imageSize = { width: 300, height: 500 };
    await fileToBase64(file());
    expect([canvases[0].width, canvases[0].height]).toEqual([300, 500]);
  });

  it("rejects an image the browser cannot decode", async () => {
    decodeFails = true;
    await expect(fileToBase64(file())).rejects.toThrow("Cannot decode image");
  });

  it("rejects when the canvas has no 2D context", async () => {
    canvasOptions = { context: false };
    await expect(fileToBase64(file())).rejects.toThrow("Canvas 2D context unavailable");
  });
});

describe("getCroppedImg", () => {
  const area = { x: 100, y: 50, width: 2000, height: 1500 };

  it("draws the cropped region at full resolution, without scaling", async () => {
    imageSize = { width: 4000, height: 3000 };
    const out = await getCroppedImg("data:image/jpeg;base64,AAAA", area);

    const [c] = canvases;
    expect([c.width, c.height]).toEqual([2000, 1500]);
    const [, ...rect] = c.draws[0];
    expect(rect).toEqual([100, 50, 2000, 1500, 0, 0, 2000, 1500]);
    expect(out.mediaType).toBe("image/jpeg");
  });

  it("rejects an image the browser cannot decode", async () => {
    decodeFails = true;
    await expect(getCroppedImg("data:,", area)).rejects.toThrow("Cannot decode image");
  });

  it("rejects when the canvas has no 2D context", async () => {
    canvasOptions = { context: false };
    await expect(getCroppedImg("data:,", area)).rejects.toThrow("Canvas 2D context unavailable");
  });
});

describe.each([
  ["fileToBase64", () => fileToBase64(file())],
  ["getCroppedImg", () => getCroppedImg("data:,", { x: 0, y: 0, width: 10, height: 10 })],
])("%s – JPEG size budget", (_, encode) => {
  it("stops at the first quality that fits in 400,000 characters", async () => {
    encodedLength = (q) => (q > 0.7 ? 500_000 : 300_000);
    const out = await encode();
    const q = canvases[0].qualities;
    expect(q[0]).toBe(0.85);
    expect(q).toHaveLength(3); // 0.85, ~0.75, ~0.65
    expect(out.base64).toHaveLength(300_000);
  });

  it("gives up stepping down once quality reaches its floor", async () => {
    encodedLength = () => 900_000;
    const out = await encode();
    const q = canvases[0].qualities;
    expect(Math.min(...q)).toBeGreaterThan(0.3);
    expect(Math.min(...q)).toBeLessThanOrEqual(0.4 + 1e-9);
    expect(out.base64).toHaveLength(900_000);
  });
});
