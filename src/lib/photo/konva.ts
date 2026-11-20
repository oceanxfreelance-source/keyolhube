"use client";
import type Konva from "konva";
import { applyAdjustments, isNeutral, type Adjustments } from "./adjust";

/** Konva filter that applies the node's `adjust` attribute (see applyAdjustments). */
export function adjustFilter(this: Konva.Node, imageData: ImageData) {
  const a = this.getAttr("adjust") as Adjustments | undefined;
  if (a) applyAdjustments(imageData, a, this.getAttr("adjustScale") ?? 1);
}

/**
 * Apply (or remove) adjustments on a Konva image. The image is cached at `pixelRatio` and the
 * filter runs on that cache; radius effects are scaled to the element's size so they look the
 * same at every zoom level and export resolution.
 */
export function applyToNode(k: Konva.Image, adjust: Adjustments | undefined, pixelRatio: number) {
  if (!adjust || isNeutral(adjust)) {
    if (k.isCached()) k.clearCache();
    k.filters([]);
    return;
  }
  const w = k.width(), h = k.height();
  // Keep the cached bitmap under ~6 MP for interactive speed (exports pass a larger budget).
  const pr = Math.max(0.05, Math.min(pixelRatio, Math.sqrt(6_000_000 / Math.max(1, w * h))));
  k.setAttr("adjust", adjust); k.setAttr("adjustScale", (pr * Math.max(w, h)) / 1000);
  k.filters([adjustFilter]);
  k.cache({ pixelRatio: pr });
}

export function applyToNodeForExport(k: Konva.Image, adjust: Adjustments | undefined, pixelRatio: number) {
  if (!adjust || isNeutral(adjust)) return;
  const w = k.width(), h = k.height();
  const pr = Math.max(0.05, Math.min(pixelRatio, Math.sqrt(60_000_000 / Math.max(1, w * h))));
  k.setAttr("adjust", adjust); k.setAttr("adjustScale", (pr * Math.max(w, h)) / 1000);
  k.filters([adjustFilter]);
  k.cache({ pixelRatio: pr });
}
