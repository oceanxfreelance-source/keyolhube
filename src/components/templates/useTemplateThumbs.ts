"use client";
import { useEffect, useRef, useState } from "react";
import { renderPageCanvas } from "@/lib/export/raster";
import type { Template } from "@/lib/templates/builtin";
import { instantiate } from "@/lib/templates/instantiate";

// Thumbnails are rendered from the template documents themselves (same renderer as exports),
// lazily: only when a card scrolls into view, one at a time, and cached for the session.
const cache = new Map<string, string>();
const waiting = new Map<string, { t: Template; size: number; done: Set<(url: string) => void> }>();
let running = false;

async function pump() {
  if (running) return;
  running = true;
  while (waiting.size) {
    const [key, job] = waiting.entries().next().value!;
    waiting.delete(key);
    try {
      const d = instantiate(job.t.build());
      const { canvas } = await renderPageCanvas(d, d.pages[0], { pixelRatio: job.size / Math.max(d.width, d.height), transparent: false });
      const url = canvas.toDataURL("image/jpeg", 0.85);
      cache.set(key, url);
      job.done.forEach((f) => f(url));
    } catch { /* a thumbnail failing must not block the gallery */ }
  }
  running = false;
}

function request(t: Template, size: number, cb: (url: string) => void) {
  const key = `${t.id}@${size}`;
  const hit = cache.get(key);
  if (hit) return cb(hit), () => {};
  const job = waiting.get(key) ?? { t, size, done: new Set() };
  job.done.add(cb);
  waiting.set(key, job);
  void pump();
  return () => { job.done.delete(cb); if (!job.done.size) waiting.delete(key); };
}

/** Thumbnail for one template, rendered when its element becomes visible. */
export function useTemplateThumb(t: Template, size = 320) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [url, setUrl] = useState<string | undefined>(() => cache.get(`${t.id}@${size}`));
  useEffect(() => {
    if (url) return;
    const el = ref.current;
    if (!el) return;
    let cancel = () => {};
    const io = new IntersectionObserver((es) => {
      if (es.some((e) => e.isIntersecting)) { cancel(); cancel = request(t, size, setUrl); }
      else { cancel(); cancel = () => {}; }
    }, { rootMargin: "300px" });
    io.observe(el);
    return () => { io.disconnect(); cancel(); };
  }, [t, size, url]);
  return { ref, url };
}
