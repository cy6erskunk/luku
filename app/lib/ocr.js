let tesseractWorkerPromise = null;
let ocrStatusCallback = null;

export function waitForTesseract(timeout = 15000) {
  return new Promise((resolve, reject) => {
    if (typeof window !== "undefined" && window.Tesseract) return resolve(window.Tesseract);
    const t0 = Date.now();
    const id = setInterval(() => {
      if (typeof window !== "undefined" && window.Tesseract) { clearInterval(id); resolve(window.Tesseract); }
      else if (Date.now() - t0 > timeout) { clearInterval(id); reject(new Error("Tesseract.js failed to load")); }
    }, 100);
  });
}

async function initWorker() {
  const { createWorker } = await waitForTesseract();
  const worker = await createWorker("fin", 1, {
    logger(p) {
      if (!ocrStatusCallback || p.progress == null) return;
      const label = p.status === "loading tesseract core" ? "Loading OCR engine…"
        : p.status === "initializing tesseract" ? "Initializing OCR…"
        : p.status === "loading language traineddata" ? "Downloading Finnish model…"
        : p.status === "initializing api" ? "Preparing OCR…"
        : p.status === "recognizing text" ? "Recognizing text…"
        : null;
      if (label) ocrStatusCallback(label, p.progress);
    },
  });
  await worker.setParameters({
    tessedit_pageseg_mode: "6",
    preserve_interword_spaces: "1",
  });
  return worker;
}

export function getOrCreateWorker() {
  if (!tesseractWorkerPromise) {
    tesseractWorkerPromise = initWorker().catch((err) => {
      tesseractWorkerPromise = null;
      throw err;
    });
  }
  return tesseractWorkerPromise;
}

export function resetTesseractWorker() {
  if (!tesseractWorkerPromise) return;
  const p = tesseractWorkerPromise;
  tesseractWorkerPromise = null;
  p.then((w) => w.terminate()).catch(() => {});
}

export async function ocrLocal(base64, mediaType, onStatus) {
  ocrStatusCallback = onStatus;
  if (onStatus) onStatus("Loading OCR engine…", 0);
  const worker = await getOrCreateWorker();
  const dataUrl = `data:${mediaType};base64,${base64}`;
  const { data: { text } } = await worker.recognize(dataUrl);
  ocrStatusCallback = null;
  return text;
}
