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

export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('image_decode_failed'));
    img.src = src;
  });
}

/** Minimum scale so the image fully covers a square viewport (object-fit: cover). */
export function coverScale(imgW: number, imgH: number, viewSize: number): number {
  if (!imgW || !imgH || !viewSize) return 1;
  return Math.max(viewSize / imgW, viewSize / imgH);
}

/**
 * Clamp pan offsets so a circle of diameter `viewSize` stays filled by the image
 * when drawn centered with the given scale.
 */
export function clampCoverOffset(
  imgW: number,
  imgH: number,
  viewSize: number,
  scale: number,
  offsetX: number,
  offsetY: number,
): { x: number; y: number } {
  const half = viewSize / 2;
  const halfW = (imgW * scale) / 2;
  const halfH = (imgH * scale) / 2;
  const maxX = Math.max(0, halfW - half);
  const maxY = Math.max(0, halfH - half);
  return {
    x: Math.min(maxX, Math.max(-maxX, offsetX)),
    y: Math.min(maxY, Math.max(-maxY, offsetY)),
  };
}

/**
 * Export a square JPEG crop of `src` as it appears in a circular cover viewport.
 * `offsetX`/`offsetY` are pan deltas in viewport pixels; `scale` is absolute
 * (pixels of image per viewport pixel inverted — image drawn at width*scale).
 */
export async function exportCoverCropDataUrl(
  src: string,
  viewSize: number,
  scale: number,
  offsetX: number,
  offsetY: number,
  outSize = 384,
  quality = 0.85,
): Promise<string> {
  const img = await loadImage(src);
  const canvas = document.createElement('canvas');
  canvas.width = outSize;
  canvas.height = outSize;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas_unavailable');

  const r = outSize / viewSize;
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, outSize, outSize);
  ctx.save();
  ctx.beginPath();
  ctx.arc(outSize / 2, outSize / 2, outSize / 2, 0, Math.PI * 2);
  ctx.closePath();
  ctx.clip();
  ctx.setTransform(scale * r, 0, 0, scale * r, outSize / 2 + offsetX * r, outSize / 2 + offsetY * r);
  ctx.drawImage(img, -img.naturalWidth / 2, -img.naturalHeight / 2);
  ctx.restore();
  return canvas.toDataURL('image/jpeg', quality);
}
