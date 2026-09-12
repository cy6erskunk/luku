import { useState, useRef, useCallback } from "react";
import { fileToBase64, getCroppedImg } from "../lib/image.js";
import { ocrLocal, resetTesseractWorker } from "../lib/ocr.js";
import { ocrImage } from "../lib/api.js";
import { hasApiKey } from "../lib/utils.js";

export function useImageProcessing({ savedKey, onTextReady }) {
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState("");
  const [err, setErr] = useState("");
  const [preview, setPreview] = useState(null);
  const [ocrProgress, setOcrProgress] = useState(0);
  const [ocrSource, setOcrSource] = useState("");

  const [cropImage, setCropImage] = useState(null);
  const [cropFile, setCropFile] = useState(null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState(null);
  const [cropAspect, setCropAspect] = useState(3 / 4);

  const fileRef = useRef();
  const camRef = useRef();

  // Which run the state belongs to. Reading a file, OCR and an AI re-scan are
  // all long enough to outlive the screen that started them: reset() is called
  // when the account changes, and without this the old run still reports its
  // progress, its preview and — through onTextReady — the previous account's
  // scanned page, on a screen that now belongs to someone else.
  const runRef = useRef(0);
  const stale = (run) => runRef.current !== run;
  // Which run holds the Tesseract worker, or null. A shared boolean was not
  // enough: reset() clears it and a new scan sets it again, so an abandoned
  // run reaching its own `finally` afterwards would clear the *new* run's
  // marker — and the next reset would then skip the terminate and leave that
  // recognition running. The run number says whose marker it is.
  const ocrRunning = useRef(null);

  const onCropComplete = useCallback((_, area) => setCroppedAreaPixels(area), []);

  const runOcr = async (base64, mediaType, run) => {
    setStep("Loading OCR engine…");
    setOcrProgress(0);
    ocrRunning.current = run;
    try {
      const out = await ocrLocal(base64, mediaType, (label, p) => {
        if (stale(run)) return;
        setStep(label);
        setOcrProgress(p);
      });
      if (!stale(run)) setOcrProgress(1);
      return out;
    } finally {
      if (ocrRunning.current === run) ocrRunning.current = null;
    }
  };

  const processFile = async (file) => {
    const run = runRef.current;
    setErr(""); setBusy(true); setStep("Reading image…");
    try {
      const { base64, mediaType } = await fileToBase64(file);
      if (stale(run)) return;
      setPreview(`data:${mediaType};base64,${base64}`);
      const out = await runOcr(base64, mediaType, run);
      if (stale(run)) return;
      if (!out?.trim()) { setErr("No text found — try a clearer photo."); return; }
      setOcrSource("local");
      onTextReady(out.trim());
    } catch (e) { if (!stale(run)) setErr(e.message); }
    finally { if (!stale(run)) { setBusy(false); setStep(""); } }
  };

  const showCropper = (f) => {
    if (!f || busy) return;
    setCropFile(f);
    setCrop({ x: 0, y: 0 });
    setZoom(1);
    setCroppedAreaPixels(null);
    setCropAspect(3 / 4);
    const run = runRef.current;
    const reader = new FileReader();
    reader.onload = (ev) => { if (!stale(run)) setCropImage(ev.target.result); };
    reader.readAsDataURL(f);
  };

  const onFile = (e) => { const f = e.target.files?.[0]; showCropper(f); e.target.value = ""; };
  const onDrop = (e) => { e.preventDefault(); showCropper(e.dataTransfer.files?.[0]); };

  const cropAndProcess = async () => {
    if (!cropImage || !croppedAreaPixels) return;
    const run = runRef.current;
    setCropImage(null); setCropFile(null);
    setErr(""); setBusy(true); setStep("Cropping image…");
    try {
      const { base64, mediaType } = await getCroppedImg(cropImage, croppedAreaPixels);
      if (stale(run)) return;
      setPreview(`data:${mediaType};base64,${base64}`);
      const out = await runOcr(base64, mediaType, run);
      if (stale(run)) return;
      if (!out?.trim()) { setErr("No text found — try a clearer photo."); return; }
      setOcrSource("local");
      onTextReady(out.trim());
    } catch (e) { if (!stale(run)) setErr(e.message); }
    finally { if (!stale(run)) { setBusy(false); setStep(""); } }
  };

  const skipCrop = () => {
    const f = cropFile;
    setCropImage(null); setCropFile(null);
    if (f) processFile(f);
  };

  const cancelCrop = () => { setCropImage(null); setCropFile(null); };

  const rescanWithAI = async () => {
    if (!hasApiKey(savedKey)) { setErr("Enter your API key to use AI OCR — tap 'Key' in the header."); return; }
    if (!preview) { setErr("No image to re-scan — upload an image first."); return; }
    const run = runRef.current;
    setErr(""); setBusy(true); setStep("Re-scanning with AI…");
    try {
      const [header, b64] = preview.split(",");
      const mediaType = header?.match(/data:(.*?);/)?.[1];
      if (!b64 || !mediaType) { setErr("The image format is invalid — upload the image again."); return; }
      const out = await ocrImage(savedKey, b64, mediaType);
      if (stale(run)) return;
      if (!out?.trim()) { setErr("AI found no text — try a different photo."); return; }
      setOcrSource("ai");
      onTextReady(out.trim());
    } catch (e) { if (!stale(run)) setErr(e.message); }
    finally { if (!stale(run)) { setBusy(false); setStep(""); } }
  };

  // Stable, so callers can depend on it without re-running an effect every
  // render. Clears the pending crop too: it holds the same photo the preview
  // does, and a reset that left it would put the crop overlay back on screen.
  //
  // Abandons whatever is in flight rather than only clearing what is drawn.
  // Anything still running belongs to the screen being reset, so its progress,
  // its preview, its error and its finished text all stop here — including the
  // busy flag, which the abandoned run's own `finally` must no longer clear
  // out from under a scan the next account has started.
  const reset = useCallback(() => {
    runRef.current += 1;
    // Terminate rather than merely ignore: the recognition is abandoned, and
    // leaving it running spends the next account's wait and the device's CPU on
    // an image that will never be shown. Only when one is actually outstanding
    // — tearing the worker down on an idle reset would make the next scan pay
    // to load it again.
    if (ocrRunning.current !== null) { ocrRunning.current = null; resetTesseractWorker(); }
    setBusy(false);
    setStep("");
    setPreview(null);
    setCropImage(null);
    setCropFile(null);
    setOcrProgress(0);
    setOcrSource("");
    setErr("");
  }, []);

  return {
    busy, step, err, preview, ocrProgress, ocrSource,
    cropImage, cropFile, crop, setCrop, zoom, setZoom,
    croppedAreaPixels, cropAspect, setCropAspect,
    onCropComplete, fileRef, camRef,
    processFile, onFile, onDrop, cropAndProcess, skipCrop, cancelCrop, rescanWithAI,
    reset,
  };
}
