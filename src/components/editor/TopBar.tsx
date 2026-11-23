"use client";
import {
  AlertTriangle, Brush, Check, ChevronDown, ChevronLeft, Circle, CloudOff, Download, Hand, History, Loader2, Minus as LineIcon, MousePointer2, PenTool, Redo2, Square, Type, Undo2,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ThemeToggle } from "@/components/ThemeToggle";
import type { DesignDoc } from "@/lib/doc/types";
import { duplicateNodes, groupNodes, removeNodes, reorder, ungroup } from "@/lib/doc/ops";
import type { Page } from "@/lib/doc/types";
import { activePage, type Tool, useEd, useEditorCtx, useUi } from "./context";
import { ExportDialog } from "./ExportDialog";
import type { SaveStatus } from "./useAutosave";
import { VersionsDialog } from "./VersionsDialog";

const mod = typeof navigator !== "undefined" && /Mac|iP(hone|ad)/.test(navigator.platform) ? "⌘" : "Ctrl+";
const TOOLS: { id: Tool; label: string; key: string; icon: React.ComponentType<{ size?: number }> }[] = [
  { id: "select", label: "Move", key: "V", icon: MousePointer2 },
  { id: "hand", label: "Hand", key: "H", icon: Hand },
  { id: "rect", label: "Rectangle", key: "R", icon: Square },
  { id: "ellipse", label: "Ellipse", key: "O", icon: Circle },
  { id: "line", label: "Line", key: "L", icon: LineIcon },
  { id: "text", label: "Text", key: "T", icon: Type },
  { id: "pen", label: "Pen", key: "P", icon: PenTool },
  { id: "brush", label: "Brush", key: "B", icon: Brush },
];

export function TopBar({ title, onRename, status, errorText, onRestored, onReloadLatest }: {
  title: string; onRename: (t: string) => void; status: SaveStatus; errorText: string | null;
  onRestored: (doc: DesignDoc, revision: number) => void; onReloadLatest: () => void;
}) {
  const { store, ui } = useEditorCtx();
  const canUndo = useEd((s) => s.past.length > 0), canRedo = useEd((s) => s.future.length > 0);
  const hasSel = useEd((s) => s.selection.length > 0);
  const { zoom, tool, pro, showGrid, showRulers } = useUi((s) => ({ zoom: s.zoom, tool: s.tool, pro: s.pro, showGrid: s.showGrid, showRulers: s.showRulers }));
  const [dialog, setDialog] = useState<"export" | "versions" | null>(null);
  const [menu, setMenu] = useState<string | null>(null);
  const setPro = (on: boolean) => { ui.getState().set({ pro: on, showRulers: on }); try { localStorage.setItem("pro", on ? "1" : "0"); } catch {} };
  const s = () => store.getState();
  const sel = () => s().selection;
  const setZoom = (z: number) => ui.getState().set({ zoom: Math.max(0.02, Math.min(16, z)) });
  const fit = () => ui.getState().set({ fitRequest: ui.getState().fitRequest + 1 });
  const copyKey = (k: string) => document.dispatchEvent(new KeyboardEvent("keydown", { key: k, ctrlKey: true, bubbles: true }));

  type Item = { label: string; kbd?: string; run: () => void; disabled?: boolean; checked?: boolean } | "sep";
  const MENUS: Record<string, Item[]> = {
    File: [
      { label: "Your designs", run: () => { location.href = "/dashboard"; } },
      "sep",
      { label: "Save a version…", run: () => setDialog("versions") },
      { label: "Version history", run: () => setDialog("versions") },
      "sep",
      { label: "Export…", kbd: `${mod}E`, run: () => setDialog("export") },
    ],
    Edit: [
      { label: "Undo", kbd: `${mod}Z`, run: () => s().undo(), disabled: !canUndo },
      { label: "Redo", kbd: `${mod}⇧Z`, run: () => s().redo(), disabled: !canRedo },
      "sep",
      { label: "Duplicate", kbd: `${mod}D`, disabled: !hasSel, run: () => { let ids: string[] = []; s().changePage("Duplicate", (p) => { ids = duplicateNodes(p as Page, sel()); }); s().select(ids); } },
      { label: "Delete", kbd: "Del", disabled: !hasSel, run: () => s().changePage("Delete", (p) => removeNodes(p as Page, sel())) },
      { label: "Select all", kbd: `${mod}A`, run: () => s().select(activePage(s()).children.filter((n) => !n.locked && n.visible).map((n) => n.id)) },
      { label: "Deselect", kbd: "Esc", run: () => s().select([]) },
      "sep",
      { label: "Copy", kbd: `${mod}C`, run: () => copyKey("c"), disabled: !hasSel },
    ],
    View: [
      { label: "Zoom in", kbd: `${mod}+`, run: () => setZoom(zoom * 1.25) },
      { label: "Zoom out", kbd: `${mod}−`, run: () => setZoom(zoom / 1.25) },
      { label: "Zoom to fit", kbd: `${mod}0`, run: fit },
      { label: "Actual size (100%)", run: () => setZoom(1) },
      "sep",
      { label: "Rulers", checked: showRulers && pro, run: () => ui.getState().set({ showRulers: !showRulers, pro: true }) },
      { label: "Grid", checked: showGrid, run: () => ui.getState().set({ showGrid: !showGrid }) },
      "sep",
      { label: "Advanced controls", checked: pro, run: () => setPro(!pro) },
    ],
    Arrange: [
      { label: "Bring to front", kbd: `${mod}⇧]`, disabled: !hasSel, run: () => s().changePage("Bring to front", (p) => reorder(p as Page, sel(), "front")) },
      { label: "Bring forward", kbd: `${mod}]`, disabled: !hasSel, run: () => s().changePage("Bring forward", (p) => reorder(p as Page, sel(), "forward")) },
      { label: "Send backward", kbd: `${mod}[`, disabled: !hasSel, run: () => s().changePage("Send backward", (p) => reorder(p as Page, sel(), "backward")) },
      { label: "Send to back", kbd: `${mod}⇧[`, disabled: !hasSel, run: () => s().changePage("Send to back", (p) => reorder(p as Page, sel(), "back")) },
      "sep",
      { label: "Group", kbd: `${mod}G`, disabled: sel().length < 2, run: () => { let g: string | null = null; s().changePage("Group", (p) => { g = groupNodes(p as Page, sel()); }); if (g) s().select([g]); } },
      { label: "Ungroup", kbd: `${mod}⇧G`, disabled: !hasSel, run: () => { const out: string[] = []; s().changePage("Ungroup", (p) => { for (const id of sel()) out.push(...ungroup(p as Page, id)); }); if (out.length) s().select(out); } },
    ],
  };

  return (
    <header className="h-11 shrink-0 flex items-center gap-1 px-1.5 bg-surface border-b border-line" onMouseLeave={() => undefined}>
      <Link href="/dashboard" className="btn btn-ghost btn-icon" aria-label="Back to your designs" title="Your designs"><ChevronLeft size={18} /></Link>
      <div className="hidden lg:flex items-center" role="menubar" aria-label="Main menu">
        {Object.keys(MENUS).map((m) => (
          <MenuButton key={m} name={m} open={menu === m} onOpen={(o) => setMenu(o ? m : null)} hoverSwitch={menu !== null} items={MENUS[m]} />
        ))}
      </div>
      <div className="w-px h-5 bg-line mx-1 hidden lg:block" />
      <input key={title} defaultValue={title} aria-label="Design title" className="input !bg-transparent hover:!bg-surface-2 h-8 w-32 sm:w-48 font-medium"
        onBlur={(e) => { const v = e.target.value.trim(); if (v && v !== title) onRename(v); else e.target.value = title; }}
        onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); e.stopPropagation(); }} />
      <SaveBadge status={status} errorText={errorText} onReload={onReloadLatest} />

      <div className="flex-1 flex justify-center min-w-0">
        <div className="hidden md:flex items-center gap-0.5 rounded-lg bg-surface-2 p-0.5" role="toolbar" aria-label="Tools">
          {TOOLS.map((t) => (
            <button key={t.id} className="tool" aria-pressed={tool === t.id} aria-label={`${t.label} tool`} title={`${t.label} (${t.key})`}
              onClick={() => ui.getState().set({ tool: t.id, editingPathId: null })}><t.icon size={16} /></button>
          ))}
        </div>
      </div>

      <button className="btn btn-ghost btn-icon" disabled={!canUndo} onClick={() => s().undo()} title={`Undo (${mod}Z)`} aria-label="Undo"><Undo2 size={16} /></button>
      <button className="btn btn-ghost btn-icon" disabled={!canRedo} onClick={() => s().redo()} title={`Redo (${mod}⇧Z)`} aria-label="Redo"><Redo2 size={16} /></button>
      <ZoomMenu zoom={zoom} setZoom={setZoom} fit={fit} />
      <button className="btn btn-ghost btn-icon" onClick={() => setDialog("versions")} title="Version history" aria-label="Version history"><History size={16} /></button>
      <ThemeToggle />
      <button className="btn btn-primary ml-1" onClick={() => setDialog("export")}><Download size={15} /> <span className="hidden sm:inline">Export</span></button>
      {dialog === "export" && <ExportDialog title={title} onClose={() => setDialog(null)} />}
      {dialog === "versions" && <VersionsDialog onClose={() => setDialog(null)} onRestored={(d, r) => { setDialog(null); onRestored(d, r); }} />}
    </header>
  );
}

function useOutside(open: boolean, close: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) close(); };
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
    window.addEventListener("mousedown", h); window.addEventListener("keydown", k);
    return () => { window.removeEventListener("mousedown", h); window.removeEventListener("keydown", k); };
  }, [open, close]);
  return ref;
}

function MenuButton({ name, open, onOpen, hoverSwitch, items }: { name: string; open: boolean; onOpen: (o: boolean) => void; hoverSwitch: boolean; items: ({ label: string; kbd?: string; run: () => void; disabled?: boolean; checked?: boolean } | "sep")[] }) {
  const ref = useOutside(open, () => onOpen(false));
  return (
    <div ref={ref} className="relative">
      <button className={`h-8 px-2.5 rounded-md text-[12.5px] ${open ? "bg-surface-2" : "hover:bg-surface-2"}`} role="menuitem" aria-haspopup="menu" aria-expanded={open}
        onClick={() => onOpen(!open)} onMouseEnter={() => { if (hoverSwitch && !open) onOpen(true); }}>{name}</button>
      {open && (
        <div className="menu absolute left-0 top-9 z-50" role="menu" aria-label={name}>
          {items.map((it, i) => it === "sep" ? <div key={i} className="menu-sep" /> : (
            <button key={it.label} className="menu-item" role="menuitem" disabled={it.disabled} onClick={() => { onOpen(false); it.run(); }}>
              <span className="flex items-center gap-2"><span className="w-3">{it.checked ? <Check size={12} /> : null}</span>{it.label}</span>
              {it.kbd && <span className="kbd">{it.kbd}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function ZoomMenu({ zoom, setZoom, fit }: { zoom: number; setZoom: (z: number) => void; fit: () => void }) {
  const [open, setOpen] = useState(false);
  const ref = useOutside(open, () => setOpen(false));
  return (
    <div ref={ref} className="relative hidden md:block">
      <button className="btn btn-ghost px-2 tabular-nums w-[4.5rem] justify-between" onClick={() => setOpen(!open)} aria-label="Zoom" aria-expanded={open}>{Math.round(zoom * 100)}% <ChevronDown size={12} /></button>
      {open && (
        <div className="menu absolute right-0 top-9 z-50" role="menu">
          {[["Zoom in", () => setZoom(zoom * 1.25)], ["Zoom out", () => setZoom(zoom / 1.25)], ["Zoom to fit", fit]].map(([l, f]) => (
            <button key={l as string} className="menu-item" role="menuitem" onClick={() => { setOpen(false); (f as () => void)(); }}>{l as string}</button>
          ))}
          <div className="menu-sep" />
          {[0.25, 0.5, 1, 2, 4].map((z) => <button key={z} className="menu-item" role="menuitem" onClick={() => { setOpen(false); setZoom(z); }}>{z * 100}%</button>)}
        </div>
      )}
    </div>
  );
}

function SaveBadge({ status, errorText, onReload }: { status: SaveStatus; errorText: string | null; onReload: () => void }) {
  const base = "hidden sm:flex items-center gap-1 text-[11.5px] ml-1 whitespace-nowrap";
  if (status === "saved") return <span className={`${base} text-muted`} role="status"><Check size={13} /> Saved</span>;
  if (status === "saving" || status === "unsaved") return <span className={`${base} text-muted`} role="status"><Loader2 size={13} className="animate-spin" /> Saving…</span>;
  if (status === "offline") return <span className={`${base} text-danger`} role="status"><CloudOff size={13} /> Offline, will retry</span>;
  if (status === "conflict") return (
    <span className="flex items-center gap-1 text-[11.5px] text-danger ml-1" role="alert">
      <AlertTriangle size={13} /> Changed in another tab. <button className="underline" onClick={onReload}>Load latest</button>
    </span>
  );
  return <span className={`${base} text-danger`} role="alert"><AlertTriangle size={13} /> {errorText ?? "Not saved"}</span>;
}
