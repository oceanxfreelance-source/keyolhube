"use client";
import Konva from "konva";
import { resolvedDirection } from "../doc/factory";
import type { DesignDoc, DesignNode, Fill, Page, Shadow, Stroke } from "../doc/types";
import { fontStack, nearestWeight } from "../fonts";
import { fillProps, loadImage, polyPoints, textProps } from "../editor/render";
import { applyAdjustments, isNeutral } from "../photo/adjust";
import { maskData } from "../editor/mask";
import { ensureFonts, googleCssUrl, loadDocFonts } from "../fonts";
import { fontsUsed } from "./raster";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const f = (v: number) => String(Math.round(v * 1000) / 1000);

/**
 * Vector SVG of one page. Shapes, gradients and text stay vector. Images are embedded.
 * Fonts are referenced by name (not embedded), so open it where the fonts are installed.
 */
export async function exportSvg(doc: DesignDoc, page: Page): Promise<Blob> {
  await loadDocFonts(doc);
  await ensureFonts(fontsUsed([page]));
  const defs: string[] = [];
  let uid = 0;
  const id = (p: string) => `${p}${++uid}`;

  const paint = (fill: Fill, w: number, h: number): string => {
    if (fill.type === "none") return "none";
    if (fill.type === "solid") return fill.color;
    const p = fillProps(fill, w, h) as Record<string, { x: number; y: number }>;
    const gid = id("g");
    const stops = fill.stops.map((s) => `<stop offset="${f(s.offset)}" stop-color="${esc(s.color)}"/>`).join("");
    if (fill.type === "linear") {
      const a = p.fillLinearGradientStartPoint, b = p.fillLinearGradientEndPoint;
      defs.push(`<linearGradient id="${gid}" gradientUnits="userSpaceOnUse" x1="${f(a.x)}" y1="${f(a.y)}" x2="${f(b.x)}" y2="${f(b.y)}">${stops}</linearGradient>`);
    } else {
      defs.push(`<radialGradient id="${gid}" gradientUnits="userSpaceOnUse" cx="${f(w / 2)}" cy="${f(h / 2)}" r="${f(Math.max(w, h) / 2)}">${stops}</radialGradient>`);
    }
    return `url(#${gid})`;
  };
  const strokeAttr = (s: Stroke) => (s && s.width > 0 ? ` stroke="${esc(s.color)}" stroke-width="${f(s.width)}"${s.dash?.length ? ` stroke-dasharray="${s.dash.map(f).join(" ")}"` : ""}${s.cap ? ` stroke-linecap="${s.cap}"` : ""}${s.join ? ` stroke-linejoin="${s.join}"` : ""}` : "");
  const shadowAttr = (s: Shadow) => {
    if (!s) return "";
    const fid = id("s");
    defs.push(`<filter id="${fid}" x="-50%" y="-50%" width="200%" height="200%"><feDropShadow dx="${f(s.offsetX)}" dy="${f(s.offsetY)}" stdDeviation="${f(s.blur / 2)}" flood-color="${esc(s.color)}" flood-opacity="${f(s.opacity)}"/></filter>`);
    return ` filter="url(#${fid})"`;
  };
  const dataUrl = async (src: string) => {
    const b = await (await fetch(src)).blob();
    return new Promise<string>((res) => { const r = new FileReader(); r.onload = () => res(r.result as string); r.readAsDataURL(b); });
  };

  const node = async (n: DesignNode): Promise<string> => {
    if (!n.visible) return "";
    const tr = `translate(${f(n.x)} ${f(n.y)})${n.rotation ? ` rotate(${f(n.rotation)})` : ""}`;
    const blend = n.blendMode !== "source-over" ? ` style="mix-blend-mode:${n.blendMode}"` : "";
    const op = n.opacity < 1 ? ` opacity="${f(n.opacity)}"` : "";
    if (n.type === "group") {
      if (n.mask && n.children.length) {
        const shape = n.children[0], d = maskData(shape);
        const cid = id("mask");
        defs.push(`<clipPath id="${cid}"><path transform="translate(${f(shape.x)} ${f(shape.y)})${shape.rotation ? ` rotate(${f(shape.rotation)})` : ""}" d="${esc(d ?? "")}"/></clipPath>`);
        return `<g transform="${tr}"${op}><g clip-path="url(#${cid})">${(await Promise.all(n.children.slice(1).map(node))).join("")}</g></g>`;
      }
      return `<g transform="${tr}"${op}>${(await Promise.all(n.children.map(node))).join("")}</g>`;
    }
    const sh = shadowAttr(n.shadow);
    let body = "";
    switch (n.type) {
      case "rect":
        body = `<rect width="${f(n.width)}" height="${f(n.height)}"${n.cornerRadius ? ` rx="${f(n.cornerRadius)}"` : ""} fill="${paint(n.fill, n.width, n.height)}"${strokeAttr(n.stroke)}/>`;
        break;
      case "ellipse":
        body = `<ellipse cx="${f(n.width / 2)}" cy="${f(n.height / 2)}" rx="${f(n.width / 2)}" ry="${f(n.height / 2)}" fill="${paint(n.fill, n.width, n.height)}"${strokeAttr(n.stroke)}/>`;
        break;
      case "polygon":
      case "star": {
        const pts = polyPoints(n.type, n.type === "star" ? n.points : n.sides, n.width, n.height, n.type === "star" ? n.innerRatio : 0.5);
        body = `<polygon points="${pts.map(f).join(" ")}" fill="${paint(n.fill, n.width, n.height)}"${strokeAttr(n.stroke)}/>`;
        break;
      }
      case "line": {
        let marker = "";
        if (n.arrowEnd) {
          const mid = id("m");
          defs.push(`<marker id="${mid}" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="3" markerHeight="3" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="${esc(n.stroke.color)}"/></marker>`);
          marker = ` marker-end="url(#${mid})"`;
        }
        body = `<polyline points="${n.points.map(f).join(" ")}" fill="none"${strokeAttr({ cap: "round", join: "round", ...n.stroke })}${marker}/>`;
        break;
      }
      case "path":
        body = `<path d="${esc(n.data)}" transform="scale(${f(n.width / n.sourceWidth)} ${f(n.height / n.sourceHeight)})" fill="${paint(n.fill, n.sourceWidth, n.sourceHeight)}"${strokeAttr(n.stroke)} vector-effect="non-scaling-stroke"/>`;
        break;
      case "text": {
        // Use Konva's own line breaking so the SVG wraps exactly like the canvas.
        const k = new Konva.Text({ ...textProps(n) });
        const lh = n.fontSize * n.lineHeight;
        const dir = resolvedDirection(n);
        const fillPaint = paint(n.fill, n.width, n.height);
        const lines = (k.textArr as { text: string; width: number }[]).map((l, i) => {
          const y = i * lh + lh / 2;
          const align = n.align === "justify" ? (dir === "rtl" ? "right" : "left") : n.align;
          const x = align === "left" ? 0 : align === "center" ? n.width / 2 : n.width;
          const anchor = align === "center" ? "middle" : (align === "left") === (dir === "ltr") ? "start" : "end";
          return `<text x="${f(x)}" y="${f(y)}" text-anchor="${anchor}" dominant-baseline="central" direction="${dir}" xml:space="preserve">${esc(l.text)}</text>`;
        });
        k.destroy();
        const style = `font-family:${esc(fontStack(n.fontFamily))};font-size:${f(n.fontSize)}px;font-weight:${nearestWeight(n.fontFamily, n.fontWeight)};${n.italic ? "font-style:italic;" : ""}${n.letterSpacing ? `letter-spacing:${f(n.letterSpacing)}px;` : ""}${n.underline ? "text-decoration:underline;" : ""}`;
        body = `<g style="${style}" fill="${fillPaint}"${strokeAttr(n.stroke)}${n.stroke ? ' paint-order="stroke"' : ""}>${lines.join("")}</g>`;
        break;
      }
      case "image": {
        let c = n.crop ?? { x: 0, y: 0, width: n.naturalWidth, height: n.naturalHeight };
        let href: string, natW = n.naturalWidth, natH = n.naturalHeight;
        if (!isNeutral(n.adjust)) {
          // Adjusted photos are embedded already processed (same pixels as the PNG/PDF export).
          const img = await loadImage(n.src);
          const s = Math.min(1, 4096 / Math.max(c.width, c.height));
          const cv = document.createElement("canvas");
          cv.width = Math.max(1, Math.round(c.width * s)); cv.height = Math.max(1, Math.round(c.height * s));
          const ctx = cv.getContext("2d")!;
          ctx.drawImage(img, c.x, c.y, c.width, c.height, 0, 0, cv.width, cv.height);
          const data = ctx.getImageData(0, 0, cv.width, cv.height);
          applyAdjustments(data, n.adjust!, (cv.width / n.width) * (Math.max(n.width, n.height) / 1000));
          ctx.putImageData(data, 0, 0);
          href = cv.toDataURL("image/png");
          c = { x: 0, y: 0, width: cv.width, height: cv.height }; natW = cv.width; natH = cv.height;
        } else href = await dataUrl(n.src);
        let clip = "";
        if (n.cornerRadius) {
          const cid = id("c");
          defs.push(`<clipPath id="${cid}"><rect width="${f(n.width)}" height="${f(n.height)}" rx="${f(n.cornerRadius)}"/></clipPath>`);
          clip = ` clip-path="url(#${cid})"`;
        }
        body = `<g${clip}><svg width="${f(n.width)}" height="${f(n.height)}" viewBox="${f(c.x)} ${f(c.y)} ${f(c.width)} ${f(c.height)}" preserveAspectRatio="none"><image href="${href}" width="${natW}" height="${natH}"/></svg></g>`
          + (n.stroke ? `<rect width="${f(n.width)}" height="${f(n.height)}"${n.cornerRadius ? ` rx="${f(n.cornerRadius)}"` : ""} fill="none"${strokeAttr(n.stroke)}/>` : "");
        break;
      }
    }
    return `<g transform="${tr}"${op}${blend}${sh}>${body}</g>`;
  };

  const content = (await Promise.all(page.children.map(node))).join("");
  // Google Fonts are linked so browsers show them; uploaded fonts must be installed to display.
  const googleImports = (doc.fonts ?? []).filter((x) => x.source === "google")
    .map((x) => `<style>@import url("${esc(googleCssUrl(x as { family: string; weights: number[]; italics: number[] }))}");</style>`).join("");
  const bg = page.background.type === "none" ? "" : `<rect width="${doc.width}" height="${doc.height}" fill="${paint(page.background, doc.width, doc.height)}"/>`;
  const wPhys = doc.unit === "px" ? `${doc.width}` : `${f((doc.width / doc.dpi) * 25.4)}mm`;
  const hPhys = doc.unit === "px" ? `${doc.height}` : `${f((doc.height / doc.dpi) * 25.4)}mm`;
  const svg = `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="${wPhys}" height="${hPhys}" viewBox="0 0 ${doc.width} ${doc.height}"><defs>${googleImports}${defs.join("")}</defs><clipPath id="page"><rect width="${doc.width}" height="${doc.height}"/></clipPath><g clip-path="url(#page)">${bg}${content}</g></svg>`;
  return new Blob([svg], { type: "image/svg+xml" });
}
