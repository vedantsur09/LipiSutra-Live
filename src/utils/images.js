const THUMB_MAX_SIDE = 800;
const THUMB_QUALITY = 0.7;
// Keeps the thumbnail well under Firestore's 1 MB document limit
const THUMB_MAX_CHARS = 300000;

export function isSupportedImage(file) {
  return Boolean(file && file.type.startsWith("image/"));
}

// Reads a File into the base64 payload Gemini expects
export function readFileAsBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1]);
    reader.onerror = () => reject(reader.error || new Error("Could not read the image file."));
    reader.readAsDataURL(file);
  });
}

// Downscaled JPEG data URL for the historian queue; null if it cannot be made small enough
export function createThumbnail(imageSrc) {
  return new Promise(resolve => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, THUMB_MAX_SIDE / Math.max(img.width, img.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL("image/jpeg", THUMB_QUALITY);
      resolve(dataUrl.length <= THUMB_MAX_CHARS ? dataUrl : null);
    };
    img.onerror = () => resolve(null);
    img.src = imageSrc;
  });
}
