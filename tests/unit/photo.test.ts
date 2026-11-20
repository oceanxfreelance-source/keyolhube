import { describe, expect, it } from "vitest";
import { applyAdjustments, curveLut, isNeutral, toneLuts, type Pixels } from "@/lib/photo/adjust";

const img = (w: number, h: number, f: (x: number, y: number) => [number, number, number]): Pixels => {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const [r, g, b] = f(x, y); data.set([r, g, b, 255], (y * w + x) * 4); }
  return { data, width: w, height: h };
};
const px = (p: Pixels, x: number, y: number) => Array.from(p.data.slice((y * p.width + x) * 4, (y * p.width + x) * 4 + 4));

describe("photo adjustments", () => {
  it("neutral settings change nothing", () => {
    const p = img(4, 4, (x) => [x * 60, 100, 200]);
    const before = p.data.slice();
    expect(isNeutral({ exposure: 0, curves: { rgb: [[0, 0], [255, 255]] } })).toBe(true);
    applyAdjustments(p, { exposure: 0, contrast: 0 });
    expect(p.data).toEqual(before);
  });
  it("exposure +1 stop doubles linear light", () => {
    const [r] = toneLuts({ exposure: 1 });
    expect(r[128]).toBeGreaterThan(170); expect(r[128]).toBeLessThan(178); // (0.502^2.2*2)^(1/2.2)*255 ≈ 175
    expect(r[0]).toBe(0);
  });
  it("contrast spreads tones around the middle", () => {
    const [r] = toneLuts({ contrast: 50 });
    expect(r[64]).toBeLessThan(64); expect(r[192]).toBeGreaterThan(192); expect(Math.abs(r[128] - 128)).toBeLessThanOrEqual(1);
  });
  it("curves pass through their points and stay monotone", () => {
    const lut = curveLut([[0, 0], [64, 100], [192, 200], [255, 255]]);
    expect(lut[64]).toBe(100); expect(lut[192]).toBe(200);
    for (let i = 1; i < 256; i++) expect(lut[i]).toBeGreaterThanOrEqual(lut[i - 1]);
  });
  it("levels map black/white points", () => {
    const [r] = toneLuts({ levels: { inBlack: 50, inWhite: 200, gamma: 1, outBlack: 0, outWhite: 255 } });
    expect(r[50]).toBe(0); expect(r[200]).toBe(255); expect(r[125]).toBeGreaterThan(120); expect(r[125]).toBeLessThan(135);
  });
  it("saturation -100 makes grey; warm temperature raises red over blue", () => {
    const p = img(1, 1, () => [200, 80, 40]);
    applyAdjustments(p, { saturation: -100 });
    const [r, g, b] = px(p, 0, 0);
    expect(r).toBe(g); expect(g).toBe(b);
    const q = img(1, 1, () => [128, 128, 128]);
    applyAdjustments(q, { temperature: 60 });
    expect(px(q, 0, 0)[0]).toBeGreaterThan(px(q, 0, 0)[2]);
  });
  it("HSL band only changes its colour range", () => {
    const p = img(2, 1, (x) => (x === 0 ? [30, 60, 220] : [220, 40, 30])); // blue, red
    applyAdjustments(p, { hsl: { blue: { s: -100 } } });
    const blue = px(p, 0, 0), red = px(p, 1, 0);
    expect(Math.max(...blue.slice(0, 3)) - Math.min(...blue.slice(0, 3))).toBeLessThan(80); // desaturated
    expect(red.slice(0, 3)).toEqual([220, 40, 30]); // untouched
  });
  it("shadows lift dark tones more than bright ones", () => {
    const p = img(2, 1, (x) => (x === 0 ? [30, 30, 30] : [220, 220, 220]));
    applyAdjustments(p, { shadows: 80 });
    expect(px(p, 0, 0)[0] - 30).toBeGreaterThan(Math.abs(px(p, 1, 0)[0] - 220));
  });
  it("blur smooths, sharpen strengthens edges, noise reduction keeps edges", () => {
    const edge = () => img(40, 10, (x) => (x < 20 ? [0, 0, 0] : [255, 255, 255]));
    const b = edge(); applyAdjustments(b, { blur: 50 });
    expect(px(b, 19, 5)[0]).toBeGreaterThan(30); expect(px(b, 20, 5)[0]).toBeLessThan(225);
    const s = img(40, 10, (x) => (x < 20 ? [100, 100, 100] : [150, 150, 150])); applyAdjustments(s, { sharpen: 100 });
    expect(px(s, 19, 5)[0]).toBeLessThan(100); expect(px(s, 20, 5)[0]).toBeGreaterThan(150);
    let seed = 7; const noisy = img(40, 10, (x) => { seed = (seed * 16807) % 2147483647; const n = (seed % 20) - 10; const v = (x < 20 ? 60 : 200) + n; return [v, v, v]; });
    const varBefore = variance(noisy, 2, 18);
    applyAdjustments(noisy, { noise: 100 });
    expect(variance(noisy, 2, 18)).toBeLessThan(varBefore * 0.6);
    expect(px(noisy, 25, 5)[0] - px(noisy, 15, 5)[0]).toBeGreaterThan(110); // edge kept
  });
  it("vignette darkens corners, not the centre; grain is deterministic", () => {
    const p = img(50, 50, () => [200, 200, 200]);
    applyAdjustments(p, { vignette: 80 });
    expect(px(p, 25, 25)[0]).toBe(200); expect(px(p, 0, 0)[0]).toBeLessThan(120);
    const g1 = img(10, 10, () => [128, 128, 128]), g2 = img(10, 10, () => [128, 128, 128]);
    applyAdjustments(g1, { grain: 50 }); applyAdjustments(g2, { grain: 50 });
    expect(g1.data).toEqual(g2.data);
  });
});

function variance(p: Pixels, x0: number, x1: number) {
  const v: number[] = [];
  for (let y = 0; y < p.height; y++) for (let x = x0; x < x1; x++) v.push(px(p, x, y)[0]);
  const m = v.reduce((a, b) => a + b, 0) / v.length;
  return v.reduce((a, b) => a + (b - m) ** 2, 0) / v.length;
}
