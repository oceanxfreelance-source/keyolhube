"use client";
// Healing brush: paint over what should disappear, then fill it from the surroundings.
import { useState } from "react";
import { Group, Line } from "react-konva";
import { apply, invert, localMatrix, locate, mul } from "@/lib/doc/geometry";
import type { ImageNode } from "@/lib/doc/types";
import { loadImage } from "@/lib/editor/render";
import { inpaint } from "@/lib/photo/inpaint";
import { activePage, useEd, useEditorCtx, useUi } from "./context";
import { setCutout } from "./photoFrames";
import { uploadImage } from "./useUploads";

const MAX_SIDE = 2400; // processing resolution (keeps it fast in the browser)

export function HealStrokes() {
  const heal = useUi((s) => s.heal);
  if (!heal) return null;
  return (
    <Group listening={false}>
      {heal.strokes.map((pts, i) => <Line key={i} points={pts} stroke="#ff2d55" opacity={0.5} strokeWidth={heal.size} lineCap="round" lineJoin="round" />)}
    </Group>
  );
}

export function HealBar() {
  const { store, ui } = useEditorCtx();
  const heal = useUi((s) => s.heal);
  const page = useEd(activePage);
  const docW = useEd((s) => s.doc.width);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!heal) return null;
  const node = locate(page, heal.imageId);

  async function run() {
    if (!node || node.node.type !== "image" || !heal?.strokes.length) return;
    const img = node.node as ImageNode;
    setBusy(true); setError(null);
    try {
      const pic = await loadImage(img.src);
      const s = Math.min(1, MAX_SIDE / Math.max(img.naturalWidth, img.naturalHeight));
      const W = Math.round(img.naturalWidth * s), H = Math.round(img.naturalHeight * s);
      const crop = img.crop ?? { x: 0, y: 0, width: img.naturalWidth, height: img.naturalHeight };
      // page -> element-local -> source pixel (crop) -> processing pixel
      const inv = invert(mul(node.parentMatrix, localMatrix(img)));
      const toPix = (x: number, y: number) => { const [lx, ly] = apply(inv, x, y); return [(crop.x + (lx / img.width) * crop.width) * s, (crop.y + (ly / img.height) * crop.height) * s]; };
      const maskCv = document.createElement("canvas"); maskCv.width = W; maskCv.height = H;
      const mctx = maskCv.getContext("2d")!;
      mctx.strokeStyle = "#fff"; mctx.lineCap = "round"; mctx.lineJoin = "round";
      mctx.lineWidth = heal.size * (crop.width / img.width) * s;
      for (const pts of heal.strokes) {
        mctx.beginPath();
        for (let i = 0; i < pts.length; i += 2) { const [px, py] = toPix(pts[i], pts[i + 1]); if (i) mctx.lineTo(px, py); else mctx.moveTo(px, py); }
        if (pts.length === 2) { const [px, py] = toPix(pts[0], pts[1]); mctx.lineTo(px + 0.01, py); }
        mctx.stroke();
      }
      const md = mctx.getImageData(0, 0, W, H).data, mask = new Uint8Array(W * H);
      for (let i = 0; i < W * H; i++) mask[i] = md[i * 4 + 3] > 40 ? 255 : 0;
      const cv = document.createElement("canvas"); cv.width = W; cv.height = H;
      const ctx = cv.getContext("2d")!;
      ctx.drawImage(pic, 0, 0, W, H);
      const pix = ctx.getImageData(0, 0, W, H);
      let alpha = false;
      for (let i = 3; i < pix.data.length; i += 4) if (pix.data[i] < 255) { alpha = true; break; }
      const res = inpaint(pix, mask);
      pix.data.set(res.data);
      ctx.putImageData(pix, 0, 0);
      const blob = await new Promise<Blob>((r, j) => cv.toBlob((b) => (b ? r(b) : j(new Error("Could not create the image"))), alpha ? "image/png" : "image/jpeg", 0.95));
      const a = await uploadImage(new File([blob], alpha ? "healed.png" : "healed.jpg", { type: blob.type }));
      setCutout(store, img.id, a, "Remove objects");
      ui.getState().set({ heal: { ...heal, strokes: [] } });
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }

  return (
    <div className="absolute top-3 left-1/2 -translate-x-1/2 z-10 card flex flex-wrap items-center gap-3 px-3 py-2 text-sm max-w-[95%]" data-testid="heal-bar">
      <span className="font-medium">Healing brush</span>
      <span className="text-muted text-xs">Paint over what you want to remove</span>
      <label className="flex items-center gap-1">Size <input type="range" min={4} max={Math.max(80, Math.round(docW / 10))} value={heal.size} aria-label="Healing brush size"
        onChange={(e) => ui.getState().set({ heal: { ...heal, size: Number(e.target.value) } })} /></label>
      <button className="btn h-7 px-2" disabled={!heal.strokes.length || busy} onClick={() => ui.getState().set({ heal: { ...heal, strokes: heal.strokes.slice(0, -1) } })}>Undo stroke</button>
      <button className="btn btn-primary h-7 px-2" disabled={!heal.strokes.length || busy} onClick={run}>{busy ? "Removing…" : "Remove"}</button>
      <button className="btn h-7 px-2" onClick={() => ui.getState().set({ heal: null })}>Done</button>
      {error && <span role="alert" className="text-danger text-xs w-full">{error}</span>}
    </div>
  );
}
