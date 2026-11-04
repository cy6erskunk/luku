const MAX_SIDE = 1024;
const MAX_BASE64_LENGTH = 400000;

function readAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(e.target.result);
    reader.onerror = () => reject(new Error("FileReader failed"));
    reader.readAsDataURL(file);
  });
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Cannot decode image"));
    img.src = src;
  });
}

/**
 * Draws one region of `img` onto a `width` × `height` canvas and encodes it as
 * JPEG, stepping the quality down until it fits the size budget or reaches
 * its floor.
 */
function encodeJpeg(img, region, width, height) {
  const c = document.createElement("canvas");
  c.width = width;
  c.height = height;
  const ctx = c.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D context unavailable");
  ctx.drawImage(img, region.x, region.y, region.width, region.height, 0, 0, width, height);
  let quality = 0.85;
  let base64 = c.toDataURL("image/jpeg", quality).split(",")[1];
  while (base64.length > MAX_BASE64_LENGTH && quality > 0.4) {
    quality -= 0.1;
    base64 = c.toDataURL("image/jpeg", quality).split(",")[1];
  }
  return { base64, mediaType: "image/jpeg" };
}

/** The whole image, scaled so its longer side is at most 1024px. */
export async function fileToBase64(file) {
  const img = await loadImage(await readAsDataUrl(file));
  const scale = Math.min(1, MAX_SIDE / Math.max(img.width, img.height));
  const whole = { x: 0, y: 0, width: img.width, height: img.height };
  return encodeJpeg(img, whole, Math.round(img.width * scale), Math.round(img.height * scale));
}

/** One region of the image, at full resolution. */
export async function getCroppedImg(imageSrc, pixelCrop) {
  const img = await loadImage(imageSrc);
  return encodeJpeg(img, pixelCrop, pixelCrop.width, pixelCrop.height);
}
