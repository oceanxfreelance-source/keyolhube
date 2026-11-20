"use client";
import { PDFDocument } from "pdf-lib";
import type { DesignDoc } from "../doc/types";
import { canvasToBlob, renderPageCanvas } from "./raster";

/**
 * Multi-page PDF at the design's physical size. Each page is a high-resolution image (at least
 * 300 DPI when the browser allows it), so it prints sharply; text is not selectable yet.
 */
export async function exportPdf(doc: DesignDoc, onProgress?: (i: number, n: number) => void) {
  const pdf = await PDFDocument.create();
  pdf.setProducer("OceanX Studio");
  pdf.setCreator("OceanX Studio");
  const ptW = (doc.width / doc.dpi) * 72, ptH = (doc.height / doc.dpi) * 72;
  let minDpi = Infinity;
  for (const [i, page] of doc.pages.entries()) {
    onProgress?.(i, doc.pages.length);
    const { canvas, pixelRatio } = await renderPageCanvas(doc, page, { pixelRatio: Math.max(1, 300 / doc.dpi), transparent: false });
    minDpi = Math.min(minDpi, doc.dpi * pixelRatio);
    const jpg = await canvasToBlob(canvas, "image/jpeg", 0.95);
    const img = await pdf.embedJpg(new Uint8Array(await jpg.arrayBuffer()));
    pdf.addPage([ptW, ptH]).drawImage(img, { x: 0, y: 0, width: ptW, height: ptH });
  }
  const bytes = await pdf.save();
  return { blob: new Blob([bytes as BlobPart], { type: "application/pdf" }), dpi: Math.round(minDpi) };
}
