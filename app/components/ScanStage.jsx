import * as stylex from "@stylexjs/stylex";
import Cropper from "react-easy-crop";
import { buttonStyles, shared } from "../lib/styles.js";

const s = stylex.create({
  wrap: {
    padding: "20px",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
  },
  mainWrap: {
    padding: "36px 20px",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
  },
  cropLabel: {
    marginBottom: 10,
  },
  desc: {
    color: "#6b645e",
    textAlign: "center",
    marginBottom: 14,
    maxWidth: 300,
    fontSize: 13,
    lineHeight: 1.6,
  },
  descScan: {
    marginBottom: 28,
  },
  cropperWrap: {
    position: "relative",
    width: "100%",
    maxWidth: 400,
    aspectRatio: "4/3",
    borderRadius: 14,
    overflow: "hidden",
    marginBottom: 14,
  },
  btnRow: {
    display: "flex",
    gap: 10,
    width: "100%",
    maxWidth: 400,
  },
  btnRowMargin: {
    marginBottom: 10,
  },
  flex2: {
    flex: 2,
  },
  heading: {
    fontSize: 24,
    fontWeight: 400,
    textAlign: "center",
    margin: "0 0 6px",
  },
  dropZone: {
    width: "100%",
    maxWidth: 400,
    aspectRatio: "4/3",
    borderRadius: 14,
    border: "1.5px dashed rgba(74,124,158,0.4)",
    background: "rgba(74,124,158,0.03)",
    overflow: "hidden",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "column",
    gap: 10,
    marginBottom: 14,
    position: "relative",
  },
  dropZoneBusy: {
    cursor: "default",
  },
  dropZoneReady: {
    cursor: "pointer",
  },
  dropZoneHasPreview: {
    background: "transparent",
  },
  previewImg: {
    width: "100%",
    height: "100%",
    objectFit: "cover",
  },
  placeholderIcon: {
    fontSize: 36,
    opacity: 0.15,
  },
  placeholderText: {
    color: "#4a6070",
    fontSize: 13,
    textAlign: "center",
  },
  placeholderSub: {
    opacity: 0.6,
    fontSize: 11,
  },
  corner: {
    position: "absolute",
    width: 18,
    height: 18,
  },
  cornerTL: {
    top: 8,
    left: 8,
    borderTop: "2px solid #4a7c9e",
    borderLeft: "2px solid #4a7c9e",
    borderRadius: "3px 0 0 0",
  },
  cornerTR: {
    top: 8,
    right: 8,
    borderTop: "2px solid #4a7c9e",
    borderRight: "2px solid #4a7c9e",
    borderRadius: "0 3px 0 0",
  },
  cornerBL: {
    bottom: 8,
    left: 8,
    borderBottom: "2px solid #4a7c9e",
    borderLeft: "2px solid #4a7c9e",
    borderRadius: "0 0 0 3px",
  },
  cornerBR: {
    bottom: 8,
    right: 8,
    borderBottom: "2px solid #4a7c9e",
    borderRight: "2px solid #4a7c9e",
    borderRadius: "0 0 3px 0",
  },
  hidden: {
    display: "none",
  },
  busyWrap: {
    marginTop: 20,
    width: "100%",
    maxWidth: 400,
  },
  busyRow: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    color: "#4a7c9e",
    fontSize: 13,
    marginBottom: 8,
  },
  reviewBtn: {
    marginTop: 20,
    padding: "9px 20px",
    fontSize: 13,
  },
  repeatBtn: {
    marginTop: 20,
    padding: "9px 20px",
    fontSize: 13,
    borderColor: "rgba(74,124,158,0.3)",
    color: "#6a9ebe",
  },
  scanErr: {
    marginTop: 14,
    maxWidth: 400,
    width: "100%",
  },
});

export default function ScanStage({ image, dueWords, onStartReview, repeatWords, onStartRepeat }) {
  const {
    busy, step, err, preview, ocrProgress,
    cropImage, crop, setCrop, zoom, setZoom, croppedAreaPixels, cropAspect, setCropAspect,
    onCropComplete, fileRef, camRef,
    onFile, onDrop, cropAndProcess, skipCrop, cancelCrop,
  } = image;

  if (cropImage) {
    return (
      <div {...stylex.props(s.wrap)}>
        <div {...stylex.props(shared.stepLabel, s.cropLabel)}>Crop image</div>
        <p {...stylex.props(s.desc)}>
          Drag to reposition. Pinch or scroll to zoom. Select the text area to scan.
        </p>
        <div {...stylex.props(s.cropperWrap)}>
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
        <div {...stylex.props(s.btnRow, s.btnRowMargin)}>
          <button onClick={() => setCropAspect(4 / 3)} {...stylex.props(buttonStyles.ghost, shared.flex1)} style={{ opacity: cropAspect === 4 / 3 ? 1 : 0.5 }}>▬ Horizontal</button>
          <button onClick={() => setCropAspect(3 / 4)} {...stylex.props(buttonStyles.ghost, shared.flex1)} style={{ opacity: cropAspect === 3 / 4 ? 1 : 0.5 }}>▮ Vertical</button>
        </div>
        <div {...stylex.props(s.btnRow)}>
          <button onClick={cancelCrop} {...stylex.props(buttonStyles.ghost, shared.flex1)}>Cancel</button>
          <button onClick={skipCrop} {...stylex.props(buttonStyles.ghost, shared.flex1)}>Skip crop</button>
          <button onClick={cropAndProcess} disabled={!croppedAreaPixels} {...stylex.props(buttonStyles.primary, s.flex2)}>Scan text</button>
        </div>
      </div>
    );
  }

  return (
    <div {...stylex.props(s.mainWrap)}>
      <div {...stylex.props(shared.stepLabel, s.cropLabel)}>Step 1 — Scan</div>
      <h2 {...stylex.props(s.heading)}>Photograph a Finnish page</h2>
      <p {...stylex.props(s.desc, s.descScan)}>
        Take a photo or upload an image. Text will be extracted locally.
      </p>
      <div
        onDrop={onDrop} onDragOver={(e) => e.preventDefault()}
        onClick={() => !busy && fileRef.current?.click()}
        {...stylex.props(s.dropZone, busy ? s.dropZoneBusy : s.dropZoneReady, preview && s.dropZoneHasPreview)}
      >
        {preview
          ? <img src={preview} alt="" {...stylex.props(s.previewImg)} />
          : (
            <>
              <div {...stylex.props(s.placeholderIcon)}>🖼</div>
              <div {...stylex.props(s.placeholderText)}>
                Drop image here<br /><span {...stylex.props(s.placeholderSub)}>or tap to browse</span>
              </div>
            </>
          )
        }
        <div {...stylex.props(s.corner, s.cornerTL)} />
        <div {...stylex.props(s.corner, s.cornerTR)} />
        <div {...stylex.props(s.corner, s.cornerBL)} />
        <div {...stylex.props(s.corner, s.cornerBR)} />
      </div>
      <input ref={fileRef} type="file" accept="image/*" onChange={onFile} {...stylex.props(s.hidden)} />
      <input ref={camRef} type="file" accept="image/*" capture="environment" onChange={onFile} {...stylex.props(s.hidden)} />
      <div {...stylex.props(s.btnRow)}>
        <button onClick={() => camRef.current?.click()} disabled={busy} {...stylex.props(buttonStyles.ghost, shared.flex1)}>📷 Camera</button>
        <button onClick={() => fileRef.current?.click()} disabled={busy} {...stylex.props(buttonStyles.primary, s.flex2)}>📁 Photo Library</button>
      </div>
      {busy && (
        <div {...stylex.props(s.busyWrap)}>
          <div {...stylex.props(s.busyRow)}>
            <span {...stylex.props(shared.spinner)}>⟳</span>{step}
          </div>
          {ocrProgress > 0 && ocrProgress < 1 && (
            <div {...stylex.props(shared.progressTrack)}>
              <div style={{ height: "100%", width: `${Math.round(ocrProgress * 100)}%`, background: "linear-gradient(90deg,#4a7c9e,#2d5a7a)", transition: "width 0.2s" }} />
            </div>
          )}
        </div>
      )}
      {err && (
        <div {...stylex.props(shared.errorBox, s.scanErr)}>
          ⚠ {err}
        </div>
      )}
      {dueWords.length > 0 && (
        <button onClick={onStartReview} {...stylex.props(buttonStyles.ghost, s.reviewBtn)}>
          Review {dueWords.length} due word{dueWords.length !== 1 ? "s" : ""} →
        </button>
      )}
      {dueWords.length === 0 && repeatWords.length > 0 && (
        <button onClick={onStartRepeat} {...stylex.props(buttonStyles.ghost, s.repeatBtn)}>
          Repeat {repeatWords.length} word{repeatWords.length !== 1 ? "s" : ""} →
        </button>
      )}
    </div>
  );
}
