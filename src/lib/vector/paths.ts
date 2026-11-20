// Vector geometry built on paper.js: shapes to paths, boolean operations, SVG import and
// anchor/handle editing. Everything returns plain document nodes.
import paper from "paper/dist/paper-core";
import { newId, solid } from "../doc/factory";
import { localMatrix, mul, type Mat } from "../doc/geometry";
import type { DesignNode, Fill, GroupNode, PathNode, Stroke } from "../doc/types";
import { polyPoints } from "../editor/render";

let scope: paper.PaperScope | null = null;
function ps(): paper.PaperScope {
  if (!scope) {
    scope = new paper.PaperScope();
    scope.setup(new scope.Size(1, 1));
    scope.settings.insertItems = false;
  }
  scope.activate();
  return scope;
}

export const VECTOR_TYPES = new Set(["rect", "ellipse", "polygon", "star", "line", "path"]);
export const isVector = (n: DesignNode) => VECTOR_TYPES.has(n.type);

const toPaperMatrix = (m: Mat) => new (ps().Matrix)(m[0], m[1], m[2], m[3], m[4], m[5]);

/** The node's outline as a paper item in its own local coordinates (no x/y/rotation). */
function localItem(n: DesignNode): paper.PathItem | null {
  const P = ps();
  switch (n.type) {
    case "rect":
      return new P.Path.Rectangle({ rectangle: new P.Rectangle(0, 0, n.width, n.height), radius: Math.min(n.cornerRadius, n.width / 2, n.height / 2) });
    case "ellipse":
      return new P.Path.Ellipse(new P.Rectangle(0, 0, n.width, n.height));
    case "polygon":
    case "star": {
      const pts = polyPoints(n.type, n.type === "star" ? n.points : n.sides, n.width, n.height, n.type === "star" ? n.innerRatio : 0.5);
      const p = new P.Path({ closed: true });
      for (let i = 0; i < pts.length; i += 2) p.add(new P.Point(pts[i], pts[i + 1]));
      return p;
    }
    case "line": {
      const p = new P.Path({ closed: false });
      for (let i = 0; i < n.points.length; i += 2) p.add(new P.Point(n.points[i], n.points[i + 1]));
      return p;
    }
    case "path": {
      const p = new P.CompoundPath(n.data);
      p.scale(n.width / n.sourceWidth, n.height / n.sourceHeight, new P.Point(0, 0));
      return p;
    }
    default:
      return null;
  }
}

/** The node's outline in page space (parent matrix x node transform). */
export function pageItem(n: DesignNode, parent: Mat): paper.PathItem | null {
  const it = localItem(n);
  if (!it) return null;
  it.transform(toPaperMatrix(mul(parent, localMatrix(n))));
  return it;
}

/** SVG path data for a node in its own local coordinates (used for masks/clip paths). */
export function localPathData(n: DesignNode): string | null {
  const it = localItem(n);
  return it ? it.pathData : null;
}

function nodeStyle(n: DesignNode): { fill: Fill; stroke: Stroke } {
  if (n.type === "line") return { fill: { type: "none" }, stroke: { ...n.stroke } };
  if ("fill" in n && "stroke" in n) return { fill: structuredCloneSafe(n.fill), stroke: n.stroke ? { ...n.stroke } : null };
  return { fill: solid("#111827"), stroke: null };
}
const structuredCloneSafe = <T,>(v: T): T => JSON.parse(JSON.stringify(v));

/** A path node from a page-space paper item (geometry normalised so x/y = bounds origin). */
export function nodeFromItem(item: paper.PathItem, style: { fill: Fill; stroke: Stroke }, name = "Path"): PathNode | null {
  const b = item.bounds;
  if (!b || !Number.isFinite(b.width) || (b.width < 0.01 && b.height < 0.01)) return null;
  const P = ps();
  const it = item.clone({ insert: false }) as paper.PathItem;
  it.translate(new P.Point(-b.x, -b.y));
  const w = Math.max(0.01, b.width), h = Math.max(0.01, b.height);
  return {
    id: newId(), name, type: "path", x: round(b.x), y: round(b.y), width: w, height: h, rotation: 0, opacity: 1,
    visible: true, locked: false, blendMode: "source-over", shadow: null, data: it.pathData, sourceWidth: w, sourceHeight: h,
    fill: style.fill, stroke: style.stroke,
  };
}

/** A path node from page-space path data (e.g. drawn with the pen). */
export function nodeFromItemData(data: string, fill: Fill, stroke: Stroke, name = "Path"): PathNode | null {
  return nodeFromItem(new (ps().CompoundPath)(data), { fill, stroke }, name);
}

/** Convert any vector shape into an editable path, keeping its look and position. */
export function convertToPath(n: DesignNode, parent: Mat): PathNode | null {
  const it = pageItem(n, parent);
  if (!it) return null;
  const out = nodeFromItem(it, nodeStyle(n), n.type === "path" ? n.name : `${n.name} (path)`);
  if (out) { out.opacity = n.opacity; out.blendMode = n.blendMode; out.shadow = n.shadow; }
  return out;
}

export type BoolOp = "unite" | "subtract" | "intersect" | "exclude";

/**
 * Boolean operation over shapes in paint order (bottom first, like Illustrator's Pathfinder):
 * unite/intersect/exclude combine all; subtract removes every upper shape from the bottom one.
 * The result takes the bottom shape's style.
 */
export function booleanOp(items: { node: DesignNode; parent: Mat }[], op: BoolOp): PathNode | null {
  const shapes = items.map((i) => ({ i, p: pageItem(i.node, i.parent) })).filter((x) => x.p) as { i: { node: DesignNode; parent: Mat }; p: paper.PathItem }[];
  if (shapes.length < 2) return null;
  let acc = closeOpen(shapes[0].p);
  for (const s of shapes.slice(1)) {
    const next = closeOpen(s.p);
    acc = op === "unite" ? acc.unite(next) : op === "subtract" ? acc.subtract(next) : op === "intersect" ? acc.intersect(next) : acc.exclude(next);
  }
  const base = shapes[0].i.node;
  const out = nodeFromItem(acc, nodeStyle(base), { unite: "Union", subtract: "Subtraction", intersect: "Intersection", exclude: "Exclusion" }[op]);
  if (out) out.opacity = base.opacity;
  return out;
}
function closeOpen(p: paper.PathItem): paper.PathItem {
  if (p instanceof ps().Path && !(p as paper.Path).closed) { const c = p.clone({ insert: false }) as paper.Path; c.closed = true; return c; }
  return p;
}

// ---------- SVG import ----------
function colour(c: paper.Color | null | undefined): string | null {
  if (!c || c.alpha === 0) return null;
  const hex = c.toCSS(true);
  if (c.alpha < 1) { const a = Math.round(c.alpha * 255).toString(16).padStart(2, "0"); return hex + a; }
  return hex;
}

/** Import SVG markup as editable vector layers. Text and embedded bitmaps are reported, not imported. */
export function importSvg(svg: string): { node: GroupNode | PathNode | null; skipped: { text: number; images: number }; count: number } {
  const P = ps();
  const doc = new DOMParser().parseFromString(svg, "image/svg+xml");
  if (doc.querySelector("parsererror") || doc.documentElement.nodeName.toLowerCase() !== "svg") throw new Error("This file is not a valid SVG");
  const skipped = { text: doc.querySelectorAll("text").length, images: doc.querySelectorAll("image").length };
  doc.querySelectorAll("script, foreignObject, text, image").forEach((e) => e.remove());
  const root = P.project.importSVG(doc.documentElement as unknown as SVGElement, { expandShapes: true, insert: false, applyMatrix: true }) as paper.Item;
  let count = 0;
  const walk = (it: paper.Item): DesignNode[] => {
    if (!it.visible) return [];
    if (it instanceof P.Group || it instanceof P.Layer) {
      // clip groups: keep the clipped content, drop the clipping path itself
      const kids = it.children.filter((c) => !c.clipMask).flatMap(walk);
      if (!kids.length) return [];
      if (kids.length === 1) return kids;
      const box = unionBox(kids);
      return [{ id: newId(), name: it.name || "Group", type: "group", x: box.x, y: box.y, width: box.w, height: box.h, rotation: 0, opacity: it.opacity, visible: true, locked: false, blendMode: "source-over", shadow: null,
        children: kids.map((k) => ({ ...k, x: k.x - box.x, y: k.y - box.y })) }];
    }
    if (it instanceof P.Path || it instanceof P.CompoundPath) {
      const fc = colour(it.fillColor), sc = colour(it.strokeColor);
      if (!fc && !(sc && it.strokeWidth > 0)) return [];
      const n = nodeFromItem(it as paper.PathItem, { fill: fc ? { type: "solid", color: fc } : { type: "none" }, stroke: sc && it.strokeWidth > 0 ? { color: sc, width: it.strokeWidth } : null }, it.name || "Path");
      if (!n) return [];
      n.opacity = it.opacity;
      count++;
      return [n];
    }
    return [];
  };
  const nodes = walk(root);
  return { node: (nodes.length === 1 ? nodes[0] : nodes.length ? walkGroup(nodes) : null) as GroupNode | PathNode | null, skipped, count };
}
function unionBox(ns: DesignNode[]) {
  const x = Math.min(...ns.map((n) => n.x)), y = Math.min(...ns.map((n) => n.y));
  const r = Math.max(...ns.map((n) => n.x + n.width)), b = Math.max(...ns.map((n) => n.y + n.height));
  return { x, y, w: r - x, h: b - y };
}
function walkGroup(kids: DesignNode[]): GroupNode {
  const box = unionBox(kids);
  return { id: newId(), name: "Imported SVG", type: "group", x: box.x, y: box.y, width: box.w, height: box.h, rotation: 0, opacity: 1, visible: true, locked: false, blendMode: "source-over", shadow: null, children: kids.map((k) => ({ ...k, x: k.x - box.x, y: k.y - box.y })) };
}

// ---------- anchor editing ----------
export type Vec = { x: number; y: number };
export type Anchor = { p: Vec; hin: Vec; hout: Vec }; // handles relative to p
export type SubPath = { closed: boolean; anchors: Anchor[] };

const r4 = (v: number) => Math.round(v * 1e4) / 1e4;
const segAnchor = (s: paper.Segment): Anchor => ({
  p: { x: r4(s.point.x), y: r4(s.point.y) }, hin: { x: r4(s.handleIn.x), y: r4(s.handleIn.y) }, hout: { x: r4(s.handleOut.x), y: r4(s.handleOut.y) },
});

/** Path data -> editable anchors with Bézier handles. */
export function toAnchors(data: string): SubPath[] {
  const P = ps();
  const cp = new P.CompoundPath(data);
  const paths = (cp.children.length ? cp.children : [cp]) as paper.Path[];
  return paths.map((p) => ({
    closed: p.closed,
    anchors: p.segments.map(segAnchor),
  }));
}

/** Editable anchors -> path data. */
export function fromAnchors(subs: SubPath[]): string {
  const P = ps();
  const cp = new P.CompoundPath({});
  for (const s of subs) {
    if (!s.anchors.length) continue;
    const p = new P.Path({ closed: s.closed });
    for (const a of s.anchors) p.add(new P.Segment(new P.Point(a.p.x, a.p.y), new P.Point(a.hin.x, a.hin.y), new P.Point(a.hout.x, a.hout.y)));
    cp.addChild(p);
  }
  return cp.pathData;
}

/** Insert an anchor on the segment nearest to `pt` (local coords); returns new anchors and its index. */
export function insertAnchor(subs: SubPath[], pt: Vec, tolerance: number): { subs: SubPath[]; at: [number, number] } | null {
  const P = ps();
  let best: { si: number; loc: paper.CurveLocation; d: number } | null = null;
  subs.forEach((s, si) => {
    const p = new P.Path({ closed: s.closed });
    for (const a of s.anchors) p.add(new P.Segment(new P.Point(a.p.x, a.p.y), new P.Point(a.hin.x, a.hin.y), new P.Point(a.hout.x, a.hout.y)));
    const loc = p.getNearestLocation(new P.Point(pt.x, pt.y));
    if (loc && loc.distance <= tolerance && (!best || loc.distance < best.d)) best = { si, loc, d: loc.distance };
  });
  if (!best) return null;
  const { si, loc } = best as { si: number; loc: paper.CurveLocation; d: number };
  const path = loc.path;
  const seg = path.divideAt(loc);
  if (!seg) return null;
  const out = subs.map((s) => ({ closed: s.closed, anchors: s.anchors.map((a) => ({ ...a })) }));
  out[si] = { closed: path.closed, anchors: path.segments.map(segAnchor) };
  return { subs: out, at: [si, seg.index] };
}

/** Bounds of path data (for re-normalising after edits). */
export function dataBounds(data: string): { x: number; y: number; width: number; height: number } {
  const b = new (ps().CompoundPath)(data).bounds;
  return { x: b.x, y: b.y, width: b.width, height: b.height };
}

/** Translate path data by (dx, dy). */
export function translateData(data: string, dx: number, dy: number): string {
  const P = ps();
  const cp = new P.CompoundPath(data);
  cp.translate(new P.Point(dx, dy));
  return cp.pathData;
}

const round = (v: number) => Math.round(v * 100) / 100;
