"use client";
import { useCallback } from "react";
import { make } from "@/lib/doc/factory";
import { activePage, useEditorCtx } from "./context";

export type UploadedAsset = { id: string; url: string; width: number; height: number };

export async function uploadImage(file: File): Promise<UploadedAsset> {
  const f = new FormData();
  f.append("file", file);
  const r = await fetch("/api/assets", { method: "POST", body: f });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(body.error ?? "Upload failed");
  return body;
}

/** Add an uploaded image to the page, fitted inside the page, centred on (cx, cy) if given. */
export function useAddImage() {
  const { store } = useEditorCtx();
  return useCallback((a: UploadedAsset, at?: { x: number; y: number }) => {
    const s = store.getState();
    const { width: W, height: H } = s.doc;
    const scale = Math.min(1, (W * 0.8) / a.width, (H * 0.8) / a.height);
    const w = Math.round(a.width * scale), h = Math.round(a.height * scale);
    const x = Math.round((at?.x ?? W / 2) - w / 2), y = Math.round((at?.y ?? H / 2) - h / 2);
    const node = make.image(x, y, w, h, a.id, a.url, a.width, a.height);
    s.changePage("Add image", (p) => { p.children.push(node); });
    s.select([node.id]);
    return node.id;
  }, [store]);
}

/** Drag-and-drop image files onto the canvas. */
export function useImageDrop(toDoc: (sx: number, sy: number) => { x: number; y: number }) {
  const add = useAddImage();
  const { store } = useEditorCtx();
  const onDragOver = useCallback((e: React.DragEvent) => {
    if (e.dataTransfer.types.includes("Files")) { e.preventDefault(); e.dataTransfer.dropEffect = "copy"; }
  }, []);
  const onDrop = useCallback(async (e: React.DragEvent) => {
    const files = [...e.dataTransfer.files].filter((f) => f.type.startsWith("image/"));
    if (!files.length) return;
    e.preventDefault();
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const at = toDoc(e.clientX - rect.left, e.clientY - rect.top);
    for (const [i, f] of files.entries()) {
      try {
        const a = await uploadImage(f);
        add(a, { x: at.x + i * 24, y: at.y + i * 24 });
      } catch (err) {
        alert(`${f.name}: ${(err as Error).message}`);
      }
    }
    void activePage(store.getState());
  }, [add, toDoc, store]);
  return { onDragOver, onDrop };
}
