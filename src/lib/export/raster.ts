"use client";
import Konva from "konva";
import type { DesignDoc, DesignNode, Page } from "../doc/types";
import { ensureFonts, loadDocFonts, nearestWeight } from "../fonts";
import { fillProps, loadImage, primitive } from "../editor/render";
import { applyToNodeForExport } from "../photo/konva";
import { maskClipFunc } from "../editor/mask";

/** Largest canvas we create (pixels). iOS Safari's limit is about 16.7 million. */
export function maxCanvasPixels(): number {
  const ios = typeof navigator !== "undefined" && /iP(hone|ad|od)/.test(navigator.userAgent);
  return ios ? 16_000_000 : 120_000_000;
}

export function fontsUsed(pages: Page[]) {
  const out: { family: string; weight: number; italic: boolean }[] = [];
  const walk = (ns: DesignNode[]) => ns.forEach((n) => {
    if (n.type === "text") out.push({ family: n.fontFamily, weight: nearestWeight(n.fontFamily, n.fontWeight), italic: n.italic });
    if (n.type === "group") walk(n.children);
  });
  pages.forEach((p) => walk(p.children));
  return out;
}

async function build(n: DesignNode, pixelRatio: number): Promise<Konva.Group | null> {
  if (!n.visible) return null;
  const g = new Konva.Group({ x: n.x, y: n.y, rotation: n.rotation, opacity: n.type === "group" ? n.opacity : 1 });
  if (n.type === "group") {
    const clip = maskClipFunc(n);
    if (clip) g.clipFunc(clip as never);
    for (const c of n.mask ? n.children.slice(1) : n.children) { const k = await build(c, pixelRatio); if (k) g.add(k); }
    return g;
  }
  const img = n.type === "image" ? await loadImage(n.src) : null;
  const p = primitive(n, img);
  const Ctor = (Konva as unknown as Record<string, new (cfg: object) => Konva.Shape>)[p.kind];
  const shape = new Ctor({ ...p.props, opacity: n.opacity });
  g.add(shape);
  if (n.type === "image") applyToNodeForExport(shape as Konva.Image, n.adjust, pixelRatio);
  return g;
}

/** Render one page to a canvas at `pixelRatio`, clamped to the browser's canvas limit. */
export async function renderPageCanvas(doc: DesignDoc, page: Page, opts: { pixelRatio: number; transparent: boolean }) {
  await loadDocFonts(doc);
  await ensureFonts(fontsUsed([page]));
  const maxPr = Math.sqrt(maxCanvasPixels() / (doc.width * doc.height));
  const pixelRatio = Math.max(0.05, Math.min(opts.pixelRatio, maxPr));
  const container = document.createElement("div");
  const stage = new Konva.Stage({ container, width: doc.width, height: doc.height });
  const layer = new Konva.Layer({ clipX: 0, clipY: 0, clipWidth: doc.width, clipHeight: doc.height });
  stage.add(layer);
  if (!(opts.transparent && page.background.type === "none")) {
    layer.add(new Konva.Rect({ x: 0, y: 0, width: doc.width, height: doc.height,
      ...(page.background.type === "none" ? { fill: "#ffffff" } : fillProps(page.background, doc.width, doc.height)) }));
  }
  for (const n of page.children) { const k = await build(n, pixelRatio); if (k) layer.add(k); }
  layer.draw();
  const canvas = stage.toCanvas({ pixelRatio });
  stage.destroy();
  return { canvas, pixelRatio, clamped: pixelRatio < opts.pixelRatio - 1e-6 };
}

export function canvasToBlob(c: HTMLCanvasElement, mime: "image/png" | "image/jpeg", quality = 0.92): Promise<Blob> {
  return new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error("Export failed: the image is too large for this browser"))), mime, quality));
}

export function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export const safeName = (s: string) => s.replace(/[\\/:*?"<>|]+/g, "-").trim().slice(0, 80) || "design";
