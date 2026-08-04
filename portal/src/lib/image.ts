/**
 * Downscale a data-URL image so the longest edge is at most `maxEdge`,
 * then re-encode as JPEG at `quality`. Returns the original data URL if
 * the image cannot be decoded or is already small enough that canvas
 * would not help (non-image / decode failure falls back to original).
 */
export async function compressDataUrl(
  dataUrl: string,
  maxEdge = 1024,
  quality = 0.8,
): Promise<string> {
  if (!dataUrl.startsWith('data:image/')) {
    return dataUrl;
  }

  try {
    const img = await loadImage(dataUrl);
    const { width, height } = img;
    if (!width || !height) {
      return dataUrl;
    }

    const longest = Math.max(width, height);
    const scale = longest > maxEdge ? maxEdge / longest : 1;
    const targetW = Math.max(1, Math.round(width * scale));
    const targetH = Math.max(1, Math.round(height * scale));

    // Already within bounds and JPEG — skip re-encode to avoid quality loss.
    if (scale === 1 && dataUrl.startsWith('data:image/jpeg')) {
      return dataUrl;
    }

    const canvas = document.createElement('canvas');
    canvas.width = targetW;
    canvas.height = targetH;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return dataUrl;
    }
    ctx.drawImage(img, 0, 0, targetW, targetH);
    return canvas.toDataURL('image/jpeg', quality);
  } catch {
    return dataUrl;
  }
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('image_decode_failed'));
    img.src = src;
  });
}
