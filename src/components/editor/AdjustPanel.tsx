"use client";
import { RotateCcw, Eye } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { ImageNode } from "@/lib/doc/types";
import { applyAdjustments, curveLut, HSL_BANDS, isNeutral, PRESETS, type Adjustments, type CurvePoint, type HslBand, type Levels } from "@/lib/photo/adjust";
import { loadImage } from "@/lib/editor/render";
import { locate } from "@/lib/doc/geometry";
import type { Page } from "@/lib/doc/types";
import { useEditorCtx } from "./context";

type NumKey = "exposure" | "brightness" | "contrast" | "highlights" | "shadows" | "whites" | "blacks" | "temperature" | "tint" | "vibrance" | "saturation" | "hue" | "sharpen" | "noise" | "blur" | "vignette" | "grain";
const GROUPS: { title: string; pro?: boolean; keys: [NumKey, string, number, number, number?][] }[] = [
  { title: "Light", keys: [["exposure", "Exposure", -3, 3, 0.05], ["brightness", "Brightness", -100, 100], ["contrast", "Contrast", -100, 100], ["highlights", "Highlights", -100, 100], ["shadows", "Shadows", -100, 100], ["whites", "Whites", -100, 100], ["blacks", "Blacks", -100, 100]] },
  { title: "Colour", keys: [["temperature", "Temperature", -100, 100], ["tint", "Tint", -100, 100], ["vibrance", "Vibrance", -100, 100], ["saturation", "Saturation", -100, 100], ["hue", "Hue", -180, 180]] },
  { title: "Detail", keys: [["sharpen", "Sharpen", 0, 100], ["noise", "Noise reduction", 0, 100], ["blur", "Blur", 0, 100]] },
  { title: "Effects", keys: [["vignette", "Vignette", -100, 100], ["grain", "Grain", 0, 100]] },
];
const BEGINNER: NumKey[] = ["exposure", "contrast", "highlights", "shadows", "temperature", "saturation", "sharpen", "vignette"];
const BAND_COLOUR: Record<HslBand, string> = { red: "#ef4444", orange: "#f97316", yellow: "#eab308", green: "#22c55e", aqua: "#06b6d4", blue: "#3b82f6", purple: "#8b5cf6", magenta: "#d946ef" };

export function AdjustPanel({ node, pro }: { node: ImageNode; pro: boolean }) {
  const { store, ui } = useEditorCtx();
  const a = node.adjust ?? {};
  const set = (label: string, fn: (adj: Adjustments) => void, merge?: string) => {
    store.getState().changePage(label, (p) => {
      const n = locate(p as Page, node.id)?.node;
      if (n?.type !== "image") return;
      const next: Adjustments = JSON.parse(JSON.stringify(n.adjust ?? {}));
      fn(next);
      for (const k of Object.keys(next) as (keyof Adjustments)[]) if (next[k] === 0 || next[k] === undefined) delete next[k];
      if (isNeutral(next)) delete n.adjust; else n.adjust = next;
    }, merge ? { merge: `adjust:${merge}:${node.id}` } : undefined);
  };
  const [band, setBand] = useState<HslBand>("red");

  return (
    <div className="space-y-4">
      <Presets node={node} onPick={(adj) => set("Photo preset", (x) => { for (const k of Object.keys(x)) delete (x as Record<string, unknown>)[k]; Object.assign(x, JSON.parse(JSON.stringify(adj))); })} />
      <div className="flex gap-2">
        <button className="btn flex-1" disabled={isNeutral(a)} onClick={() => set("Reset adjustments", (x) => { for (const k of Object.keys(x)) delete (x as Record<string, unknown>)[k]; })}><RotateCcw size={15} /> Reset</button>
        <button className="btn flex-1 select-none" disabled={isNeutral(a)} aria-label="Hold to compare with the original"
          onPointerDown={() => ui.getState().set({ showOriginal: true })} onPointerUp={() => ui.getState().set({ showOriginal: false })} onPointerLeave={() => ui.getState().set({ showOriginal: false })}>
          <Eye size={15} /> Hold: original
        </button>
      </div>
      {GROUPS.map((g) => {
        const keys = g.keys.filter(([k]) => pro || BEGINNER.includes(k));
        if (!keys.length) return null;
        return (
          <div key={g.title} className="space-y-1.5">
            <div className="label">{g.title}</div>
            {keys.map(([k, label, min, max, step]) => (
              <label key={k} className="flex items-center gap-2 text-sm">
                <span className="w-24 text-muted shrink-0" onDoubleClick={() => set(`Reset ${label}`, (x) => { delete x[k]; })} title="Double-click to reset">{label}</span>
                <input type="range" className="flex-1 min-w-0" min={min} max={max} step={step ?? 1} value={a[k] ?? 0} aria-label={label}
                  onChange={(e) => { const v = Number(e.target.value); set(label, (x) => { x[k] = v; }, k); }} />
                <span className="w-10 text-right tabular-nums text-xs">{a[k] ?? 0}</span>
              </label>
            ))}
          </div>
        );
      })}
      {pro && (
        <>
          <div className="space-y-1.5">
            <div className="label">Colour mixer (HSL)</div>
            <div className="flex gap-1">
              {HSL_BANDS.map((b) => (
                <button key={b} className={`size-6 rounded-full border-2 ${band === b ? "border-ink" : "border-transparent"}`} style={{ background: BAND_COLOUR[b] }} aria-label={`${b} colours`} aria-pressed={band === b} onClick={() => setBand(b)} />
              ))}
            </div>
            {(["h", "s", "l"] as const).map((c) => (
              <label key={c} className="flex items-center gap-2 text-sm">
                <span className="w-24 text-muted shrink-0">{{ h: "Hue", s: "Saturation", l: "Luminance" }[c]}</span>
                <input type="range" className="flex-1 min-w-0" min={c === "h" ? -100 : -100} max={100} value={a.hsl?.[band]?.[c] ?? 0} aria-label={`${band} ${c}`}
                  onChange={(e) => { const v = Number(e.target.value); set("Colour mixer", (x) => { x.hsl ??= {}; x.hsl[band] = { ...(x.hsl[band] ?? {}), [c]: v }; }, `hsl-${band}-${c}`); }} />
                <span className="w-10 text-right tabular-nums text-xs">{a.hsl?.[band]?.[c] ?? 0}</span>
              </label>
            ))}
          </div>
          <CurvesEditor curves={a.curves} onChange={(ch, pts, merge) => set("Curves", (x) => { x.curves = { ...(x.curves ?? {}), [ch]: pts }; }, merge ? `curve-${ch}` : undefined)} />
          <LevelsEditor levels={a.levels} onChange={(l) => set("Levels", (x) => { x.levels = l; }, "levels")} />
        </>
      )}
      <p className="text-xs text-muted">Non-destructive: the original photo is kept, so you can change or reset adjustments at any time.</p>
    </div>
  );
}

/** Preset buttons with live thumbnails rendered from the actual photo. */
function Presets({ node, onPick }: { node: ImageNode; onPick: (a: Adjustments) => void }) {
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  useEffect(() => {
    let alive = true;
    loadImage(node.src).then((img) => {
      const c = node.crop ?? { x: 0, y: 0, width: node.naturalWidth, height: node.naturalHeight };
      const size = 72, s = size / Math.max(c.width, c.height);
      const w = Math.max(1, Math.round(c.width * s)), h = Math.max(1, Math.round(c.height * s));
      const out: Record<string, string> = {};
      for (const p of PRESETS) {
        const cv = document.createElement("canvas");
        cv.width = w; cv.height = h;
        const ctx = cv.getContext("2d")!;
        ctx.drawImage(img, c.x, c.y, c.width, c.height, 0, 0, w, h);
        const d = ctx.getImageData(0, 0, w, h);
        applyAdjustments(d, p.adjust, w / 1000);
        ctx.putImageData(d, 0, 0);
        out[p.id] = cv.toDataURL("image/jpeg", 0.8);
      }
      if (alive) setThumbs(out);
    }).catch(() => {});
    return () => { alive = false; };
  }, [node.src, node.crop, node.naturalWidth, node.naturalHeight]);
  return (
    <div className="grid grid-cols-4 gap-1.5">
      {PRESETS.map((p) => (
        <button key={p.id} onClick={() => onPick(p.adjust)} className="text-[10px] text-center space-y-0.5" aria-label={`Preset ${p.name}`}>
          <div className="aspect-square rounded-md bg-surface-2 overflow-hidden grid place-items-center hover:ring-2 ring-accent">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {thumbs[p.id] && <img src={thumbs[p.id]} alt="" className="w-full h-full object-cover" />}
          </div>
          <div className="truncate">{p.name}</div>
        </button>
      ))}
    </div>
  );
}

type Channel = "rgb" | "r" | "g" | "b";
const ID_CURVE: CurvePoint[] = [[0, 0], [255, 255]];

function CurvesEditor({ curves, onChange }: { curves: Adjustments["curves"]; onChange: (ch: Channel, pts: CurvePoint[], merge: boolean) => void }) {
  const [ch, setCh] = useState<Channel>("rgb");
  const pts = curves?.[ch] ?? ID_CURVE;
  const svg = useRef<SVGSVGElement>(null);
  const drag = useRef<number | null>(null);
  const S = 200;
  const toPt = (e: React.PointerEvent): CurvePoint => {
    const r = svg.current!.getBoundingClientRect();
    return [Math.round(Math.min(255, Math.max(0, ((e.clientX - r.left) / r.width) * 255))), Math.round(Math.min(255, Math.max(0, (1 - (e.clientY - r.top) / r.height) * 255)))];
  };
  // Draw exactly the curve the renderer applies (same monotone interpolation).
  const lut = curveLut(pts);
  const path = Array.from({ length: 65 }, (_, i) => Math.min(255, i * 4)).map((x, i) => `${i ? "L" : "M"}${(x / 255) * S},${S - (lut[x] / 255) * S}`).join(" ");
  const colour = { rgb: "currentColor", r: "#ef4444", g: "#22c55e", b: "#3b82f6" }[ch];
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <div className="label">Curves</div>
        <div className="flex gap-1 text-xs">
          {(["rgb", "r", "g", "b"] as Channel[]).map((c) => <button key={c} className={`btn h-6 px-2 ${ch === c ? "!bg-accent-soft !text-accent" : ""}`} aria-pressed={ch === c} onClick={() => setCh(c)}>{c.toUpperCase()}</button>)}
        </div>
      </div>
      <svg ref={svg} viewBox={`0 0 ${S} ${S}`} className="w-full aspect-square rounded-md bg-surface-2 touch-none cursor-crosshair" aria-label="Curves editor"
        onPointerDown={(e) => {
          const p = toPt(e);
          let i = pts.findIndex(([x, y]) => Math.hypot(x - p[0], y - p[1]) < 14);
          let next = pts;
          if (i < 0) { next = [...pts, p].sort((a, b) => a[0] - b[0]); i = next.findIndex((q) => q === p); onChange(ch, next, false); }
          drag.current = i;
          (e.target as Element).setPointerCapture?.(e.pointerId);
        }}
        onPointerMove={(e) => {
          if (drag.current === null) return;
          const p = toPt(e), i = drag.current;
          const next = pts.map((q, j) => (j === i ? ([i === 0 ? 0 : i === pts.length - 1 ? 255 : p[0], p[1]] as CurvePoint) : q));
          onChange(ch, next, true);
        }}
        onPointerUp={() => { drag.current = null; }}
        onDoubleClick={(e) => {
          const p = toPt(e as unknown as React.PointerEvent);
          const i = pts.findIndex(([x, y]) => Math.hypot(x - p[0], y - p[1]) < 14);
          if (i > 0 && i < pts.length - 1) onChange(ch, pts.filter((_, j) => j !== i), false);
        }}>
        {[1, 2, 3].map((k) => <g key={k} stroke="currentColor" opacity={0.12}><line x1={(k * S) / 4} y1={0} x2={(k * S) / 4} y2={S} /><line x1={0} y1={(k * S) / 4} x2={S} y2={(k * S) / 4} /></g>)}
        <line x1={0} y1={S} x2={S} y2={0} stroke="currentColor" opacity={0.2} strokeDasharray="4 4" />
        <path d={path} fill="none" stroke={colour} strokeWidth={2} />
        {pts.map(([x, y], i) => <circle key={i} cx={(x / 255) * S} cy={S - (y / 255) * S} r={5} fill="var(--surface)" stroke={colour} strokeWidth={2} />)}
      </svg>
      <p className="text-xs text-muted">Click to add a point, drag to shape, double-click a point to remove it.</p>
    </div>
  );
}

function LevelsEditor({ levels, onChange }: { levels?: Levels; onChange: (l: Levels) => void }) {
  const l = levels ?? { inBlack: 0, inWhite: 255, gamma: 1, outBlack: 0, outWhite: 255 };
  const row = (k: keyof Levels, label: string, min: number, max: number, step = 1) => (
    <label className="flex items-center gap-2 text-sm">
      <span className="w-24 text-muted shrink-0">{label}</span>
      <input type="range" className="flex-1 min-w-0" min={min} max={max} step={step} value={l[k]} aria-label={`Levels ${label}`}
        onChange={(e) => onChange({ ...l, [k]: Number(e.target.value) })} />
      <span className="w-10 text-right tabular-nums text-xs">{l[k]}</span>
    </label>
  );
  return (
    <div className="space-y-1.5">
      <div className="label">Levels</div>
      {row("inBlack", "Input black", 0, 254)}
      {row("gamma", "Midtones", 0.1, 3, 0.01)}
      {row("inWhite", "Input white", 1, 255)}
      {row("outBlack", "Output black", 0, 255)}
      {row("outWhite", "Output white", 0, 255)}
    </div>
  );
}
