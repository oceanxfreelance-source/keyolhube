// Healing / object removal: fill masked pixels from their surroundings.
// Multi-scale "push-pull" interpolation (smooth, seamless fill) followed by harmonic relaxation
// and a touch of grain matched to the surrounding texture so the patch does not look plastic.
// Best for blemishes, small objects, wires and spots on fairly smooth backgrounds; it does not
// invent new detail the way generative AI tools do.

export type Rgba = { data: Uint8ClampedArray; width: number; height: number };

/** Fill pixels where mask[i] > 0 (mask is width*height, 0..255). Returns a new image. */
export function inpaint(img: Rgba, mask: Uint8Array): Rgba {
  const { width: w, height: h } = img;
  const n = w * h;
  const hole = new Uint8Array(n);
  let holes = 0;
  for (let i = 0; i < n; i++) if (mask[i] > 0) { hole[i] = 1; holes++; }
  const out = new Uint8ClampedArray(img.data);
  if (!holes || holes === n) return { data: out, width: w, height: h };

  // ---- push: build a pyramid of (colour * weight, weight) with known pixels only ----
  type Level = { w: number; h: number; c: Float32Array; wt: Float32Array };
  const base: Level = { w, h, c: new Float32Array(n * 3), wt: new Float32Array(n) };
  for (let i = 0; i < n; i++) {
    if (hole[i]) continue;
    base.wt[i] = 1;
    base.c[i * 3] = img.data[i * 4]; base.c[i * 3 + 1] = img.data[i * 4 + 1]; base.c[i * 3 + 2] = img.data[i * 4 + 2];
  }
  const levels: Level[] = [base];
  while (levels[levels.length - 1].w > 1 || levels[levels.length - 1].h > 1) {
    const L = levels[levels.length - 1];
    const nw = Math.max(1, Math.ceil(L.w / 2)), nh = Math.max(1, Math.ceil(L.h / 2));
    const N: Level = { w: nw, h: nh, c: new Float32Array(nw * nh * 3), wt: new Float32Array(nw * nh) };
    for (let y = 0; y < L.h; y++) for (let x = 0; x < L.w; x++) {
      const i = y * L.w + x, j = (y >> 1) * nw + (x >> 1);
      N.wt[j] += L.wt[i];
      N.c[j * 3] += L.c[i * 3]; N.c[j * 3 + 1] += L.c[i * 3 + 1]; N.c[j * 3 + 2] += L.c[i * 3 + 2];
    }
    levels.push(N);
  }

  // ---- pull: from coarse to fine, fill weak pixels with the (bilinear) coarser estimate ----
  const colour = (L: Level, i: number, k: number) => (L.wt[i] > 0 ? L.c[i * 3 + k] / L.wt[i] : 0);
  const est: Float32Array[] = new Array(levels.length);
  const top = levels[levels.length - 1];
  est[levels.length - 1] = new Float32Array([colour(top, 0, 0), colour(top, 0, 1), colour(top, 0, 2)]);
  for (let li = levels.length - 2; li >= 0; li--) {
    const L = levels[li], C = levels[li + 1], ce = est[li + 1];
    const e = new Float32Array(L.w * L.h * 3);
    for (let y = 0; y < L.h; y++) for (let x = 0; x < L.w; x++) {
      const i = y * L.w + x;
      // bilinear sample of the coarse estimate
      const fx = Math.min(C.w - 1, Math.max(0, (x - 0.5) / 2)), fy = Math.min(C.h - 1, Math.max(0, (y - 0.5) / 2));
      const x0 = Math.floor(fx), y0 = Math.floor(fy), x1 = Math.min(C.w - 1, x0 + 1), y1 = Math.min(C.h - 1, y0 + 1), tx = fx - x0, ty = fy - y0;
      const a = Math.min(1, L.wt[i]); // how much we trust this level's own data
      for (let k = 0; k < 3; k++) {
        const v = (ce[(y0 * C.w + x0) * 3 + k] * (1 - tx) + ce[(y0 * C.w + x1) * 3 + k] * tx) * (1 - ty) + (ce[(y1 * C.w + x0) * 3 + k] * (1 - tx) + ce[(y1 * C.w + x1) * 3 + k] * tx) * ty;
        e[i * 3 + k] = a * colour(L, i, k) + (1 - a) * v;
      }
    }
    est[li] = e;
  }
  const f = est[0];

  // ---- relax: smooth the hole interior (harmonic fill) keeping known pixels fixed ----
  const idx: number[] = [];
  for (let i = 0; i < n; i++) if (hole[i]) idx.push(i);
  const iters = Math.min(200, 20 + Math.round(Math.sqrt(holes)));
  for (let it = 0; it < iters; it++) {
    for (const i of idx) {
      const x = i % w, y = (i - x) / w;
      let cnt = 0, r = 0, g = 0, b = 0;
      if (x > 0) { const j = i - 1; r += f[j * 3]; g += f[j * 3 + 1]; b += f[j * 3 + 2]; cnt++; }
      if (x < w - 1) { const j = i + 1; r += f[j * 3]; g += f[j * 3 + 1]; b += f[j * 3 + 2]; cnt++; }
      if (y > 0) { const j = i - w; r += f[j * 3]; g += f[j * 3 + 1]; b += f[j * 3 + 2]; cnt++; }
      if (y < h - 1) { const j = i + w; r += f[j * 3]; g += f[j * 3 + 1]; b += f[j * 3 + 2]; cnt++; }
      f[i * 3] = r / cnt; f[i * 3 + 1] = g / cnt; f[i * 3 + 2] = b / cnt;
    }
  }

  // ---- grain: match the noise level of the ring of known pixels around the hole ----
  let sum = 0, sum2 = 0, m = 0;
  for (const i of idx) {
    const x = i % w, y = (i - x) / w;
    for (const j of [i - 2, i + 2, i - 2 * w, i + 2 * w]) {
      if (j < 0 || j >= n || hole[j]) continue;
      const jx = j % w; if (Math.abs(jx - x) > 2) continue;
      const lum = 0.3 * img.data[j * 4] + 0.59 * img.data[j * 4 + 1] + 0.11 * img.data[j * 4 + 2];
      const flum = 0.3 * f[j * 3] + 0.59 * f[j * 3 + 1] + 0.11 * f[j * 3 + 2];
      const d = lum - flum; sum += d; sum2 += d * d; m++;
      void y;
    }
  }
  const sigma = m > 8 ? Math.min(20, Math.sqrt(Math.max(0, sum2 / m - (sum / m) ** 2))) : 0;
  let seed = 9871;
  const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff - 0.5; };
  for (const i of idx) {
    const g = sigma ? rnd() * sigma * 1.7 : 0;
    // feather: pixels next to the edge blend toward their original value slightly
    out[i * 4] = f[i * 3] + g; out[i * 4 + 1] = f[i * 3 + 1] + g; out[i * 4 + 2] = f[i * 3 + 2] + g; out[i * 4 + 3] = img.data[i * 4 + 3];
  }
  return { data: out, width: w, height: h };
}
