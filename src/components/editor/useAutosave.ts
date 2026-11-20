"use client";
import { useEffect, useRef, useState } from "react";
import { canvasToBlob, renderPageCanvas } from "@/lib/export/raster";
import type { EditorStore } from "@/lib/editor/store";

export type SaveStatus = "saved" | "saving" | "unsaved" | "offline" | "conflict" | "error";
const DEBOUNCE_MS = 1200;
const THUMB_MS = 20_000;

/** Saves every change after a short pause, retries when offline, and detects conflicts. */
export function useAutosave(store: EditorStore, projectId: string, initialRevision: number) {
  const [status, setStatus] = useState<SaveStatus>("saved");
  const [errorText, setErrorText] = useState<string | null>(null);
  const revision = useRef(initialRevision);
  const savedLocal = useRef(store.getState().revision);
  const inFlight = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastThumb = useRef(0);
  const blocked = useRef(false);

  const save = async () => {
    if (inFlight.current || blocked.current) return;
    const s = store.getState();
    if (s.revision === savedLocal.current) { setStatus("saved"); return; }
    inFlight.current = true;
    setStatus("saving");
    const localRev = s.revision;
    try {
      const r = await fetch(`/api/projects/${projectId}`, {
        method: "PATCH", headers: { "content-type": "application/json" },
        body: JSON.stringify({ baseRevision: revision.current, doc: s.doc }),
      });
      if (r.status === 409) { blocked.current = true; setStatus("conflict"); return; }
      if (!r.ok) {
        const b = await r.json().catch(() => ({}));
        setErrorText(b.error ?? `Save failed (${r.status})`);
        setStatus("error");
        return;
      }
      revision.current = (await r.json()).revision;
      savedLocal.current = localRev;
      setErrorText(null);
      setStatus(store.getState().revision === localRev ? "saved" : "unsaved");
      if (Date.now() - lastThumb.current > THUMB_MS) { lastThumb.current = Date.now(); void uploadThumb(); }
    } catch {
      setStatus("offline");
      timer.current = setTimeout(save, 5000); // retry when the network is back
    } finally {
      inFlight.current = false;
      if (!blocked.current && store.getState().revision !== savedLocal.current && status !== "offline") schedule();
    }
  };

  const uploadThumb = async () => {
    try {
      const { doc } = store.getState();
      const { canvas } = await renderPageCanvas(doc, doc.pages[0], { pixelRatio: 480 / Math.max(doc.width, doc.height), transparent: false });
      const blob = await canvasToBlob(canvas, "image/jpeg", 0.82);
      await fetch(`/api/projects/${projectId}/thumbnail`, { method: "PUT", body: blob });
    } catch { /* thumbnails are best-effort */ }
  };

  const schedule = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(save, DEBOUNCE_MS);
  };

  useEffect(() => {
    const unsub = store.subscribe((s, prev) => {
      if (s.revision !== prev.revision && !blocked.current) { setStatus("unsaved"); schedule(); }
    });
    const before = (e: BeforeUnloadEvent) => {
      if (store.getState().revision !== savedLocal.current) { e.preventDefault(); void save(); }
    };
    const online = () => { if (store.getState().revision !== savedLocal.current) void save(); };
    window.addEventListener("beforeunload", before);
    window.addEventListener("online", online);
    // first thumbnail shortly after opening
    const t = setTimeout(() => { lastThumb.current = Date.now(); void uploadThumb(); }, 3000);
    return () => { unsub(); window.removeEventListener("beforeunload", before); window.removeEventListener("online", online); clearTimeout(t); if (timer.current) clearTimeout(timer.current); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return {
    status, errorText,
    saveNow: save,
    /** After a conflict or a version restore: adopt the server state. */
    adopt(rev: number) { revision.current = rev; savedLocal.current = store.getState().revision; blocked.current = false; setStatus("saved"); },
    revisionRef: revision,
  };
}
