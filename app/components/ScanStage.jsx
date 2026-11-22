import { useState } from "react";
import Cropper from "react-easy-crop";
import { Bp, Bg } from "../lib/styles.js";
import ReverseButton from "./ReverseButton.jsx";
import Spinner from "./Spinner.jsx";

const HORIZONTAL = 4 / 3;
const VERTICAL = 3 / 4;

// The shape slider's range, and how far one tap on an end icon moves it.
const MIN_ASPECT = 0.1;
const MAX_ASPECT = 2;
const NUDGE = 0.1;

// Rounded to the slider's 0.05 step so repeated taps don't drift off it.
const nudgeAspect = (aspect, delta) =>
  Math.min(MAX_ASPECT, Math.max(MIN_ASPECT, Math.round((aspect + delta) * 20) / 20));

// The slider's end icons: 44px square so they are a fair tap target beside
// the thumb. They are tapped in quick succession, which a phone otherwise
// reads as a double-tap zoom; manipulation keeps every tap a click.
const nudgeButton = {
  ...Bg,
  width: 44, height: 44, padding: 0, flexShrink: 0,
  display: "flex", alignItems: "center", justifyContent: "center",
  color: "#4a7c9e", fontSize: 18, lineHeight: 1,
  touchAction: "manipulation",
};

const sectionLabel = { fontSize: 10, letterSpacing: "0.15em", textTransform: "uppercase", color: "#4a7c9e", marginBottom: 8, fontFamily: "monospace" };

export default function ScanStage({ image, loadingWords = false, dueWords, onStartReview, repeatWords, onStartRepeat, reverseCount = 0, onStartReverse }) {
  const [dragOver, setDragOver] = useState(false);
  const {
    busy, step, err, preview, ocrProgress,
    cropImage, crop, setCrop, zoom, setZoom, croppedAreaPixels, cropAspect, setCropAspect,
    onCropComplete, fileRef, camRef,
    onFile, onDrop, cropAndProcess, skipCrop, cancelCrop,
  } = image;

  if (cropImage) {
    return (
      // Dragging the crop box or the shape slider on a phone otherwise starts a
      // text selection, and the drag goes to the selection, not the control.
      <div style={{ padding: "20px", display: "flex", flexDirection: "column", alignItems: "center", userSelect: "none", WebkitUserSelect: "none", WebkitTouchCallout: "none" }}>
        <div style={{ fontSize: 10, letterSpacing: "0.15em", textTransform: "uppercase", color: "#4a7c9e", marginBottom: 10, fontFamily: "monospace" }}>Crop image</div>
        <p style={{ color: "#6b645e", textAlign: "center", marginBottom: 14, maxWidth: 300, fontSize: 13, lineHeight: 1.6 }}>
          Drag to reposition. Pinch or scroll to zoom. Select the text area to scan.
        </p>
        <div style={{ position: "relative", width: "100%", maxWidth: 400, aspectRatio: "4/3", borderRadius: 14, overflow: "hidden", marginBottom: 14 }}>
          <Cropper
            image={cropImage}
            crop={crop}
            zoom={zoom}
            aspect={cropAspect}
            onCropChange={setCrop}
            onZoomChange={setZoom}
            onCropComplete={onCropComplete}
            style={{ containerStyle: { borderRadius: 14 } }}
          />
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12, width: "100%", maxWidth: 400, marginBottom: 12 }}>
          <button
            type="button"
            onClick={() => setCropAspect((a) => nudgeAspect(a, -NUDGE))}
            aria-label="Taller crop"
            style={nudgeButton}
          >▮</button>
          {/* pan-y: a sideways drag belongs to the slider, a vertical one
              still scrolls the page. */}
          <input
            type="range" min={MIN_ASPECT} max={MAX_ASPECT} step="0.05" value={cropAspect}
            onChange={(e) => setCropAspect(parseFloat(e.target.value))}
            aria-label="Crop shape, tall to wide"
            className="luku-ratio"
            style={{ flex: 1, minWidth: 0, height: 44, padding: "8px 0", touchAction: "pan-y" }}
          />
          <button
            type="button"
            onClick={() => setCropAspect((a) => nudgeAspect(a, NUDGE))}
            aria-label="Wider crop"
            style={nudgeButton}
          >▬</button>
        </div>
        {/* The thumb can only be sized through pseudo-elements. The track is as
            tall as the thumb, drawing its line with a gradient, so the thumb
            never overflows the input and gets clipped. */}
        <style>{`
          .luku-ratio { -webkit-appearance: none; appearance: none; background: transparent; margin: 0; cursor: pointer; }
          .luku-ratio::-webkit-slider-runnable-track { height: 28px; background: linear-gradient(transparent 11px, rgba(74,124,158,0.35) 11px, rgba(74,124,158,0.35) 17px, transparent 17px); }
          .luku-ratio::-moz-range-track { height: 28px; background: linear-gradient(transparent 11px, rgba(74,124,158,0.35) 11px, rgba(74,124,158,0.35) 17px, transparent 17px); }
          .luku-ratio::-webkit-slider-thumb { -webkit-appearance: none; appearance: none; width: 28px; height: 28px; border-radius: 50%; background: #4a7c9e; border: 2px solid #e8e0d5; }
          .luku-ratio::-moz-range-thumb { width: 28px; height: 28px; border-radius: 50%; background: #4a7c9e; border: 2px solid #e8e0d5; }
        `}</style>
        <div style={{ display: "flex", gap: 10, width: "100%", maxWidth: 400, marginBottom: 10 }}>
          <button onClick={() => setCropAspect(HORIZONTAL)} style={{ ...Bg, flex: 1, opacity: cropAspect === HORIZONTAL ? 1 : 0.5 }}>▬ Horizontal</button>
          <button onClick={() => setCropAspect(VERTICAL)} style={{ ...Bg, flex: 1, opacity: cropAspect === VERTICAL ? 1 : 0.5 }}>▮ Vertical</button>
        </div>
        <div style={{ display: "flex", gap: 10, width: "100%", maxWidth: 400 }}>
          <button onClick={cancelCrop} style={{ ...Bg, flex: 1 }}>Cancel</button>
          <button onClick={skipCrop} style={{ ...Bg, flex: 1 }}>Skip crop</button>
          <button onClick={cropAndProcess} disabled={!croppedAreaPixels} style={{ ...Bp, flex: 2 }}>Scan text</button>
        </div>
      </div>
    );
  }

  const showReverse = reverseCount > 0 && !!onStartReverse;
  const hasReview = repeatWords.length > 0 || dueWords.length > 0 || showReverse;
  // Exactly one primary button on the screen: the due review when there is
  // one, otherwise picking a photo.
  const reviewIsPrimary = dueWords.length > 0;
  const dropProps = {
    onDrop: (e) => { setDragOver(false); if (!busy) onDrop(e); else e.preventDefault(); },
    onDragOver: (e) => { e.preventDefault(); if (!busy) setDragOver(true); },
    onDragLeave: (e) => { if (!e.currentTarget.contains(e.relatedTarget)) setDragOver(false); },
  };

  return (
    // The whole screen takes a dropped image, so a desktop keeps drag-and-drop
    // without a drop area that a phone can't use and that crowded out review.
    <div {...dropProps} style={{ padding: "28px 20px 36px", display: "flex", flexDirection: "column", alignItems: "center", minHeight: "calc(100vh - 66px)", outline: dragOver ? "1.5px dashed rgba(74,124,158,0.6)" : "none", outlineOffset: -10, background: dragOver ? "rgba(74,124,158,0.04)" : "transparent" }}>
      <div style={{ width: "100%", maxWidth: 400 }}>
        {loadingWords && !hasReview && (
          <div style={{ ...sectionLabel, minHeight: 60, display: "flex", alignItems: "center", gap: 8 }}><Spinner size={11} />Loading your words…</div>
        )}

        {hasReview && (
          <section style={{ marginBottom: 32 }}>
            <div style={sectionLabel}>Review</div>
            {dueWords.length > 0 && (<>
              <h2 style={{ fontSize: 26, fontWeight: 400, margin: "0 0 16px" }}>
                {dueWords.length} word{dueWords.length !== 1 ? "s" : ""} due
              </h2>
              <button onClick={onStartReview} style={{ ...Bp, width: "100%", padding: "16px 18px", fontSize: 16 }}>
                Review {dueWords.length} due word{dueWords.length !== 1 ? "s" : ""} →
              </button>
            </>)}
            {dueWords.length === 0 && repeatWords.length > 0 && (<>
              <h2 style={{ fontSize: 22, fontWeight: 400, margin: "0 0 4px" }}>All caught up</h2>
              <p style={{ color: "#6b645e", fontSize: 13, lineHeight: 1.6, marginBottom: 14 }}>Nothing is due right now. Extra practice doesn&apos;t change the schedule.</p>
              <button onClick={onStartRepeat} style={{ ...Bg, width: "100%", borderColor: "rgba(74,124,158,0.3)", color: "#6a9ebe" }}>
                Repeat {repeatWords.length} word{repeatWords.length !== 1 ? "s" : ""} →
              </button>
            </>)}
            {/* Shown whenever a pass can be drawn, as before this screen led
                with review: due and repeat can both be empty while words are
                eligible, when every due word was added this session. */}
            {showReverse && (
              <ReverseButton count={reverseCount} onClick={onStartReverse} style={{ width: "100%", marginTop: dueWords.length > 0 || repeatWords.length > 0 ? 10 : 0 }} />
            )}
          </section>
        )}

        <section style={hasReview ? { borderTop: "1px solid rgba(255,255,255,0.07)", paddingTop: 24 } : undefined}>
          <div style={sectionLabel}>Scan</div>
          <h2 style={{ fontSize: hasReview ? 18 : 24, fontWeight: 400, margin: "0 0 4px" }}>Photograph a Finnish page</h2>
          <p style={{ color: "#6b645e", marginBottom: 14, fontSize: 13, lineHeight: 1.6 }}>
            Take a photo or upload an image. Text will be extracted locally.
            <span className="luku-drop-hint"> Or drop an image here.</span>
          </p>
          <input ref={fileRef} type="file" accept="image/*" onChange={onFile} style={{ display: "none" }} />
          <input ref={camRef} type="file" accept="image/*" capture="environment" onChange={onFile} style={{ display: "none" }} />
          <div style={{ display: "flex", gap: 10 }}>
            <button onClick={() => camRef.current?.click()} disabled={busy} style={{ ...Bg, flex: 1 }}>📷 Camera</button>
            <button onClick={() => fileRef.current?.click()} disabled={busy} style={{ ...(reviewIsPrimary ? Bg : Bp), flex: reviewIsPrimary ? 1 : 2 }}>📁 Photo Library</button>
          </div>
          {busy && (
            <div style={{ marginTop: 16 }}>
              {preview && <img src={preview} alt="" style={{ width: "100%", maxHeight: 160, objectFit: "cover", borderRadius: 10, marginBottom: 10, opacity: 0.7 }} />}
              <div style={{ display: "flex", alignItems: "center", gap: 8, color: "#4a7c9e", fontSize: 13, marginBottom: 8 }}>
                <Spinner size={13} />{step}
              </div>
              {ocrProgress > 0 && ocrProgress < 1 && (
                <div style={{ height: 3, background: "rgba(255,255,255,0.06)", borderRadius: 2, overflow: "hidden" }}>
                  <div style={{ height: "100%", width: `${Math.round(ocrProgress * 100)}%`, background: "linear-gradient(90deg,#4a7c9e,#2d5a7a)", transition: "width 0.2s" }} />
                </div>
              )}
            </div>
          )}
          {err && (
            <div style={{ marginTop: 14, background: "rgba(180,80,80,0.1)", border: "1px solid rgba(180,80,80,0.3)", borderRadius: 10, padding: "11px 14px", fontSize: 12, color: "#c48a8a" }}>
              ⚠ {err}
            </div>
          )}
        </section>
      </div>
      {/* Only a mouse can drag a file in, so only a mouse is told it can. */}
      <style>{`
        .luku-drop-hint { display: none; }
        @media (hover: hover) and (pointer: fine) { .luku-drop-hint { display: inline; } }
      `}</style>
    </div>
  );
}
