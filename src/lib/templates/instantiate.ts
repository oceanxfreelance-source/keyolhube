"use client";
import Konva from "konva";
import { newId } from "../doc/factory";
import { bakeScale, cloneWithNewIds } from "../doc/ops";
import type { DesignDoc, DesignNode, Page } from "../doc/types";
import { measureTextHeight } from "../editor/render";

function fitAll(ns: DesignNode[]) {
  for (const n of ns) {
    if (n.type === "text") n.height = measureTextHeight(Konva, n);
    if (n.type === "group") fitAll(n.children);
  }
}

/** A fresh copy of a template document: new ids everywhere and text heights measured. */
export function instantiate(doc: DesignDoc): DesignDoc {
  const d: DesignDoc = JSON.parse(JSON.stringify(doc));
  d.pages = d.pages.map((p) => ({ ...p, id: newId(), children: p.children.map((c) => cloneWithNewIds(c)) }));
  d.pages.forEach((p) => fitAll(p.children));
  return d;
}

/** Template pages fitted into a design of another size (scaled to fit, centred). */
export function pagesForSize(doc: DesignDoc, width: number, height: number): Page[] {
  const d = instantiate(doc);
  const k = Math.min(width / d.width, height / d.height);
  const ox = (width - d.width * k) / 2, oy = (height - d.height * k) / 2;
  const tol = 0.01;
  return d.pages.map((p) => ({
    ...p,
    children: p.children.map((c) => {
      // Background bands that span the template edge to edge keep spanning the new page.
      const stretchable = c.type === "rect" && c.rotation === 0;
      const fullW = stretchable && c.x <= d.width * tol && c.x + c.width >= d.width * (1 - tol);
      const fullH = stretchable && c.y <= d.height * tol && c.y + c.height >= d.height * (1 - tol);
      if (Math.abs(k - 1) > 1e-6) bakeScale(c, k, k);
      c.x = c.x * k + ox; c.y = c.y * k + oy;
      if (fullW) { c.x = 0; c.width = width; }
      if (fullH) { c.y = 0; c.height = height; }
      // bands anchored to the bottom/top edge stay anchored
      if (fullW && !fullH) {
        const top = (c.y - oy) / k, bottom = top + c.height / k;
        if (bottom >= d.height * (1 - tol)) c.y = height - c.height;
        else if (top <= d.height * tol) c.y = 0;
      }
      return c;
    }),
  }));
}
