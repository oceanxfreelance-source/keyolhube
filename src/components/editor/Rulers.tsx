"use client";
import { useEffect, useRef } from "react";
import { toUnit } from "@/lib/presets";
import { useEd, useUi } from "./context";

const NICE = [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000, 5000, 10000];

/** Top and left rulers in the document's unit (px, mm or in), following zoom and pan. */
export function Rulers({ width, height, size }: { width: number; height: number; size: number }) {
  const top = useRef<HTMLCanvasElement>(null), left = useRef<HTMLCanvasElement>(null);
  const { zoom, panX, panY } = useUi((s) => ({ zoom: s.zoom, panX: s.panX, panY: s.panY }));
  const unit = useEd((s) => s.doc.unit), dpi = useEd((s) => s.doc.dpi);

  useEffect(() => {
    const css = getComputedStyle(document.documentElement);
    const bg = css.getPropertyValue("--surface").trim() || "#fff", fg = css.getPropertyValue("--muted").trim() || "#666";
    const pxPerUnit = toUnit(1, unit, dpi) === 0 ? 1 : 1 / toUnit(1, unit, dpi); // document px per unit
    const step = NICE.find((n) => n * pxPerUnit * zoom >= 60) ?? 10000; // label every >= 60 screen px
    const draw = (c: HTMLCanvasElement | null, len: number, horizontal: boolean, pan: number) => {
      if (!c) return;
      const r = window.devicePixelRatio || 1;
      c.width = (horizontal ? len : size) * r; c.height = (horizontal ? size : len) * r;
      const ctx = c.getContext("2d")!;
      ctx.scale(r, r);
      ctx.fillStyle = bg; ctx.fillRect(0, 0, horizontal ? len : size, horizontal ? size : len);
      ctx.strokeStyle = fg; ctx.fillStyle = fg; ctx.font = "10px Inter, sans-serif"; ctx.lineWidth = 1;
      const startUnit = Math.floor(-pan / (pxPerUnit * zoom) / step) * step;
      for (let u = startUnit; ; u += step / 5) {
        const scr = size + pan + u * pxPerUnit * zoom;
        if (scr > len) break;
        if (scr < size) continue;
        const major = Math.abs(u / step - Math.round(u / step)) < 1e-6;
        const t = major ? 10 : 4;
        ctx.beginPath();
        if (horizontal) { ctx.moveTo(scr + 0.5, size); ctx.lineTo(scr + 0.5, size - t); }
        else { ctx.moveTo(size, scr + 0.5); ctx.lineTo(size - t, scr + 0.5); }
        ctx.stroke();
        if (major) {
          const label = String(Math.round(u * 100) / 100);
          if (horizontal) ctx.fillText(label, scr + 3, 10);
          else { ctx.save(); ctx.translate(10, scr + 3); ctx.rotate(-Math.PI / 2); ctx.fillText(label, -ctx.measureText(label).width - 2, 0); ctx.restore(); }
        }
      }
    };
    draw(top.current, width, true, panX);
    draw(left.current, height, false, panY);
  }, [zoom, panX, panY, width, height, size, unit, dpi]);

  return (
    <>
      <canvas ref={top} className="absolute top-0 left-0 border-b border-line" style={{ width, height: size }} aria-hidden />
      <canvas ref={left} className="absolute top-0 left-0 border-r border-line" style={{ width: size, height }} aria-hidden />
      <div className="absolute top-0 left-0 bg-surface border-r border-b border-line z-10 grid place-items-center text-[9px] text-muted" style={{ width: size, height: size }}>{unit}</div>
    </>
  );
}
