import { describe, expect, it } from "vitest";
import { inpaint } from "@/lib/photo/inpaint";

function img(w: number, h: number, f: (x: number, y: number) => [number, number, number]) {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) data.set([...f(x, y), 255], (y * w + x) * 4);
  return { data, width: w, height: h };
}
const disc = (w: number, h: number, cx: number, cy: number, r: number) => {
  const m = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r) m[y * w + x] = 255;
  return m;
};

describe("inpaint", () => {
  it("removes an object from a flat background and leaves other pixels untouched", () => {
    const w = 80, h = 60;
    const src = img(w, h, (x, y) => ((x - 40) ** 2 + (y - 30) ** 2 <= 100 ? [255, 0, 0] : [30, 120, 200]));
    const before = src.data.slice();
    const out = inpaint(src, disc(w, h, 40, 30, 12));
    const at = (x: number, y: number) => Array.from(out.data.slice((y * w + x) * 4, (y * w + x) * 4 + 3));
    expect(at(40, 30)).toEqual([30, 120, 200]);           // red object gone
    expect(at(5, 5)).toEqual([30, 120, 200]);
    for (let i = 0; i < w * h * 4; i++) {                 // pixels outside the mask unchanged
      const p = i >> 2, x = p % w, y = (p - x) / w;
      if ((x - 40) ** 2 + (y - 30) ** 2 > 144) expect(out.data[i]).toBe(before[i]);
    }
  });
  it("continues a smooth gradient through the hole", () => {
    const w = 100, h = 40;
    const src = img(w, h, (x) => [Math.round((x / (w - 1)) * 255), 80, 80]);
    const out = inpaint(src, disc(w, h, 50, 20, 10));
    const r = out.data[(20 * w + 50) * 4];
    expect(Math.abs(r - Math.round((50 / 99) * 255))).toBeLessThan(10);
  });
  it("does nothing without a mask", () => {
    const src = img(10, 10, () => [1, 2, 3]);
    expect(inpaint(src, new Uint8Array(100)).data).toEqual(src.data);
  });
});
