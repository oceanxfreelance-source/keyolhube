"use client";
import { useState } from "react";
import { exportPdf } from "@/lib/export/pdf";
import { canvasToBlob, download, maxCanvasPixels, renderPageCanvas, safeName } from "@/lib/export/raster";
import { exportSvg } from "@/lib/export/svg";
import { activePage, useEd } from "./context";
import { Dialog } from "./Dialog";

type Fmt = "png" | "jpg" | "pdf" | "svg";

export function ExportDialog({ title, onClose }: { title: string; onClose: () => void }) {
  const doc = useEd((s) => s.doc);
  const page = useEd(activePage);
  const pageIndex = doc.pages.findIndex((p) => p.id === page.id);
  const [fmt, setFmt] = useState<Fmt>(doc.dpi >= 300 ? "pdf" : "png");
  const [scale, setScale] = useState(doc.dpi >= 300 ? 1 : 2);
  const [transparent, setTransparent] = useState(false);
  const [allPages, setAllPages] = useState(false);
  const [quality, setQuality] = useState(92);
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const maxScale = Math.sqrt(maxCanvasPixels() / (doc.width * doc.height));
  const outW = Math.round(doc.width * Math.min(scale, maxScale)), outH = Math.round(doc.height * Math.min(scale, maxScale));
  const name = safeName(title);

  async function run() {
    setBusy("Preparing…"); setError(null); setNote(null);
    try {
      if (fmt === "pdf") {
        const { blob, dpi } = await exportPdf(doc, (i, n) => setBusy(`Rendering page ${i + 1} of ${n}…`));
        download(blob, `${name}.pdf`);
        setNote(`PDF saved: ${doc.pages.length} page${doc.pages.length > 1 ? "s" : ""} at ${dpi} DPI.${dpi < 300 ? " This browser limited the resolution; use a computer for full 300 DPI." : ""}`);
      } else if (fmt === "svg") {
        download(await exportSvg(doc, page), `${name}${doc.pages.length > 1 ? `-page${pageIndex + 1}` : ""}.svg`);
        setNote("SVG saved. Fonts are referenced by name, not embedded.");
      } else {
        const pages = allPages ? doc.pages : [page];
        let clamped = false;
        for (const [i, p] of pages.entries()) {
          setBusy(`Rendering ${pages.length > 1 ? `page ${i + 1} of ${pages.length}` : "image"}…`);
          const r = await renderPageCanvas(doc, p, { pixelRatio: scale, transparent: fmt === "png" && transparent });
          clamped ||= r.clamped;
          const blob = await canvasToBlob(r.canvas, fmt === "png" ? "image/png" : "image/jpeg", quality / 100);
          const idx = allPages ? i + 1 : pageIndex + 1;
          download(blob, `${name}${doc.pages.length > 1 ? `-page${idx}` : ""}.${fmt}`);
        }
        setNote(clamped ? `Saved at ${outW} × ${outH} px (the most this browser allows).` : `Saved at ${outW} × ${outH} px.`);
      }
    } catch (e) {
      setError((e as Error).message || "Export failed");
    } finally {
      setBusy(null);
    }
  }

  const F = (f: Fmt, label: string, sub: string) => (
    <button onClick={() => setFmt(f)} aria-pressed={fmt === f} className={`rounded-lg border p-2.5 text-left ${fmt === f ? "border-accent bg-accent-soft" : "border-line hover:bg-surface-2"}`}>
      <div className="font-medium text-sm">{label}</div><div className="text-xs text-muted">{sub}</div>
    </button>
  );
  return (
    <Dialog title="Export" onClose={onClose}>
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-2">
          {F("png", "PNG", "Best quality image")}
          {F("jpg", "JPG", "Smaller image file")}
          {F("pdf", "PDF (print)", `All ${doc.pages.length} page${doc.pages.length > 1 ? "s" : ""}, 300 DPI`)}
          {F("svg", "SVG", "Vector, this page")}
        </div>
        {(fmt === "png" || fmt === "jpg") && (
          <div className="space-y-2">
            <label className="flex items-center gap-2 text-sm">
              <span className="w-20 text-muted">Size</span>
              <select className="input" value={scale} onChange={(e) => setScale(Number(e.target.value))} aria-label="Export size">
                {[0.5, 1, 2, 3, 4].map((s) => <option key={s} value={s}>{s}× ({Math.round(doc.width * s)} × {Math.round(doc.height * s)} px)</option>)}
              </select>
            </label>
            {fmt === "png" && <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={transparent} onChange={(e) => setTransparent(e.target.checked)} /> Transparent background {page.background.type !== "none" && <span className="text-xs text-muted">(set the page background to None)</span>}</label>}
            {fmt === "jpg" && <label className="flex items-center gap-2 text-sm"><span className="w-20 text-muted">Quality</span><input type="range" min={50} max={100} value={quality} onChange={(e) => setQuality(Number(e.target.value))} className="flex-1" aria-label="JPG quality" /><span className="w-10 text-right text-xs">{quality}</span></label>}
            {doc.pages.length > 1 && <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={allPages} onChange={(e) => setAllPages(e.target.checked)} /> All pages (one file each)</label>}
          </div>
        )}
        {fmt === "pdf" && <p className="text-xs text-muted">Pages are {Math.round((doc.width / doc.dpi) * 25.4)} × {Math.round((doc.height / doc.dpi) * 25.4)} mm. Each page is a high-resolution image, so text is not selectable in the PDF. Colours are RGB; ask your printer if they need CMYK.</p>}
        {fmt === "svg" && <p className="text-xs text-muted">Shapes and text stay sharp at any size. Images are embedded. Fonts are referenced by name, so open the file where the same fonts are installed.</p>}
        {error && <p role="alert" className="text-sm text-danger">{error}</p>}
        {note && <p role="status" className="text-sm text-ok">{note}</p>}
        <button className="btn btn-primary w-full" disabled={!!busy} onClick={run}>{busy ?? `Download ${fmt.toUpperCase()}`}</button>
      </div>
    </Dialog>
  );
}
