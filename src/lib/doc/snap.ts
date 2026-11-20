import type { Box } from "./geometry";

export type Guide = { axis: "x" | "y"; pos: number; from: number; to: number };
export type SnapResult = { dx: number; dy: number; guides: Guide[] };

const xs = (b: Box) => [b.x, b.x + b.width / 2, b.x + b.width];
const ys = (b: Box) => [b.y, b.y + b.height / 2, b.y + b.height];

/**
 * Smart snapping: align the moving box's edges/centre to the edges/centres of other boxes
 * (the page box included). `threshold` is in document pixels (callers divide screen px by zoom).
 */
export function snapBox(moving: Box, targets: Box[], threshold: number): SnapResult {
  let best = { x: { d: Infinity, pos: 0 }, y: { d: Infinity, pos: 0 } };
  for (const t of targets) {
    for (const m of xs(moving)) for (const v of xs(t)) {
      const d = v - m;
      if (Math.abs(d) <= threshold && Math.abs(d) < Math.abs(best.x.d)) best = { ...best, x: { d, pos: v } };
    }
    for (const m of ys(moving)) for (const v of ys(t)) {
      const d = v - m;
      if (Math.abs(d) <= threshold && Math.abs(d) < Math.abs(best.y.d)) best = { ...best, y: { d, pos: v } };
    }
  }
  const dx = Number.isFinite(best.x.d) ? best.x.d : 0;
  const dy = Number.isFinite(best.y.d) ? best.y.d : 0;
  const moved: Box = { ...moving, x: moving.x + dx, y: moving.y + dy };
  const guides: Guide[] = [];
  // Draw every alignment that now holds exactly, spanning the boxes involved.
  for (const t of targets) {
    for (const v of xs(t)) if (Number.isFinite(best.x.d) && xs(moved).some((m) => Math.abs(m - v) < 0.5)) {
      guides.push({ axis: "x", pos: v, from: Math.min(t.y, moved.y), to: Math.max(t.y + t.height, moved.y + moved.height) });
    }
    for (const v of ys(t)) if (Number.isFinite(best.y.d) && ys(moved).some((m) => Math.abs(m - v) < 0.5)) {
      guides.push({ axis: "y", pos: v, from: Math.min(t.x, moved.x), to: Math.max(t.x + t.width, moved.x + moved.width) });
    }
  }
  return { dx, dy, guides };
}
