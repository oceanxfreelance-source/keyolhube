"use client";
import { Brush, PenTool, ChevronLeft, CloudOff, Download, Hand, History, Loader2, Maximize, Minus, MousePointer2, Plus, Redo2, Undo2, Check, AlertTriangle } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { ThemeToggle } from "@/components/ThemeToggle";
import { useEd, useEditorCtx, useUi } from "./context";
import { ExportDialog } from "./ExportDialog";
import type { SaveStatus } from "./useAutosave";
import { VersionsDialog } from "./VersionsDialog";

export function TopBar({ title, onRename, status, errorText, onRestored, onReloadLatest }: {
  title: string; onRename: (t: string) => void; status: SaveStatus; errorText: string | null;
  onRestored: (doc: import("@/lib/doc/types").DesignDoc, revision: number) => void; onReloadLatest: () => void;
}) {
  const { store, ui } = useEditorCtx();
  const canUndo = useEd((s) => s.past.length > 0), canRedo = useEd((s) => s.future.length > 0);
  const { zoom, tool, pro } = useUi((s) => ({ zoom: s.zoom, tool: s.tool, pro: s.pro }));
  const [dialog, setDialog] = useState<"export" | "versions" | null>(null);
  const setPro = (on: boolean) => { ui.getState().set({ pro: on, showRulers: on }); try { localStorage.setItem("pro", on ? "1" : "0"); } catch {} };

  return (
    <header className="h-14 shrink-0 flex items-center gap-1 px-2 bg-surface border-b border-line">
      <Link href="/dashboard" className="btn btn-ghost btn-icon" aria-label="Back to your designs" title="Your designs"><ChevronLeft size={20} /></Link>
      <input key={title} defaultValue={title} aria-label="Design title" className="input !border-transparent hover:!border-line focus:!border-line h-9 w-32 sm:w-56 font-medium"
        onBlur={(e) => { const v = e.target.value.trim(); if (v && v !== title) onRename(v); else e.target.value = title; }}
        onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); e.stopPropagation(); }} />
      <SaveBadge status={status} errorText={errorText} onReload={onReloadLatest} />
      <div className="flex-1" />
      <div className="hidden sm:flex items-center gap-0.5">
        <button className={`btn btn-ghost btn-icon ${tool === "select" ? "!text-accent" : ""}`} aria-pressed={tool === "select"} title="Select (V)" aria-label="Select tool" onClick={() => ui.getState().set({ tool: "select" })}><MousePointer2 size={18} /></button>
        <button className={`btn btn-ghost btn-icon ${tool === "pen" ? "!text-accent" : ""}`} aria-pressed={tool === "pen"} title="Pen: click for corners, drag for curves, click the first point to close, Enter to finish (P)" aria-label="Pen tool" onClick={() => ui.getState().set({ tool: "pen", editingPathId: null })}><PenTool size={18} /></button>
        <button className={`btn btn-ghost btn-icon ${tool === "brush" ? "!text-accent" : ""}`} aria-pressed={tool === "brush"} title="Brush: draw freehand; strokes become editable paths (B)" aria-label="Brush tool" onClick={() => ui.getState().set({ tool: "brush", editingPathId: null })}><Brush size={18} /></button>
        <button className={`btn btn-ghost btn-icon ${tool === "hand" ? "!text-accent" : ""}`} aria-pressed={tool === "hand"} title="Hand: pan the canvas (H or hold Space)" aria-label="Hand tool" onClick={() => ui.getState().set({ tool: "hand" })}><Hand size={18} /></button>
      </div>
      <button className="btn btn-ghost btn-icon" disabled={!canUndo} onClick={() => store.getState().undo()} title="Undo (Ctrl+Z)" aria-label="Undo"><Undo2 size={18} /></button>
      <button className="btn btn-ghost btn-icon" disabled={!canRedo} onClick={() => store.getState().redo()} title="Redo (Ctrl+Shift+Z)" aria-label="Redo"><Redo2 size={18} /></button>
      <div className="hidden md:flex items-center">
        <button className="btn btn-ghost btn-icon" onClick={() => ui.getState().set({ zoom: Math.max(0.02, zoom / 1.25) })} aria-label="Zoom out"><Minus size={16} /></button>
        <button className="btn btn-ghost px-1 w-14 tabular-nums" onClick={() => ui.getState().set({ fitRequest: ui.getState().fitRequest + 1 })} title="Fit to screen (Ctrl+0)" aria-label="Fit to screen">{Math.round(zoom * 100)}%</button>
        <button className="btn btn-ghost btn-icon" onClick={() => ui.getState().set({ zoom: Math.min(16, zoom * 1.25) })} aria-label="Zoom in"><Plus size={16} /></button>
        <button className="btn btn-ghost btn-icon" onClick={() => ui.getState().set({ fitRequest: ui.getState().fitRequest + 1 })} aria-label="Fit page" title="Fit page"><Maximize size={16} /></button>
      </div>
      <label className="hidden sm:flex items-center gap-1.5 text-xs text-muted mx-1 cursor-pointer" title="Advanced mode shows professional controls">
        <input type="checkbox" checked={pro} onChange={(e) => setPro(e.target.checked)} className="accent-[var(--accent)]" /> Pro
      </label>
      <button className="btn btn-ghost btn-icon" onClick={() => setDialog("versions")} title="Version history" aria-label="Version history"><History size={18} /></button>
      <ThemeToggle />
      <button className="btn btn-primary ml-1" onClick={() => setDialog("export")}><Download size={16} /> <span className="hidden sm:inline">Export</span></button>
      {dialog === "export" && <ExportDialog title={title} onClose={() => setDialog(null)} />}
      {dialog === "versions" && <VersionsDialog onClose={() => setDialog(null)} onRestored={(d, r) => { setDialog(null); onRestored(d, r); }} />}
    </header>
  );
}

function SaveBadge({ status, errorText, onReload }: { status: SaveStatus; errorText: string | null; onReload: () => void }) {
  const base = "hidden sm:flex items-center gap-1 text-xs ml-1";
  if (status === "saved") return <span className={`${base} text-muted`} role="status"><Check size={14} /> Saved</span>;
  if (status === "saving" || status === "unsaved") return <span className={`${base} text-muted`} role="status"><Loader2 size={14} className="animate-spin" /> Saving…</span>;
  if (status === "offline") return <span className={`${base} text-danger`} role="status"><CloudOff size={14} /> Offline, will retry</span>;
  if (status === "conflict") return (
    <span className="flex items-center gap-1 text-xs text-danger ml-1" role="alert">
      <AlertTriangle size={14} /> Changed in another tab. <button className="underline" onClick={onReload}>Load latest</button>
    </span>
  );
  return <span className={`${base} text-danger`} role="alert"><AlertTriangle size={14} /> {errorText ?? "Not saved"}</span>;
}
