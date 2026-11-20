// Turns document nodes into Konva shape configs. Used by the live canvas AND the exporters,
// so what you export is exactly what you see.
import type Konva from "konva";
import { resolvedDirection } from "../doc/factory";
import type { DesignNode, Fill, ShapeNode, Shadow, Stroke } from "../doc/types";
import { fontStack, nearestWeight } from "../fonts";

export type PrimitiveKind = "Rect" | "Ellipse" | "Line" | "Arrow" | "Path" | "Text" | "Image";
export type Primitive = { kind: PrimitiveKind; props: Record<string, unknown> };

export function fillProps(fill: Fill, w: number, h: number): Record<string, unknown> {
  switch (fill.type) {
    case "none":
      return { fillEnabled: false };
    case "solid":
      return { fill: fill.color, fillEnabled: true };
    case "linear": {
      const a = (fill.angle * Math.PI) / 180, dx = Math.cos(a), dy = Math.sin(a);
      const half = (Math.abs(w * dx) + Math.abs(h * dy)) / 2;
      const cx = w / 2, cy = h / 2;
      return {
        fillEnabled: true, fillPriority: "linear-gradient",
        fillLinearGradientStartPoint: { x: cx - dx * half, y: cy - dy * half },
        fillLinearGradientEndPoint: { x: cx + dx * half, y: cy + dy * half },
        fillLinearGradientColorStops: fill.stops.flatMap((s) => [s.offset, s.color]),
      };
    }
    case "radial":
      return {
        fillEnabled: true, fillPriority: "radial-gradient",
        fillRadialGradientStartPoint: { x: w / 2, y: h / 2 }, fillRadialGradientEndPoint: { x: w / 2, y: h / 2 },
        fillRadialGradientStartRadius: 0, fillRadialGradientEndRadius: Math.max(w, h) / 2,
        fillRadialGradientColorStops: fill.stops.flatMap((s) => [s.offset, s.color]),
      };
  }
}

export function strokeProps(stroke: Stroke): Record<string, unknown> {
  if (!stroke || stroke.width <= 0) return { strokeEnabled: false };
  return { stroke: stroke.color, strokeWidth: stroke.width, dash: stroke.dash, strokeEnabled: true };
}

export function shadowProps(shadow: Shadow): Record<string, unknown> {
  if (!shadow) return { shadowEnabled: false };
  return {
    shadowEnabled: true, shadowColor: shadow.color, shadowBlur: shadow.blur,
    shadowOffset: { x: shadow.offsetX, y: shadow.offsetY }, shadowOpacity: shadow.opacity,
  };
}

/** Regular polygon or star points fitted exactly into a w x h box. */
export function polyPoints(kind: "polygon" | "star", count: number, w: number, h: number, innerRatio = 0.5): number[] {
  const pts: [number, number][] = [];
  const n = kind === "star" ? count * 2 : count;
  for (let i = 0; i < n; i++) {
    const r = kind === "star" && i % 2 === 1 ? innerRatio : 1;
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / n;
    pts.push([Math.cos(a) * r, Math.sin(a) * r]);
  }
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
  const minX = Math.min(...xs), minY = Math.min(...ys), sw = Math.max(...xs) - minX, sh = Math.max(...ys) - minY;
  return pts.flatMap(([x, y]) => [((x - minX) / sw) * w, ((y - minY) / sh) * h]);
}

export function textProps(n: Extract<ShapeNode, { type: "text" }>): Record<string, unknown> {
  const weight = nearestWeight(n.fontFamily, n.fontWeight);
  return {
    text: n.text, width: n.width, fontFamily: fontStack(n.fontFamily), fontSize: n.fontSize,
    fontStyle: `${n.italic ? "italic " : ""}${weight}`, align: n.align, direction: resolvedDirection(n),
    lineHeight: n.lineHeight, letterSpacing: n.letterSpacing, textDecoration: n.underline ? "underline" : "",
    wrap: "word",
  };
}

/** The drawable for a (non-group) node, in the node's local coordinates (origin at its x, y). */
export function primitive(n: ShapeNode, image?: CanvasImageSource | null): Primitive {
  const common = { ...shadowProps(n.shadow), globalCompositeOperation: n.blendMode, perfectDrawEnabled: false };
  switch (n.type) {
    case "rect":
      return { kind: "Rect", props: { ...common, width: n.width, height: n.height, cornerRadius: n.cornerRadius, ...fillProps(n.fill, n.width, n.height), ...strokeProps(n.stroke) } };
    case "ellipse":
      return { kind: "Ellipse", props: { ...common, x: n.width / 2, y: n.height / 2, radiusX: n.width / 2, radiusY: n.height / 2, ...ellipseFill(n.fill, n.width, n.height), ...strokeProps(n.stroke) } };
    case "polygon":
    case "star":
      return {
        kind: "Line",
        props: { ...common, closed: true, points: polyPoints(n.type, n.type === "star" ? n.points : n.sides, n.width, n.height, n.type === "star" ? n.innerRatio : 0.5), ...fillProps(n.fill, n.width, n.height), ...strokeProps(n.stroke) },
      };
    case "line":
      return {
        kind: n.arrowEnd ? "Arrow" : "Line",
        props: { ...common, points: n.points, ...strokeProps(n.stroke), lineCap: "round", lineJoin: "round", hitStrokeWidth: Math.max(12, n.stroke.width), fill: n.stroke.color, pointerLength: n.stroke.width * 3, pointerWidth: n.stroke.width * 3 },
      };
    case "path":
      return {
        kind: "Path",
        props: { ...common, data: n.data, scaleX: n.width / n.sourceWidth, scaleY: n.height / n.sourceHeight, strokeScaleEnabled: false, ...fillProps(n.fill, n.sourceWidth, n.sourceHeight), ...strokeProps(n.stroke) },
      };
    case "text":
      return { kind: "Text", props: { ...common, ...textProps(n), ...fillProps(n.fill, n.width, n.height), ...strokeProps(n.stroke), fillAfterStrokeEnabled: true } };
    case "image": {
      const crop = n.crop ?? { x: 0, y: 0, width: n.naturalWidth, height: n.naturalHeight };
      return { kind: "Image", props: { ...common, image: image ?? undefined, width: n.width, height: n.height, crop, cornerRadius: n.cornerRadius, ...strokeProps(n.stroke) } };
    }
  }
}

// Konva ellipses are drawn around their centre, so gradients need centre-relative points.
function ellipseFill(fill: Fill, w: number, h: number) {
  const p = fillProps(fill, w, h);
  const shift = (pt: unknown) => (pt && typeof pt === "object" ? { x: (pt as { x: number }).x - w / 2, y: (pt as { y: number }).y - h / 2 } : pt);
  for (const k of ["fillLinearGradientStartPoint", "fillLinearGradientEndPoint", "fillRadialGradientStartPoint", "fillRadialGradientEndPoint"]) {
    if (k in p) p[k] = shift(p[k]);
  }
  return p;
}

// ---------- image loading (shared cache) ----------
const images = new Map<string, Promise<HTMLImageElement>>();
export function loadImage(src: string): Promise<HTMLImageElement> {
  let p = images.get(src);
  if (!p) {
    p = new Promise((resolve, reject) => {
      const img = new window.Image();
      img.crossOrigin = "anonymous";
      img.onload = () => resolve(img);
      img.onerror = () => { images.delete(src); reject(new Error(`Could not load image ${src}`)); };
      img.src = src;
    });
    images.set(src, p);
  }
  return p;
}

// ---------- text measurement ----------
let measurer: Konva.Text | null = null;
/** Height a text box needs for its content (used to keep text bounds correct). */
export function measureTextHeight(KonvaNs: typeof Konva, n: Extract<ShapeNode, { type: "text" }>): number {
  measurer ??= new KonvaNs.Text({});
  measurer.setAttrs({ ...textProps(n), height: undefined });
  return Math.ceil(measurer.height());
}

export function isShape(n: DesignNode): n is ShapeNode {
  return n.type !== "group";
}
