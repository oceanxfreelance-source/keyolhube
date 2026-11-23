// Design kit for layered templates: icons, patterns, badges, seals, ribbons and photo frames.
// Everything produced here is ordinary editable layers (shapes, paths, text, groups).
import * as L from "lucide";
import { make, newDoc, solid } from "../doc/factory";
import type { DesignDoc, DesignNode, EllipseNode, Fill, FontRef, GroupNode, LineNode, PathNode, PolygonNode, RectNode, StarNode, TextNode } from "../doc/types";
import { fitSize } from "./measure";
import { T, type TOpts } from "./pro";

export const NONE: Fill = { type: "none" };
export const lg = (angle: number, ...stops: [number, string][]): Fill => ({ type: "linear", angle, stops: stops.map(([offset, color]) => ({ offset, color })) });
export const rg = (...stops: [number, string][]): Fill => ({ type: "radial", stops: stops.map(([offset, color]) => ({ offset, color })) } as Fill);

export function rect(x: number, y: number, w: number, h: number, fill: Fill | string, o: Partial<RectNode> = {}): RectNode {
  return { ...make.rect(x, y, w, h), fill: typeof fill === "string" ? solid(fill) : fill, name: "Shape", ...o };
}
export function ellipse(x: number, y: number, w: number, h: number, fill: Fill | string, o: Partial<EllipseNode> = {}): EllipseNode {
  return { ...make.ellipse(x, y, w, h), fill: typeof fill === "string" ? solid(fill) : fill, name: "Circle", ...o };
}
export const circle = (cx: number, cy: number, d: number, fill: Fill | string, o: Partial<EllipseNode> = {}) => ellipse(cx - d / 2, cy - d / 2, d, d, fill, o);
export function ring(cx: number, cy: number, d: number, color: string, width: number, o: Partial<EllipseNode> = {}) {
  return circle(cx, cy, d, NONE, { stroke: { color, width }, name: "Ring", ...o });
}
export function polygon(cx: number, cy: number, d: number, sides: number, fill: Fill | string, o: Partial<PolygonNode> = {}): PolygonNode {
  return { ...make.polygon(cx - d / 2, cy - d / 2, d, sides), fill: typeof fill === "string" ? solid(fill) : fill, name: "Polygon", ...o };
}
export function star(cx: number, cy: number, d: number, points: number, inner: number, fill: Fill | string, o: Partial<StarNode> = {}): StarNode {
  return { ...make.star(cx - d / 2, cy - d / 2, d), points, innerRatio: inner, fill: typeof fill === "string" ? solid(fill) : fill, name: "Star", ...o };
}
export function line(x1: number, y1: number, x2: number, y2: number, color: string, width: number, dash?: number[]): LineNode {
  const n = make.line(x1, y1, 0, color);
  n.points = [0, 0, x2 - x1, y2 - y1];
  n.width = Math.abs(x2 - x1); n.height = Math.abs(y2 - y1);
  n.stroke = { color, width, ...(dash ? { dash } : {}), cap: "round" };
  n.name = "Line";
  return n;
}
export function path(d: string, x: number, y: number, w: number, h: number, sw: number, sh: number, fill: Fill | string, stroke: PathNode["stroke"] = null, name = "Shape"): PathNode {
  const base = make.rect(x, y, w, h);
  return { ...base, type: "path", data: d, sourceWidth: sw, sourceHeight: sh, fill: typeof fill === "string" ? solid(fill) : fill, stroke, name } as unknown as PathNode;
}
export function group(children: DesignNode[], name = "Group", mask = false, x = 0, y = 0, w = 100, h = 100): GroupNode {
  const base = make.rect(x, y, w, h);
  const { fill: _f, stroke: _s, cornerRadius: _c, ...rest } = base as RectNode;
  return { ...rest, type: "group", name, children, ...(mask ? { mask: true } : {}) } as GroupNode;
}

// ---------- icons (Lucide, ISC licence) as editable vector paths ----------
type IconNode = [string, Record<string, string | number>][];
function iconData(name: keyof typeof L): string {
  const node = (L as unknown as Record<string, IconNode>)[name as string];
  if (!node) return "";
  const n = (v: string | number | undefined) => Number(v ?? 0);
  return node.map(([tag, a]) => {
    if (tag === "path") return String(a.d);
    if (tag === "circle") { const cx = n(a.cx), cy = n(a.cy), r = n(a.r); return `M${cx - r} ${cy}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0`; }
    if (tag === "line") return `M${n(a.x1)} ${n(a.y1)}L${n(a.x2)} ${n(a.y2)}`;
    if (tag === "rect") { const x = n(a.x), y = n(a.y), w = n(a.width), h = n(a.height); return `M${x} ${y}h${w}v${h}h${-w}Z`; }
    if (tag === "polyline" || tag === "polygon") { const pts = String(a.points).trim().split(/[\s,]+/).map(Number); let d = ""; for (let i = 0; i < pts.length; i += 2) d += `${i ? "L" : "M"}${pts[i]} ${pts[i + 1]}`; return d + (tag === "polygon" ? "Z" : ""); }
    if (tag === "ellipse") { const cx = n(a.cx), cy = n(a.cy), rx = n(a.rx), ry = n(a.ry); return `M${cx - rx} ${cy}a${rx} ${ry} 0 1 0 ${2 * rx} 0a${rx} ${ry} 0 1 0 ${-2 * rx} 0`; }
    return "";
  }).join(" ");
}
export function icon(name: keyof typeof L, x: number, y: number, size: number, color: string, weight = 2): PathNode {
  return path(iconData(name), x, y, size, size, 24, 24, NONE, { color, width: (size / 24) * weight, cap: "round", join: "round" }, `Icon ${String(name)}`);
}

// ---------- text ----------
export type TextOpts = TOpts & { maxSize?: number };
/** Text sized so its longest line fits the width (never bigger than `size`). */
export function fit(x: number, y: number, w: number, text: string, size: number, o: TextOpts = {}): TextNode {
  const font = o.font ?? "Inter", weight = o.weight ?? 400;
  const s = fitSize(font, weight, text, w, size, (o.ls ?? 0) / Math.max(1, size));
  return T(x, y, w, text, s, o);
}
export function outlineText(x: number, y: number, w: number, text: string, size: number, color: string, width: number, o: TOpts = {}): TextNode {
  const n = T(x, y, w, text, size, o);
  n.fill = NONE; n.stroke = { color, width };
  n.name = "Outline text";
  return n;
}

// ---------- patterns ----------
export function dots(x: number, y: number, cols: number, rows: number, gap: number, d: number, color: string, opacity = 1): GroupNode {
  const kids: DesignNode[] = [];
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) kids.push(ellipse(c * gap, r * gap, d, d, color, { name: "Dot" }));
  const g = group(kids, "Dot pattern", false, x, y, cols * gap, rows * gap);
  g.opacity = opacity;
  return g;
}
/** Diagonal stripes clipped to a rectangle. */
export function stripes(x: number, y: number, w: number, h: number, gap: number, thick: number, color: string, angle = -30, opacity = 1): GroupNode {
  const kids: DesignNode[] = [rect(0, 0, w, h, "#000000", { name: "Mask" })];
  const len = Math.hypot(w, h) * 2;
  for (let i = -Math.ceil(len / gap); i < Math.ceil(len / gap); i++) kids.push(rect(i * gap, -h, thick, len, color, { rotation: angle, name: "Stripe" }));
  const g = group(kids, "Stripe pattern", true, x, y, w, h);
  g.opacity = opacity;
  return g;
}
/** Concentric rings (radar / halftone feel). */
export function rings(cx: number, cy: number, d: number, n: number, color: string, width: number, opacity = 1): GroupNode {
  const kids = Array.from({ length: n }, (_, i) => ring(d / 2, d / 2, d * (1 - i / n), color, width));
  const g = group(kids, "Rings", false, cx - d / 2, cy - d / 2, d, d);
  g.opacity = opacity;
  return g;
}

// ---------- badges, seals, ribbons ----------
export function seal(cx: number, cy: number, d: number, gold: string, dark: string, label: string, sub = ""): DesignNode[] {
  const r1 = { color: dark, width: d * 0.012 };
  return [
    polygon(cx - d * 0.22, cy + d * 0.52, d * 0.34, 3, dark, { rotation: 0, name: "Ribbon tail" }),
    rect(cx - d * 0.3, cy + d * 0.2, d * 0.2, d * 0.62, dark, { rotation: 18, name: "Ribbon" }),
    rect(cx + d * 0.12, cy + d * 0.26, d * 0.2, d * 0.62, dark, { rotation: -18, name: "Ribbon" }),
    star(cx, cy, d, 24, 0.86, gold, { name: "Seal edge" }),
    circle(cx, cy, d * 0.78, lg(135, [0, lighten(gold, 40)], [0.5, gold], [1, darken(gold, 30)]), { name: "Seal" }),
    ring(cx, cy, d * 0.68, dark, r1.width, { name: "Seal ring" }),
    fit(cx - d * 0.3, cy - d * (sub ? 0.13 : 0.08), d * 0.6, label, d * 0.16, { font: "Cinzel", weight: 700, color: dark, align: "center", name: "Seal text" }),
    ...(sub ? [fit(cx - d * 0.26, cy + d * 0.07, d * 0.52, sub, d * 0.07, { font: "Cinzel", weight: 700, color: dark, align: "center", ls: d * 0.01, name: "Seal year" })] : []),
  ];
}
export function pillLabel(x: number, y: number, text: string, size: number, bg: string, fg: string, font = "Inter", weight = 700, padX = 1.1, ls = 0): DesignNode[] {
  const w = Math.round(fitW(font, weight, text, size, ls) + size * padX * 2), h = Math.round(size * 2.3);
  return [rect(x, y, w, h, bg, { cornerRadius: h / 2, name: "Label" }), T(x, y + (h - size * 1.2) / 2, w, text, size, { font, weight, color: fg, align: "center", ls, name: "Label text" })];
}
import { textW } from "./measure";
export const fitW = (font: string, weight: number, text: string, size: number, ls = 0) => textW(font, weight, text, size, ls);

/** Placeholder frame for a portrait: select it and choose "Put a photo in this shape". */
export function portraitFrame(x: number, y: number, w: number, h: number, shape: "circle" | "rect" | "arch", c1: string, c2: string, radius = 0): DesignNode[] {
  const fill = lg(160, [0, c1], [1, c2]);
  const frame = shape === "circle" ? ellipse(x, y, w, h, fill, { name: "Photo frame (put a photo in this shape)" })
    : rect(x, y, w, h, fill, { cornerRadius: shape === "arch" ? w / 2 : radius, name: "Photo frame (put a photo in this shape)" });
  // simple head-and-shoulders silhouette, a guide for where the photo goes
  const sw = w * 0.56, sx = x + (w - sw) / 2;
  const sil = path("M50 8a22 22 0 1 1 0 44a22 22 0 1 1 0-44Z M8 112c0-26 18-46 42-46s42 20 42 46Z", sx, y + h - sw * 1.12 - (shape === "circle" ? h * 0.06 : 0), sw, sw * 1.12, 100, 112, "#ffffff", null, "Silhouette (delete after adding the photo)");
  sil.opacity = 0.35;
  return [frame, sil];
}

// ---------- colour helpers ----------
function adjust(c: string, amt: number) {
  const n = parseInt(c.slice(1, 7), 16); const f = (v: number) => Math.max(0, Math.min(255, Math.round(v + amt)));
  return "#" + [f(n >> 16), f((n >> 8) & 255), f(n & 255)].map((v) => v.toString(16).padStart(2, "0")).join("");
}
export const lighten = (c: string, a: number) => adjust(c, a);
export const darken = (c: string, a: number) => adjust(c, -a);
export const alpha = (c: string, a: number) => c.slice(0, 7) + Math.round(a * 255).toString(16).padStart(2, "0");

// ---------- documents ----------
const GOOGLE_WEIGHTS: Record<string, number[]> = {
  Cinzel: [400, 700], "Great Vibes": [400], Anton: [400], "Archivo Black": [400], "Cormorant Garamond": [400, 600], "DM Serif Display": [400],
  "DM Sans": [400, 500, 700], "Space Grotesk": [400, 500, 700], Fraunces: [400, 700], Outfit: [400, 600], Syne: [700, 800], Manrope: [400, 700],
};
function fontsIn(ns: DesignNode[], out = new Set<string>()) {
  for (const n of ns) { if (n.type === "text") out.add(n.fontFamily); if (n.type === "group") fontsIn(n.children, out); }
  return out;
}
export function docOf(w: number, h: number, dpi: number, unit: "px" | "mm" | "in", bg: Fill, children: DesignNode[]): DesignDoc {
  const d = newDoc(w, h, dpi, unit);
  d.pages[0].background = bg;
  d.pages[0].children = children;
  const fonts = [...fontsIn(children)].filter((f) => GOOGLE_WEIGHTS[f]);
  if (fonts.length) d.fonts = fonts.map((family): FontRef => ({ source: "google", family, weights: GOOGLE_WEIGHTS[family], italics: [] }));
  return d;
}
