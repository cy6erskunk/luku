import Cropper from "react-easy-crop";
import { Bp, Bg } from "../lib/styles.js";

export default function ScanStage({ image, dueWords, onStartReview, repeatWords, onStartRepeat }) {
  const {
    busy, step, err, preview, ocrProgress,
    cropImage, crop, setCrop, zoom, setZoom, croppedAreaPixels, cropAspect, setCropAspect,
    twoColumn, setTwoColumn,
    onCropComplete, fileRef, camRef,
    onFile, onDrop, cropAndProcess, skipCrop, cancelCrop,
  } = image;

  if (cropImage) {
    return (
      <div style={{ padding: "20px", display: "flex", flexDirection: "column", alignItems: "center" }}>
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
        <input type="range" min="0.1" max="2" step="0.1" value={cropAspect} onChange={(e) => setCropAspect(parseFloat(e.target.value))} />
        <div style={{ display: "flex", gap: 10, width: "100%", maxWidth: 400, marginBottom: 10 }}>
          <button onClick={() => setCropAspect(4 / 3)} style={{ ...Bg, flex: 1, opacity: cropAspect === 4 / 3 ? 1 : 0.5 }}>▬ Horizontal</button>
          <button onClick={() => setCropAspect(3 / 4)} style={{ ...Bg, flex: 1, opacity: cropAspect === 3 / 4 ? 1 : 0.5 }}>▮ Vertical</button>
        </div>
        <label style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", maxWidth: 400, marginBottom: 10, cursor: "pointer", fontSize: 13, color: "#8a9aaa" }}>
          <input type="checkbox" checked={twoColumn} onChange={(e) => setTwoColumn(e.target.checked)} style={{ accentColor: "#4a7c9e" }} />
          Two-column layout
        </label>
        <div style={{ display: "flex", gap: 10, width: "100%", maxWidth: 400 }}>
          <button onClick={cancelCrop} style={{ ...Bg, flex: 1 }}>Cancel</button>
          <button onClick={skipCrop} style={{ ...Bg, flex: 1 }}>Skip crop</button>
          <button onClick={cropAndProcess} disabled={!croppedAreaPixels} style={{ ...Bp, flex: 2 }}>Scan text</button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: "36px 20px", display: "flex", flexDirection: "column", alignItems: "center" }}>
      <div style={{ fontSize: 10, letterSpacing: "0.15em", textTransform: "uppercase", color: "#4a7c9e", marginBottom: 10, fontFamily: "monospace" }}>Step 1 — Scan</div>
      <h2 style={{ fontSize: 24, fontWeight: 400, textAlign: "center", margin: "0 0 6px" }}>Photograph a Finnish page</h2>
      <p style={{ color: "#6b645e", textAlign: "center", marginBottom: 28, maxWidth: 300, fontSize: 13, lineHeight: 1.6 }}>
        Take a photo or upload an image. Text will be extracted locally.
      </p>
      <div
        onDrop={onDrop} onDragOver={(e) => e.preventDefault()}
        onClick={() => !busy && fileRef.current?.click()}
        style={{ width: "100%", maxWidth: 400, aspectRatio: "4/3", borderRadius: 14, border: "1.5px dashed rgba(74,124,158,0.4)", cursor: busy ? "default" : "pointer", background: preview ? "transparent" : "rgba(74,124,158,0.03)", overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 10, marginBottom: 14, position: "relative" }}
      >
        {preview
          ? <img src={preview} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          : (
            <>
              <div style={{ fontSize: 36, opacity: 0.15 }}>🖼</div>
              <div style={{ color: "#4a6070", fontSize: 13, textAlign: "center" }}>
                Drop image here<br /><span style={{ opacity: 0.6, fontSize: 11 }}>or tap to browse</span>
              </div>
            </>
          )
        }
        {[
          [{ top: 8, left: 8 }, { borderTop: "2px solid #4a7c9e", borderLeft: "2px solid #4a7c9e", borderRadius: "3px 0 0 0" }],
          [{ top: 8, right: 8 }, { borderTop: "2px solid #4a7c9e", borderRight: "2px solid #4a7c9e", borderRadius: "0 3px 0 0" }],
          [{ bottom: 8, left: 8 }, { borderBottom: "2px solid #4a7c9e", borderLeft: "2px solid #4a7c9e", borderRadius: "0 0 0 3px" }],
          [{ bottom: 8, right: 8 }, { borderBottom: "2px solid #4a7c9e", borderRight: "2px solid #4a7c9e", borderRadius: "0 0 3px 0" }],
        ].map(([p, b], i) => <div key={i} style={{ position: "absolute", width: 18, height: 18, ...p, ...b }} />)}
      </div>
      <input ref={fileRef} type="file" accept="image/*" onChange={onFile} style={{ display: "none" }} />
      <input ref={camRef} type="file" accept="image/*" capture="environment" onChange={onFile} style={{ display: "none" }} />
      <label style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", maxWidth: 400, marginBottom: 10, cursor: "pointer", fontSize: 13, color: "#8a9aaa" }}>
        <input type="checkbox" checked={twoColumn} onChange={(e) => setTwoColumn(e.target.checked)} style={{ accentColor: "#4a7c9e" }} />
        Two-column layout
      </label>
      <div style={{ display: "flex", gap: 10, width: "100%", maxWidth: 400 }}>
        <button onClick={() => camRef.current?.click()} disabled={busy} style={{ ...Bg, flex: 1 }}>📷 Camera</button>
        <button onClick={() => fileRef.current?.click()} disabled={busy} style={{ ...Bp, flex: 2 }}>📁 Photo Library</button>
      </div>
      {busy && (
        <div style={{ marginTop: 20, width: "100%", maxWidth: 400 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, color: "#4a7c9e", fontSize: 13, marginBottom: 8 }}>
            <span style={{ animation: "spin 1s linear infinite", display: "inline-block" }}>⟳</span>{step}
          </div>
          {ocrProgress > 0 && ocrProgress < 1 && (
            <div style={{ height: 3, background: "rgba(255,255,255,0.06)", borderRadius: 2, overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${Math.round(ocrProgress * 100)}%`, background: "linear-gradient(90deg,#4a7c9e,#2d5a7a)", transition: "width 0.2s" }} />
            </div>
          )}
        </div>
      )}
      {err && (
        <div style={{ marginTop: 14, maxWidth: 400, width: "100%", background: "rgba(180,80,80,0.1)", border: "1px solid rgba(180,80,80,0.3)", borderRadius: 10, padding: "11px 14px", fontSize: 12, color: "#c48a8a" }}>
          ⚠ {err}
        </div>
      )}
      {dueWords.length > 0 && (
        <button onClick={onStartReview} style={{ ...Bg, marginTop: 20, padding: "9px 20px", fontSize: 13 }}>
          Review {dueWords.length} due word{dueWords.length !== 1 ? "s" : ""} →
        </button>
      )}
      {dueWords.length === 0 && repeatWords.length > 0 && (
        <button onClick={onStartRepeat} style={{ ...Bg, marginTop: 20, padding: "9px 20px", fontSize: 13, borderColor: "rgba(74,124,158,0.3)", color: "#6a9ebe" }}>
          Repeat {repeatWords.length} word{repeatWords.length !== 1 ? "s" : ""} →
        </button>
      )}
    </div>
  );
}
