"use client";
import { useEffect, useMemo, useState } from "react";
import type { DesignDoc } from "@/lib/doc/types";
import { ensureFonts, loadDocFonts } from "@/lib/fonts";
import { fontsUsed } from "@/lib/export/raster";
import { createEditorStore } from "@/lib/editor/store";
import { CanvasView } from "./CanvasView";
import { createUiStore, EditorProvider, useEd, useUi } from "./context";
import { LeftPanel, LeftRail } from "./LeftPanel";
import { PropertiesPanel } from "./PropertiesPanel";
import { TopBar } from "./TopBar";
import { useAutosave } from "./useAutosave";
import { useShortcuts } from "./useShortcuts";

export type LoadedProject = { id: string; title: string; doc: DesignDoc; revision: number };

export function Editor({ project }: { project: LoadedProject }) {
  const store = useMemo(() => createEditorStore(project.doc), [project.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const ui = useMemo(() => createUiStore(), []);
  const [title, setTitle] = useState(project.title);
  const [fontsReady, setFontsReady] = useState(false);
  // Read-only handle for automated tests and support debugging.
  useEffect(() => { (window as unknown as { __oceanx?: object }).__oceanx = { store, ui }; }, [store, ui]);
  const [fontWarning, setFontWarning] = useState<string[]>([]);
  useEffect(() => {
    loadDocFonts(project.doc).then((failed) => { setFontWarning(failed); return ensureFonts(fontsUsed(project.doc.pages)); }).finally(() => setFontsReady(true));
  }, [project.doc]);
  return (
    <EditorProvider value={{ store, ui, project: { id: project.id, title } }}>
      {fontWarning.length > 0 && fontsReady && (
        <div role="alert" className="fixed bottom-3 left-1/2 -translate-x-1/2 z-40 card px-4 py-2 text-sm text-danger">
          Could not load: {fontWarning.join(", ")}. Text in those fonts shows in a fallback font. <button className="underline ml-1" onClick={() => setFontWarning([])}>OK</button>
        </div>
      )}
      {fontsReady ? <Shell project={project} title={title} setTitle={setTitle} /> : <div className="h-full grid place-items-center text-muted text-sm">Loading fonts…</div>}
    </EditorProvider>
  );
}

function Shell({ project, title, setTitle }: { project: LoadedProject; title: string; setTitle: (t: string) => void }) {
  const ctx = useEdCtx();
  const autosave = useAutosave(ctx.store, project.id, project.revision);
  useEffect(() => { ctx.ui.getState().set({ saveNow: autosave.saveNow }); }); // keep the latest closure
  useEffect(() => {
    fetch("/api/brand-kits").then((r) => r.json()).then((b) => ctx.ui.getState().set({ brandKits: b.kits })).catch(() => ctx.ui.getState().set({ brandKits: [] }));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useShortcuts();
  const pageCount = useEd((s) => s.doc.pages.length);
  const pageIndex = useEd((s) => s.doc.pages.findIndex((p) => p.id === s.pageId));
  const hasSelection = useEd((s) => s.selection.length > 0);
  const leftTab = useUi((s) => s.leftTab);
  const mobile = useIsMobile();
  // On phones one panel at a time: picking something to add closes the menu so the canvas shows.
  useEffect(() => {
    if (!mobile) return;
    ctx.ui.getState().set({ leftTab: null });
    return ctx.store.subscribe((st, prev) => {
      const ui = ctx.ui.getState();
      if (st.selection !== prev.selection && st.selection.length && ui.leftTab && ui.leftTab !== "layers") ui.set({ leftTab: null });
    });
  }, [mobile]); // eslint-disable-line react-hooks/exhaustive-deps

  async function rename(t: string) {
    await autosave.saveNow();
    const r = await fetch(`/api/projects/${project.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ baseRevision: autosave.revisionRef.current, title: t }) });
    if (r.ok) { autosave.adopt((await r.json()).revision); setTitle(t); }
  }
  async function reloadLatest() {
    const r = await fetch(`/api/projects/${project.id}`);
    if (!r.ok) return;
    const p = await r.json();
    ctx.store.getState().load(p.doc);
    autosave.adopt(p.revision);
    setTitle(p.title);
  }

  return (
    <div className="pro-ui h-dvh flex flex-col overflow-hidden bg-bg">
      <TopBar title={title} onRename={rename} status={autosave.status} errorText={autosave.errorText}
        onRestored={(doc, rev) => { ctx.store.getState().load(doc); autosave.adopt(rev); }} onReloadLatest={reloadLatest} />
      <div className="flex-1 min-h-0 flex max-md:flex-col">
        <LeftRail />
        {(!mobile || leftTab) && <LeftPanel />}
        <div className="flex-1 min-w-0 min-h-0 flex flex-col max-md:order-1">
          <CanvasView />
          <StatusBar pageIndex={pageIndex} pageCount={pageCount} />
        </div>
        {(!mobile || (!leftTab && hasSelection)) && <PropertiesPanel />}
      </div>
    </div>
  );
}

import { useEditorCtx as useEdCtx } from "./context";

function useIsMobile() {
  const [m, setM] = useState(false);
  useEffect(() => {
    const q = window.matchMedia("(max-width: 767px)");
    const on = () => setM(q.matches);
    on();
    q.addEventListener("change", on);
    return () => q.removeEventListener("change", on);
  }, []);
  return m;
}

function StatusBar({ pageIndex, pageCount }: { pageIndex: number; pageCount: number }) {
  const ctx = useEdCtx();
  const doc = useEd((s) => ({ w: s.doc.width, h: s.doc.height, dpi: s.doc.dpi, unit: s.doc.unit }));
  const pages = useEd((s) => s.doc.pages.map((p) => p.id));
  const zoom = useUi((s) => s.zoom);
  const sel = useEd((s) => s.selection.length);
  const size = doc.unit === "px" ? `${doc.w} × ${doc.h} px` : doc.unit === "mm" ? `${Math.round((doc.w / doc.dpi) * 254) / 10} × ${Math.round((doc.h / doc.dpi) * 254) / 10} mm` : `${Math.round((doc.w / doc.dpi) * 100) / 100} × ${Math.round((doc.h / doc.dpi) * 100) / 100} in`;
  return (
    <div className="h-7 shrink-0 flex items-center gap-3 px-3 text-[11px] text-muted bg-surface border-t border-line max-md:hidden" data-testid="status-bar">
      <div className="flex items-center gap-1">
        <button className="px-1 hover:text-ink disabled:opacity-30" disabled={pageIndex <= 0} onClick={() => ctx.store.getState().setPage(pages[pageIndex - 1])} aria-label="Previous page">‹</button>
        <span>Page {pageIndex + 1} / {pageCount}</span>
        <button className="px-1 hover:text-ink disabled:opacity-30" disabled={pageIndex >= pageCount - 1} onClick={() => ctx.store.getState().setPage(pages[pageIndex + 1])} aria-label="Next page">›</button>
      </div>
      <span>{size}{doc.unit !== "px" ? ` · ${doc.dpi} DPI` : ""}</span>
      {sel > 0 && <span>{sel} selected</span>}
      <span className="flex-1" />
      <span className="tabular-nums">{Math.round(zoom * 100)}%</span>
    </div>
  );
}
