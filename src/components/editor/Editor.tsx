"use client";
import { useEffect, useMemo, useState } from "react";
import type { DesignDoc } from "@/lib/doc/types";
import { ensureFonts } from "@/lib/fonts";
import { fontsUsed } from "@/lib/export/raster";
import { createEditorStore } from "@/lib/editor/store";
import { CanvasView } from "./CanvasView";
import { createUiStore, EditorProvider, useEd } from "./context";
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
  useEffect(() => { ensureFonts(fontsUsed(project.doc.pages)).finally(() => setFontsReady(true)); }, [project.doc]);
  return (
    <EditorProvider value={{ store, ui, project: { id: project.id, title } }}>
      {fontsReady ? <Shell project={project} title={title} setTitle={setTitle} /> : <div className="h-full grid place-items-center text-muted text-sm">Loading fonts…</div>}
    </EditorProvider>
  );
}

function Shell({ project, title, setTitle }: { project: LoadedProject; title: string; setTitle: (t: string) => void }) {
  const ctx = useEdCtx();
  const autosave = useAutosave(ctx.store, project.id, project.revision);
  useShortcuts();
  const pageCount = useEd((s) => s.doc.pages.length);
  const pageIndex = useEd((s) => s.doc.pages.findIndex((p) => p.id === s.pageId));

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
    <div className="h-dvh flex flex-col">
      <TopBar title={title} onRename={rename} status={autosave.status} errorText={autosave.errorText}
        onRestored={(doc, rev) => { ctx.store.getState().load(doc); autosave.adopt(rev); }} onReloadLatest={reloadLatest} />
      <div className="flex-1 min-h-0 flex max-md:flex-col-reverse">
        <LeftRail />
        <LeftPanel />
        <div className="flex-1 min-w-0 min-h-0 flex flex-col">
          <CanvasView />
          {pageCount > 1 && <div className="text-xs text-muted text-center py-1 bg-surface border-t border-line">Page {pageIndex + 1} of {pageCount}</div>}
        </div>
        <PropertiesPanel />
      </div>
    </div>
  );
}

import { useEditorCtx as useEdCtx } from "./context";
