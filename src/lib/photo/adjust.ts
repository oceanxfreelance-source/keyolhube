// Non-destructive photo adjustments. The original image is never modified: these settings are
// stored on the image element and applied whenever it is drawn (canvas, thumbnails, exports).
// Pure functions on RGBA pixel buffers, so they run anywhere and are unit-tested.

export type CurvePoint = [number, number]; // input, output in 0..255
export interface Levels { inBlack: number; inWhite: number; gamma: number; outBlack: number; outWhite: number }
export type HslBand = "red" | "orange" | "yellow" | "green" | "aqua" | "blue" | "purple" | "magenta";
export const HSL_BANDS: HslBand[] = ["red", "orange", "yellow", "green", "aqua", "blue", "purple", "magenta"];
const BAND_HUE: Record<HslBand, number> = { red: 0, orange: 30, yellow: 60, green: 120, aqua: 180, blue: 225, purple: 270, magenta: 315 };

export interface Adjustments {
  exposure?: number; // stops, -3..3
  brightness?: number; // -100..100
  contrast?: number; // -100..100
  highlights?: number; // -100..100
  shadows?: number; // -100..100
  whites?: number; // -100..100
  blacks?: number; // -100..100
  temperature?: number; // -100 (cool) .. 100 (warm)
  tint?: number; // -100 (green) .. 100 (magenta)
  saturation?: number; // -100..100
  vibrance?: number; // -100..100
  hue?: number; // -180..180 degrees
  hsl?: Partial<Record<HslBand, { h?: number; s?: number; l?: number }>>; // per colour band
  curves?: { rgb?: CurvePoint[]; r?: CurvePoint[]; g?: CurvePoint[]; b?: CurvePoint[] };
  levels?: Levels;
  sharpen?: number; // 0..100
  blur?: number; // 0..100 (radius in image pixels at 1:1)
  noise?: number; // noise reduction 0..100
  vignette?: number; // -100 (light) .. 100 (dark)
  grain?: number; // 0..100
}

export type Pixels = { data: Uint8ClampedArray; width: number; height: number };

export const isNeutral = (a?: Adjustments | null) => !a || Object.keys(a).every((k) => {
  const v = (a as Record<string, unknown>)[k];
  if (typeof v === "number") return v === 0;
  if (k === "curves") return !v || Object.values(v as object).every((c) => !c || isIdentityCurve(c as CurvePoint[]));
  if (k === "levels") { const l = v as Levels | undefined; return !l || (l.inBlack === 0 && l.inWhite === 255 && l.gamma === 1 && l.outBlack === 0 && l.outWhite === 255); }
  if (k === "hsl") return !v || Object.values(v as object).every((b) => !b || Object.values(b).every((x) => !x));
  return true;
});

const isIdentityCurve = (c: CurvePoint[]) => c.every(([x, y]) => x === y);
const clamp = (v: number, lo = 0, hi = 255) => (v < lo ? lo : v > hi ? hi : v);

/** Monotone cubic interpolation (Fritsch–Carlson) through curve points -> 256-entry table. */
export function curveLut(points: CurvePoint[]): Uint8ClampedArray {
  const pts = [...points].sort((a, b) => a[0] - b[0]);
  if (pts[0][0] > 0) pts.unshift([0, pts[0][1]]);
  if (pts[pts.length - 1][0] < 255) pts.push([255, pts[pts.length - 1][1]]);
  const n = pts.length, xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
  const d = new Array(n - 1).fill(0).map((_, i) => (ys[i + 1] - ys[i]) / Math.max(1e-6, xs[i + 1] - xs[i]));
  const m = new Array(n).fill(0);
  m[0] = d[0]; m[n - 1] = d[n - 2];
  for (let i = 1; i < n - 1; i++) m[i] = d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2;
  for (let i = 0; i < n - 1; i++) {
    if (d[i] === 0) { m[i] = 0; m[i + 1] = 0; continue; }
    const a = m[i] / d[i], b = m[i + 1] / d[i], h = a * a + b * b;
    if (h > 9) { const t = 3 / Math.sqrt(h); m[i] = t * a * d[i]; m[i + 1] = t * b * d[i]; }
  }
  const lut = new Uint8ClampedArray(256);
  let k = 0;
  for (let x = 0; x < 256; x++) {
    while (k < n - 2 && x > xs[k + 1]) k++;
    const h = xs[k + 1] - xs[k], t = h ? (x - xs[k]) / h : 0;
    const t2 = t * t, t3 = t2 * t;
    lut[x] = Math.round((2 * t3 - 3 * t2 + 1) * ys[k] + (t3 - 2 * t2 + t) * h * m[k] + (-2 * t3 + 3 * t2) * ys[k + 1] + (t3 - t2) * h * m[k + 1]);
  }
  return lut;
}

/** Tone tables per channel: exposure, brightness, contrast, whites/blacks, levels, curves. */
export function toneLuts(a: Adjustments): [Uint8ClampedArray, Uint8ClampedArray, Uint8ClampedArray] {
  const base = new Float64Array(256);
  const ev = Math.pow(2, a.exposure ?? 0);
  const br = (a.brightness ?? 0) / 100, ct = (a.contrast ?? 0) / 100;
  const cf = ct >= 0 ? 1 + ct * 2 : 1 + ct; // contrast factor
  const wh = (a.whites ?? 0) / 100, bl = (a.blacks ?? 0) / 100;
  const L = a.levels;
  for (let i = 0; i < 256; i++) {
    let v = i / 255;
    v = Math.pow(Math.pow(v, 2.2) * ev, 1 / 2.2); // exposure in linear light
    v = br >= 0 ? v + (1 - v) * br * 0.6 * v ** 0.5 : v * (1 + br * 0.6); // brightness (protects ends)
    v = (v - 0.5) * cf + 0.5;
    v += wh * 0.25 * v * v - bl * 0.25 * (1 - v) * (1 - v); // whites lift top, blacks lift bottom
    if (L) {
      const x = clamp((v * 255 - L.inBlack) / Math.max(1, L.inWhite - L.inBlack), 0, 1);
      v = (L.outBlack + Math.pow(x, 1 / Math.max(0.05, L.gamma)) * (L.outWhite - L.outBlack)) / 255;
    }
    base[i] = clamp(v * 255);
  }
  const rgb = a.curves?.rgb && !isIdentityCurve(a.curves.rgb) ? curveLut(a.curves.rgb) : null;
  const ch = (c?: CurvePoint[]) => (c && !isIdentityCurve(c) ? curveLut(c) : null);
  const per = [ch(a.curves?.r), ch(a.curves?.g), ch(a.curves?.b)];
  return per.map((cl) => {
    const out = new Uint8ClampedArray(256);
    for (let i = 0; i < 256; i++) {
      let v = Math.round(base[i]);
      if (rgb) v = rgb[v];
      if (cl) v = cl[v];
      out[i] = v;
    }
    return out;
  }) as [Uint8ClampedArray, Uint8ClampedArray, Uint8ClampedArray];
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2;
  if (mx === mn) return [0, 0, l];
  const d = mx - mn, s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
  const h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, s, l];
}
function hue2rgb(p: number, q: number, t: number) {
  if (t < 0) t += 1; if (t > 1) t -= 1;
  if (t < 1 / 6) return p + (q - p) * 6 * t;
  if (t < 1 / 2) return q;
  if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
  return p;
}
function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  if (s === 0) return [l, l, l];
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q, hh = (((h % 360) + 360) % 360) / 360;
  return [hue2rgb(p, q, hh + 1 / 3), hue2rgb(p, q, hh), hue2rgb(p, q, hh - 1 / 3)];
}

function boxBlur(src: Float32Array<ArrayBufferLike>, w: number, h: number, r: number): Float32Array<ArrayBufferLike> {
  // Separable box blur of one channel plane; 3 passes approximate a Gaussian.
  if (r < 1) return src;
  const tmp = new Float32Array(src.length), out = new Float32Array(src.length);
  const pass = (from: Float32Array, to: Float32Array, horiz: boolean) => {
    const len = horiz ? w : h, lines = horiz ? h : w, step = horiz ? 1 : w, lineStep = horiz ? w : 1, inv = 1 / (2 * r + 1);
    for (let l = 0; l < lines; l++) {
      const o = l * lineStep;
      let acc = 0;
      for (let i = -r; i <= r; i++) acc += from[o + clamp(i, 0, len - 1) * step];
      for (let i = 0; i < len; i++) {
        to[o + i * step] = acc * inv;
        acc += from[o + Math.min(len - 1, i + r + 1) * step] - from[o + Math.max(0, i - r) * step];
      }
    }
  };
  let a = src;
  for (let k = 0; k < 3; k++) { pass(a, tmp, true); pass(tmp, out, false); a = k < 2 ? out.slice() : out; }
  return out;
}

/**
 * Apply adjustments in place. `scale` = output pixels per source pixel at 1:1, so radius-based
 * effects (blur, sharpen, noise reduction) look the same on screen and in exports.
 */
export function applyAdjustments(px: Pixels, a: Adjustments, scale = 1): void {
  if (isNeutral(a)) return;
  const { data, width: w, height: h } = px;
  const n = w * h;
  const [lr, lg, lb] = toneLuts(a);
  const temp = (a.temperature ?? 0) / 100, tint = (a.tint ?? 0) / 100;
  const gr = 1 + temp * 0.15 + tint * 0.05, gg = 1 - tint * 0.12, gb = 1 - temp * 0.15 + tint * 0.05;
  const sat = (a.saturation ?? 0) / 100, vib = (a.vibrance ?? 0) / 100, hueShift = a.hue ?? 0;
  const hi = (a.highlights ?? 0) / 100, sh = (a.shadows ?? 0) / 100;
  const bands = a.hsl ? HSL_BANDS.filter((bnd) => a.hsl?.[bnd] && Object.values(a.hsl[bnd]!).some((x) => x)) : [];
  const needColour = sat || vib || hueShift || bands.length;

  for (let i = 0; i < n; i++) {
    const o = i * 4;
    let r = lr[data[o]] / 255, g = lg[data[o + 1]] / 255, b = lb[data[o + 2]] / 255;
    if (temp || tint) { r = clamp(r * gr, 0, 1); g = clamp(g * gg, 0, 1); b = clamp(b * gb, 0, 1); }
    if (hi || sh) {
      const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      const wS = (1 - lum) * (1 - lum), wH = lum * lum; // smooth masks
      const d = sh * 0.45 * wS * (1 - lum) * 2 + hi * 0.45 * wH * (hi < 0 ? lum : 1 - lum) * 2;
      r = clamp(r + d, 0, 1); g = clamp(g + d, 0, 1); b = clamp(b + d, 0, 1);
    }
    if (needColour) {
      let [H, S, Lh] = rgbToHsl(r, g, b);
      for (const bnd of bands) {
        const c = BAND_HUE[bnd];
        let dist = Math.abs(H - c); if (dist > 180) dist = 360 - dist;
        const wgt = Math.max(0, 1 - dist / 45) * Math.min(1, S * 4); // soft band, ignores greys
        if (!wgt) continue;
        const adj = a.hsl![bnd]!;
        H += (adj.h ?? 0) * 0.3 * wgt;
        S = clamp(S * (1 + ((adj.s ?? 0) / 100) * wgt), 0, 1);
        Lh = clamp(Lh + ((adj.l ?? 0) / 100) * 0.3 * wgt * S, 0, 1);
      }
      if (vib) S = clamp(S + vib * (1 - S) * S * (vib > 0 ? 1.5 : 1), 0, 1);
      if (sat) S = clamp(S * (1 + sat), 0, 1);
      H += hueShift;
      [r, g, b] = hslToRgb(H, S, Lh);
    }
    data[o] = r * 255; data[o + 1] = g * 255; data[o + 2] = b * 255;
  }

  const blurR = Math.round(((a.blur ?? 0) / 100) * 40 * scale);
  const sharp = (a.sharpen ?? 0) / 100, nr = (a.noise ?? 0) / 100;
  if (blurR >= 1 || sharp || nr) {
    const planes = [0, 1, 2].map((c) => { const p = new Float32Array(n); for (let i = 0; i < n; i++) p[i] = data[i * 4 + c]; return p; });
    for (let c = 0; c < 3; c++) {
      let p: Float32Array<ArrayBufferLike> = planes[c];
      if (nr) {
        // Edge-aware smoothing: blend toward the local mean only where the difference is small.
        const m = boxBlur(p, w, h, Math.max(1, Math.round(1.5 * scale)));
        const thr = 8 + nr * 40;
        const q = new Float32Array(n);
        for (let i = 0; i < n; i++) { const d = Math.abs(p[i] - m[i]); const k = nr * Math.max(0, 1 - d / thr); q[i] = p[i] + (m[i] - p[i]) * k; }
        p = q;
      }
      if (blurR >= 1) p = boxBlur(p, w, h, Math.max(1, Math.round(blurR / 2)));
      if (sharp) {
        const m = boxBlur(p, w, h, Math.max(1, Math.round(1 * scale)));
        const q = new Float32Array(n);
        for (let i = 0; i < n; i++) q[i] = p[i] + (p[i] - m[i]) * sharp * 1.6;
        p = q;
      }
      for (let i = 0; i < n; i++) data[i * 4 + c] = p[i];
    }
  }

  const vig = (a.vignette ?? 0) / 100, grain = (a.grain ?? 0) / 100;
  if (vig || grain) {
    const cx = w / 2, cy = h / 2, maxD = Math.hypot(cx, cy);
    let seed = 12345; // deterministic grain: same result on screen and in exports
    const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff) - 0.5;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const o = (y * w + x) * 4;
      let f = 1;
      if (vig) { const d = Math.hypot(x - cx, y - cy) / maxD; f = 1 - vig * Math.pow(Math.max(0, d - 0.35) / 0.65, 2) * 0.85; }
      const gnz = grain ? rnd() * grain * 40 : 0;
      data[o] = data[o] * f + gnz; data[o + 1] = data[o + 1] * f + gnz; data[o + 2] = data[o + 2] * f + gnz;
    }
  }
}

export const PRESETS: { id: string; name: string; adjust: Adjustments }[] = [
  { id: "none", name: "Original", adjust: {} },
  { id: "auto", name: "Enhance", adjust: { contrast: 12, vibrance: 25, shadows: 15, highlights: -10, sharpen: 20 } },
  { id: "vivid", name: "Vivid", adjust: { contrast: 18, saturation: 20, vibrance: 30 } },
  { id: "warm", name: "Warm", adjust: { temperature: 35, vibrance: 10 } },
  { id: "cool", name: "Cool", adjust: { temperature: -35, tint: 5 } },
  { id: "bw", name: "Black & white", adjust: { saturation: -100, contrast: 15 } },
  { id: "noir", name: "Noir", adjust: { saturation: -100, contrast: 45, blacks: -20, vignette: 40 } },
  { id: "vintage", name: "Vintage", adjust: { temperature: 25, saturation: -25, contrast: -10, curves: { rgb: [[0, 25], [128, 128], [255, 235]] }, vignette: 30, grain: 25 } },
  { id: "fade", name: "Fade", adjust: { contrast: -20, curves: { rgb: [[0, 40], [255, 245]] }, saturation: -10 } },
  { id: "drama", name: "Drama", adjust: { contrast: 35, highlights: -40, shadows: 30, vibrance: 20, vignette: 35, sharpen: 30 } },
  { id: "portrait", name: "Portrait", adjust: { exposure: 0.15, shadows: 20, noise: 35, hsl: { orange: { s: -10, l: 10 } }, vibrance: 10 } },
];
