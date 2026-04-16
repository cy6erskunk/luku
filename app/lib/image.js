export function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const MAX = 1024, scale = Math.min(1, MAX / Math.max(img.width, img.height));
        const c = document.createElement("canvas");
        c.width = Math.round(img.width * scale);
        c.height = Math.round(img.height * scale);
        const ctx = c.getContext("2d");
        if (!ctx) { reject(new Error("Canvas 2D context unavailable")); return; }
        ctx.drawImage(img, 0, 0, c.width, c.height);
        let quality = 0.85;
        let base64 = c.toDataURL("image/jpeg", quality).split(",")[1];
        while (base64.length > 400000 && quality > 0.4) {
          quality -= 0.1;
          base64 = c.toDataURL("image/jpeg", quality).split(",")[1];
        }
        resolve({ base64, mediaType: "image/jpeg" });
      };
      img.onerror = () => reject(new Error("Cannot decode image"));
      img.src = e.target.result;
    };
    reader.onerror = () => reject(new Error("FileReader failed"));
    reader.readAsDataURL(file);
  });
}

export function getCroppedImg(imageSrc, pixelCrop) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement("canvas");
      c.width = pixelCrop.width;
      c.height = pixelCrop.height;
      const ctx = c.getContext("2d");
      if (!ctx) { reject(new Error("Canvas 2D context unavailable")); return; }
      ctx.drawImage(
        img,
        pixelCrop.x, pixelCrop.y, pixelCrop.width, pixelCrop.height,
        0, 0, pixelCrop.width, pixelCrop.height
      );
      let quality = 0.85;
      let base64 = c.toDataURL("image/jpeg", quality).split(",")[1];
      while (base64.length > 400000 && quality > 0.4) {
        quality -= 0.1;
        base64 = c.toDataURL("image/jpeg", quality).split(",")[1];
      }
      resolve({ base64, mediaType: "image/jpeg" });
    };
    img.onerror = () => reject(new Error("Cannot decode image"));
    img.src = imageSrc;
  });
}
