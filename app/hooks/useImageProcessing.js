import { useState, useRef, useCallback } from "react";
import { fileToBase64, getCroppedImg } from "../lib/image.js";
import { ocrLocal } from "../lib/ocr.js";
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

  const onCropComplete = useCallback((_, area) => setCroppedAreaPixels(area), []);

  const runOcr = async (base64, mediaType) => {
    setStep("Loading OCR engine…");
    setOcrProgress(0);
    const out = await ocrLocal(base64, mediaType, (label, p) => {
      setStep(label);
      setOcrProgress(p);
    });
    setOcrProgress(1);
    return out;
  };

  const processFile = async (file) => {
    setErr(""); setBusy(true); setStep("Reading image…");
    try {
      const { base64, mediaType } = await fileToBase64(file);
      setPreview(`data:${mediaType};base64,${base64}`);
      const out = await runOcr(base64, mediaType);
      if (!out?.trim()) { setErr("No text found — try a clearer photo."); return; }
      setOcrSource("local");
      onTextReady(out.trim());
    } catch (e) { setErr(e.message); }
    finally { setBusy(false); setStep(""); }
  };

  const showCropper = (f) => {
    if (!f || busy) return;
    setCropFile(f);
    setCrop({ x: 0, y: 0 });
    setZoom(1);
    setCroppedAreaPixels(null);
    setCropAspect(3 / 4);
    const reader = new FileReader();
    reader.onload = (ev) => setCropImage(ev.target.result);
    reader.readAsDataURL(f);
  };

  const onFile = (e) => { const f = e.target.files?.[0]; showCropper(f); e.target.value = ""; };
  const onDrop = (e) => { e.preventDefault(); showCropper(e.dataTransfer.files?.[0]); };

  const cropAndProcess = async () => {
    if (!cropImage || !croppedAreaPixels) return;
    setCropImage(null); setCropFile(null);
    setErr(""); setBusy(true); setStep("Cropping image…");
    try {
      const { base64, mediaType } = await getCroppedImg(cropImage, croppedAreaPixels);
      setPreview(`data:${mediaType};base64,${base64}`);
      const out = await runOcr(base64, mediaType);
      if (!out?.trim()) { setErr("No text found — try a clearer photo."); return; }
      setOcrSource("local");
      onTextReady(out.trim());
    } catch (e) { setErr(e.message); }
    finally { setBusy(false); setStep(""); }
  };

  const skipCrop = () => {
    const f = cropFile;
    setCropImage(null); setCropFile(null);
    if (f) processFile(f);
  };

  const cancelCrop = () => { setCropImage(null); setCropFile(null); };

  const rescanWithAI = async () => {
    if (!hasApiKey(savedKey)) { setErr("Enter your API key to use AI OCR — tap 'Key' in the header."); return; }
    setErr(""); setBusy(true); setStep("Re-scanning with AI…");
    try {
      const [header, b64] = preview.split(",");
      const mediaType = header.match(/data:(.*?);/)[1];
      const out = await ocrImage(savedKey, b64, mediaType);
      if (!out?.trim()) { setErr("AI found no text — try a different photo."); return; }
      setOcrSource("ai");
      onTextReady(out.trim(), { resetSession: true });
    } catch (e) { setErr(e.message); }
    finally { setBusy(false); setStep(""); }
  };

  const reset = () => {
    setPreview(null);
    setOcrProgress(0);
    setOcrSource("");
    setErr("");
  };

  return {
    busy, step, err, preview, ocrProgress, ocrSource,
    cropImage, cropFile, crop, setCrop, zoom, setZoom,
    croppedAreaPixels, cropAspect, setCropAspect,
    onCropComplete, fileRef, camRef,
    processFile, onFile, onDrop, cropAndProcess, skipCrop, cancelCrop, rescanWithAI,
    reset,
  };
}
