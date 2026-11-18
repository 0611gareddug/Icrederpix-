// 픽셀 그리기 도우미
export function mkCanvas(w, h) {
  const c = typeof OffscreenCanvas !== 'undefined' && !globalThis.document
    ? new OffscreenCanvas(w, h)
    : Object.assign(document.createElement('canvas'), { width: w, height: h });
  const ctx = c.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  return [c, ctx];
}
export function px(ctx, x, y, c, w = 1, h = 1) {
  ctx.fillStyle = c;
  ctx.fillRect(x, y, w, h);
}
// 불투명 픽셀 주변에 외곽선
export function outline(c, ctx, color) {
  const w = c.width, h = c.height;
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  const out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x;
    if (d[i * 4 + 3] > 0) continue;
    const n = (x > 0 && d[(i - 1) * 4 + 3] > 0) || (x < w - 1 && d[(i + 1) * 4 + 3] > 0) ||
      (y > 0 && d[(i - w) * 4 + 3] > 0) || (y < h - 1 && d[(i + w) * 4 + 3] > 0);
    if (n) out[i] = 1;
  }
  const r = parseInt(color.slice(1, 3), 16), g = parseInt(color.slice(3, 5), 16), b = parseInt(color.slice(5, 7), 16);
  for (let i = 0; i < w * h; i++) if (out[i]) { d[i * 4] = r; d[i * 4 + 1] = g; d[i * 4 + 2] = b; d[i * 4 + 3] = 255; }
  ctx.putImageData(img, 0, 0);
}
export function rotated(src, rot) {
  if (!rot) return src;
  const w = src.width, h = src.height;
  const [c, ctx] = rot % 2 ? mkCanvas(h, w) : mkCanvas(w, h);
  ctx.translate(c.width / 2, c.height / 2);
  ctx.rotate((rot * Math.PI) / 2);
  ctx.drawImage(src, -w / 2, -h / 2);
  return c;
}
export function flipped(src) {
  const [c, ctx] = mkCanvas(src.width, src.height);
  ctx.translate(src.width, 0); ctx.scale(-1, 1);
  ctx.drawImage(src, 0, 0);
  return c;
}
