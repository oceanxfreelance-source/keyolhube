"use client";
import { useEffect, useState } from "react";
import { renderPageCanvas } from "@/lib/export/raster";
import { BUILTIN_TEMPLATES } from "@/lib/templates/builtin";
import { instantiate } from "@/lib/templates/instantiate";

const cache = new Map<string, string>();

/** Thumbnails rendered from the template documents themselves (same renderer as exports). */
export function useTemplateThumbs(size = 240) {
  const [thumbs, setThumbs] = useState<Record<string, string>>(() => Object.fromEntries(cache));
  useEffect(() => {
    let alive = true;
    (async () => {
      for (const t of BUILTIN_TEMPLATES) {
        if (cache.has(t.id)) continue;
        try {
          const d = instantiate(t.build());
          const { canvas } = await renderPageCanvas(d, d.pages[0], { pixelRatio: size / Math.max(d.width, d.height), transparent: false });
          cache.set(t.id, canvas.toDataURL("image/jpeg", 0.85));
          if (alive) setThumbs(Object.fromEntries(cache));
        } catch { /* a thumbnail failing must not block the gallery */ }
      }
    })();
    return () => { alive = false; };
  }, [size]);
  return thumbs;
}
