"use client";
import Konva from "konva";
import { Layers, Wand2 } from "lucide-react";
import { useState } from "react";
import { make, solid } from "@/lib/doc/factory";
import { locate } from "@/lib/doc/geometry";
import type { DesignNode, ImageNode } from "@/lib/doc/types";
import { loadImage, measureTextHeight } from "@/lib/editor/render";
import { useEditorCtx } from "./context";
import { Dialog } from "./Dialog";
import { uploadImage } from "./useUploads";

/** Split a flat design image into editable layers: background, person and text. */
export function MagicLayersDialog({ imageId, onClose }: { imageId: string; onClose: () => void }) {
  const { store } = useEditorCtx();
  const [dhivehi, setDhivehi] = useState(false);
  const [person, setPerson] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [pct, setPct] = useState<number | undefined>();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  async function run() {
    setError(null); setDone(null); setBusy("Preparing…");
    try {
      const s = store.getState();
      const page = s.doc.pages.find((p) => p.id === s.pageId)!;
      const loc = locate(page, imageId);
      if (!loc || loc.node.type !== "image") throw new Error("Select an image first.");
      const node = loc.node as ImageNode;
      const el = await loadImage(node.src);
      const c = node.crop ?? { x: 0, y: 0, width: el.naturalWidth, height: el.naturalHeight };
      const src = document.createElement("canvas");
      src.width = Math.round(c.width * (el.naturalWidth / node.naturalWidth)); src.height = Math.round(c.height * (el.naturalHeight / node.naturalHeight));
      const sx = el.naturalWidth / node.naturalWidth, sy = el.naturalHeight / node.naturalHeight;
      src.getContext("2d")!.drawImage(el, c.x * sx, c.y * sy, c.width * sx, c.height * sy, 0, 0, src.width, src.height);

      const { magicLayers } = await import("@/lib/photo/magic");
      const r = await magicLayers(src, { dhivehi, person, onStep: (l, p) => { setBusy(l); setPct(p); } });
      setBusy("Saving the layers…"); setPct(undefined);
      const bg = await uploadImage(new File([r.background], "background.jpg", { type: "image/jpeg" }));
      const pp = r.person ? await uploadImage(new File([r.person], "person.png", { type: "image/png" })) : null;

      const k = node.width / r.width, ky = node.height / r.height;
      const mk = (a: typeof bg, name: string): ImageNode => {
        const n = make.image(node.x, node.y, node.width, node.height, a.id, a.url, a.width, a.height);
        return { ...n, name, rotation: node.rotation, opacity: node.opacity };
      };
      const layers: DesignNode[] = [mk(bg, "Background (text removed)")];
      if (pp) layers.push(mk(pp, "Person"));
      for (const t of r.texts) {
        const n = make.text(node.x + t.x * k, node.y + t.y * ky, t.text, Math.max(4, Math.round(t.size * k * 100) / 100), Math.max(20, t.width * k));
        Object.assign(n, { fontFamily: t.font, fontWeight: t.weight, fill: solid(t.color), align: t.align, lineHeight: Math.round(t.lineHeight * 100) / 100, letterSpacing: Math.round(t.letterSpacing * k * 10) / 10, direction: t.rtl ? "rtl" : "auto", name: t.text.split("\n")[0].slice(0, 40) });
        n.height = measureTextHeight(Konva, n);
        layers.push(n);
      }
      s.change("Magic layers", (d) => {
        const pg = d.pages.find((p) => p.id === s.pageId)!;
        const l = locate(pg as never, imageId);
        if (!l) return;
        l.list.splice(l.index, 1, ...(layers as never[]));
      });
      store.getState().select(layers.filter((l) => l.type === "text").map((l) => l.id));
      const parts = [`${r.texts.length} text layer${r.texts.length === 1 ? "" : "s"}`, pp ? "a person layer" : null, "a clean background"].filter(Boolean);
      setDone(`Done: ${parts.join(", ")}. Click any text to edit it.${r.personNote && person ? ` (Person: ${r.personNote})` : ""}`);
    } catch (e) {
      setError((e as Error).message || "Something went wrong");
    } finally {
      setBusy(null); setPct(undefined);
    }
  }

  return (
    <Dialog title="Magic layers" onClose={onClose}>
      <div className="space-y-3 text-sm">
        <div className="flex gap-3 items-start">
          <div className="size-10 rounded-xl bg-accent-soft text-accent grid place-items-center shrink-0"><Layers size={20} /></div>
          <p className="text-muted">Turns a flat design (a poster, flyer or social post saved as an image) into separate layers you can edit: the text becomes real text, and the background is cleaned up behind it.</p>
        </div>
        <label className="flex items-center gap-2"><input type="checkbox" checked={person} onChange={(e) => setPerson(e.target.checked)} /> Put people on their own layer</label>
        <label className="flex items-center gap-2"><input type="checkbox" checked={dhivehi} onChange={(e) => setDhivehi(e.target.checked)} /> The image has Dhivehi (Thaana) text <span className="text-muted">(experimental)</span></label>
        {busy && (
          <div role="status" className="space-y-1">
            <div className="text-xs">{busy}{pct !== undefined ? ` ${pct}%` : ""}</div>
            <div className="h-1.5 rounded bg-surface-2 overflow-hidden"><div className="h-full bg-accent transition-all" style={{ width: `${pct ?? 100}%`, opacity: pct === undefined ? 0.5 : 1 }} /></div>
          </div>
        )}
        {error && <p role="alert" className="text-danger text-xs">{error}</p>}
        {done && <p role="status" className="text-ok text-xs">{done}</p>}
        <div className="flex gap-2">
          {done ? <button className="btn btn-primary flex-1" onClick={onClose}>Close</button>
            : <button className="btn btn-primary flex-1" disabled={!!busy} onClick={run}><Wand2 size={15} /> {busy ? "Working…" : "Make layers"}</button>}
        </div>
        <p className="text-xs text-muted">Runs on your device; nothing is sent to a server. Text is read by OCR, so check spelling and delete any misread text (Delete key). Handwriting-style script fonts and heavily stylised headlines may not be read and stay part of the background. Dhivehi reading is experimental. The typeface is estimated (pick the exact font after). The background is filled from surrounding pixels: very good on plain or gradient areas, softer on detailed photos. Undo restores the original image.</p>
      </div>
    </Dialog>
  );
}
