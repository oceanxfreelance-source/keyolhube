"use client";
import { ArrowDown, ArrowUp, ChevronDown, ChevronRight, Copy, Eye, EyeOff, FileText, Layers, Lock, Plus, Shapes, Trash2, Type, Unlock, Upload, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { make, newId, newPage } from "@/lib/doc/factory";
import { locate } from "@/lib/doc/geometry";
import { cloneWithNewIds } from "@/lib/doc/ops";
import type { DesignNode, TextNode } from "@/lib/doc/types";
import { polyPoints } from "@/lib/editor/render";
import { activePage, fitText, type LeftTab, useEd, useEditorCtx, useUi } from "./context";
import { uploadImage, useAddImage, type UploadedAsset } from "./useUploads";

const TABS: { id: LeftTab; label: string; icon: React.ComponentType<{ size?: number }> }[] = [
  { id: "elements", label: "Elements", icon: Shapes },
  { id: "text", label: "Text", icon: Type },
  { id: "uploads", label: "Uploads", icon: Upload },
  { id: "pages", label: "Pages", icon: FileText },
  { id: "layers", label: "Layers", icon: Layers },
];

export function LeftRail() {
  const tab = useUi((s) => s.leftTab);
  const set = useUi((s) => s.set);
  return (
    <nav className="max-md:order-3 flex md:flex-col gap-1 p-1.5 bg-surface border-line md:border-r max-md:border-t max-md:justify-around shrink-0" aria-label="Editor panels">
      {TABS.map((t) => (
        <button key={t.id} onClick={() => set({ leftTab: tab === t.id ? null : t.id })} aria-pressed={tab === t.id}
          className={`flex flex-col items-center gap-0.5 rounded-lg px-2 py-1.5 text-[11px] font-medium w-16 ${tab === t.id ? "bg-accent-soft text-accent" : "text-muted hover:text-ink hover:bg-surface-2"}`}>
          <t.icon size={20} />
          {t.label}
        </button>
      ))}
    </nav>
  );
}

export function LeftPanel() {
  const tab = useUi((s) => s.leftTab);
  const set = useUi((s) => s.set);
  if (!tab) return null;
  return (
    <aside className="max-md:order-2 w-full md:w-72 shrink-0 bg-surface border-line md:border-r max-md:border-t max-md:max-h-[40dvh] overflow-y-auto" aria-label={tab}>
      <div className="flex items-center justify-between px-4 pt-3 pb-1">
        <h2 className="font-semibold capitalize">{tab}</h2>
        <button className="btn btn-ghost btn-icon" onClick={() => set({ leftTab: null })} aria-label="Close panel"><X size={16} /></button>
      </div>
      <div className="p-4 pt-2">
        {tab === "elements" && <ElementsTab />}
        {tab === "text" && <TextTab />}
        {tab === "uploads" && <UploadsTab />}
        {tab === "pages" && <PagesTab />}
        {tab === "layers" && <LayersTab />}
      </div>
    </aside>
  );
}

function useAdd() {
  const { store } = useEditorCtx();
  return (n: DesignNode) => {
    const s = store.getState();
    const { width: W, height: H } = s.doc;
    n.x = Math.round(W / 2 - n.width / 2);
    n.y = Math.round(H / 2 - n.height / 2);
    s.changePage(`Add ${n.name.toLowerCase()}`, (p) => { p.children.push(n); });
    s.select([n.id]);
  };
}

function ElementsTab() {
  const add = useAdd();
  const W = useEd((s) => s.doc.width), H = useEd((s) => s.doc.height);
  const u = Math.round(Math.min(W, H) * 0.3);
  const items: { label: string; make: () => DesignNode; preview: React.ReactNode }[] = [
    { label: "Square", make: () => make.rect(0, 0, u, u), preview: <rect x="6" y="6" width="36" height="36" fill="#3b82f6" /> },
    { label: "Rounded", make: () => ({ ...make.rect(0, 0, u, u), cornerRadius: Math.round(u * 0.15), name: "Rounded rectangle" }), preview: <rect x="6" y="6" width="36" height="36" rx="7" fill="#6366f1" /> },
    { label: "Circle", make: () => make.ellipse(0, 0, u, u), preview: <circle cx="24" cy="24" r="18" fill="#f59e0b" /> },
    { label: "Triangle", make: () => make.polygon(0, 0, u, 3), preview: <polygon points={pts("polygon", 3)} fill="#10b981" /> },
    { label: "Hexagon", make: () => ({ ...make.polygon(0, 0, u, 6, "#14b8a6"), name: "Hexagon" }), preview: <polygon points={pts("polygon", 6)} fill="#14b8a6" /> },
    { label: "Star", make: () => make.star(0, 0, u), preview: <polygon points={pts("star", 5)} fill="#ef4444" /> },
    { label: "Line", make: () => make.line(0, 0, u * 1.5), preview: <line x1="6" y1="24" x2="42" y2="24" stroke="currentColor" strokeWidth="3" strokeLinecap="round" /> },
    {
      label: "Arrow", make: () => ({ ...make.line(0, 0, u * 1.5), arrowEnd: true, name: "Arrow" }),
      preview: <g stroke="currentColor" strokeWidth="3" strokeLinecap="round" fill="none"><line x1="6" y1="24" x2="40" y2="24" /><polyline points="31,16 40,24 31,32" /></g>,
    },
  ];
  return (
    <div className="space-y-4">
      <div>
        <div className="label mb-2">Shapes</div>
        <div className="grid grid-cols-4 gap-2">
          {items.map((it) => (
            <button key={it.label} onClick={() => add(it.make())} title={it.label} aria-label={`Add ${it.label}`}
              className="aspect-square rounded-lg bg-surface-2 hover:bg-accent-soft grid place-items-center">
              <svg viewBox="0 0 48 48" className="w-9 h-9">{it.preview}</svg>
            </button>
          ))}
        </div>
      </div>
      <p className="text-xs text-muted">Tip: drop image files straight onto the page, or paste them with Ctrl/⌘+V.</p>
    </div>
  );
}

const pts = (k: "polygon" | "star", n: number) => {
  const p = polyPoints(k, n, 36, 36, 0.45);
  return p.map((v) => v + 6).join(",");
};

function TextTab() {
  const add = useAdd();
  const W = useEd((s) => s.doc.width);
  const base = W / 1080; // scale presets to the design size
  const t = (text: string, size: number, weight: TextNode["fontWeight"], font = "Inter", align: TextNode["align"] = "left") => {
    const n = make.text(0, 0, text, Math.round(size * base), Math.round(W * 0.7));
    n.fontWeight = weight; n.fontFamily = font; n.align = align;
    n.name = text.slice(0, 30);
    fitText(n);
    return n;
  };
  const presets = [
    { label: "Add a heading", cls: "text-2xl font-bold", make: () => t("Add a heading", 96, 700) },
    { label: "Add a subheading", cls: "text-lg font-semibold", make: () => t("Add a subheading", 56, 600) },
    { label: "Add body text", cls: "text-sm", make: () => t("Add a little bit of body text", 32, 400) },
    { label: "ދިވެހި ސުރުޚީ", cls: "text-2xl font-bold thaana", dir: "rtl" as const, make: () => t("ދިވެހި ސުރުޚީ", 96, 700, "Noto Sans Thaana", "right") },
    { label: "ދިވެހި ލިޔުން", cls: "text-sm thaana", dir: "rtl" as const, make: () => t("މިތާ ދިވެހި ލިޔުން ލިޔޭ", 36, 400, "Noto Sans Thaana", "right") },
  ];
  return (
    <div className="space-y-2">
      {presets.map((p) => (
        <button key={p.label} onClick={() => add(p.make())} dir={p.dir} className={`w-full text-start rounded-lg bg-surface-2 hover:bg-accent-soft px-3 py-3 ${p.cls}`}>
          {p.label}
        </button>
      ))}
      <p className="text-xs text-muted pt-2">Dhivehi text uses Noto Sans Thaana and flows right to left automatically. Mixed Dhivehi and English works in any font.</p>
    </div>
  );
}

function UploadsTab() {
  const [assets, setAssets] = useState<(UploadedAsset & { filename?: string | null })[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const add = useAddImage();
  useEffect(() => {
    fetch("/api/assets").then((r) => r.json()).then((b) => setAssets(b.assets.map((a: { id: string; width: number; height: number; filename: string | null }) => ({ ...a, url: `/api/assets/${a.id}` })))).catch(() => setAssets([]));
  }, []);
  async function onFiles(files: FileList | null) {
    if (!files?.length) return;
    setBusy(true);
    setError(null);
    for (const f of [...files]) {
      try {
        const a = await uploadImage(f);
        setAssets((as) => [{ ...a, filename: f.name }, ...(as ?? [])]);
        add(a);
      } catch (e) {
        setError(`${f.name}: ${(e as Error).message}`);
      }
    }
    setBusy(false);
    if (input.current) input.current.value = "";
  }
  return (
    <div className="space-y-3">
      <input ref={input} type="file" accept="image/png,image/jpeg,image/webp,image/gif" multiple hidden onChange={(e) => onFiles(e.target.files)} data-testid="upload-input" />
      <button className="btn btn-primary w-full" disabled={busy} onClick={() => input.current?.click()}><Upload size={16} /> {busy ? "Uploading…" : "Upload images"}</button>
      <p className="text-xs text-muted">PNG, JPEG, WebP or GIF, up to 15 MB. Original quality is kept for print.</p>
      {error && <p role="alert" className="text-xs text-danger">{error}</p>}
      {assets === null ? <p className="text-sm text-muted">Loading…</p> : (
        <div className="grid grid-cols-2 gap-2">
          {assets.map((a) => (
            <button key={a.id} onClick={() => add(a)} className="aspect-square rounded-lg bg-surface-2 overflow-hidden hover:ring-2 ring-accent" title={a.filename ?? "Image"}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={a.url} alt={a.filename ?? ""} className="w-full h-full object-cover" loading="lazy" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function PagesTab() {
  const { store } = useEditorCtx();
  const pages = useEd((s) => s.doc.pages);
  const pageId = useEd((s) => s.pageId);
  const s = () => store.getState();
  const addPage = () => {
    const p = newPage(`Page ${pages.length + 1}`);
    s().change("Add page", (d) => { const i = d.pages.findIndex((x) => x.id === pageId); d.pages.splice(i + 1, 0, p); });
    s().setPage(p.id);
  };
  return (
    <div className="space-y-2">
      {pages.map((p, i) => (
        <div key={p.id} className={`flex items-center gap-1 rounded-lg px-2 py-1.5 ${p.id === pageId ? "bg-accent-soft" : "hover:bg-surface-2"}`}>
          <button className="flex-1 text-start text-sm truncate" onClick={() => s().setPage(p.id)} aria-current={p.id === pageId}>
            <span className="text-muted mr-2">{i + 1}</span>{p.name}
          </button>
          <button className="btn btn-ghost btn-icon size-7" title="Move up" aria-label={`Move ${p.name} up`} disabled={i === 0}
            onClick={() => s().change("Reorder pages", (d) => { const [x] = d.pages.splice(i, 1); d.pages.splice(i - 1, 0, x); })}><ArrowUp size={14} /></button>
          <button className="btn btn-ghost btn-icon size-7" title="Move down" aria-label={`Move ${p.name} down`} disabled={i === pages.length - 1}
            onClick={() => s().change("Reorder pages", (d) => { const [x] = d.pages.splice(i, 1); d.pages.splice(i + 1, 0, x); })}><ArrowDown size={14} /></button>
          <button className="btn btn-ghost btn-icon size-7" title="Duplicate page" aria-label={`Duplicate ${p.name}`}
            onClick={() => {
              const copy = { ...structuredClone(p), id: newId(), name: `${p.name} copy`, children: p.children.map((c) => cloneWithNewIds(c)) };
              s().change("Duplicate page", (d) => { d.pages.splice(i + 1, 0, copy); });
              s().setPage(copy.id);
            }}><Copy size={14} /></button>
          <button className="btn btn-ghost btn-icon size-7 btn-danger" title="Delete page" aria-label={`Delete ${p.name}`} disabled={pages.length === 1}
            onClick={() => s().change("Delete page", (d) => { d.pages.splice(i, 1); })}><Trash2 size={14} /></button>
        </div>
      ))}
      <button className="btn w-full" onClick={addPage}><Plus size={16} /> Add page</button>
    </div>
  );
}

function LayersTab() {
  const page = useEd(activePage);
  return page.children.length === 0 ? <p className="text-sm text-muted">Nothing on this page yet.</p> : (
    <ul className="space-y-0.5" role="tree" aria-label="Layers">
      {[...page.children].reverse().map((n) => <LayerRow key={n.id} node={n} depth={0} />)}
    </ul>
  );
}

function LayerRow({ node, depth }: { node: DesignNode; depth: number }) {
  const { store } = useEditorCtx();
  const selected = useEd((s) => s.selection.includes(node.id));
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const toggle = (key: "visible" | "locked") =>
    store.getState().changePage(key === "visible" ? "Show/hide" : "Lock/unlock", (p) => { const n = locate(p as never, node.id)?.node; if (n) n[key] = !n[key]; });
  const move = (dir: "forward" | "backward") => store.getState().changePage("Reorder", (p) => {
    const l = locate(p as never, node.id);
    if (!l) return;
    const j = dir === "forward" ? l.index + 1 : l.index - 1;
    if (j < 0 || j >= l.list.length) return;
    [l.list[l.index], l.list[j]] = [l.list[j], l.list[l.index]];
  });
  return (
    <li role="treeitem" aria-selected={selected} aria-expanded={node.type === "group" ? open : undefined}>
      <div className={`group flex items-center gap-1 rounded-md pr-1 text-sm ${selected ? "bg-accent-soft" : "hover:bg-surface-2"}`} style={{ paddingLeft: 4 + depth * 14 }}>
        {node.type === "group" ? (
          <button className="size-5 grid place-items-center text-muted" onClick={() => setOpen(!open)} aria-label={open ? "Collapse" : "Expand"}>{open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}</button>
        ) : <span className="size-5" />}
        {editing ? (
          <input autoFocus defaultValue={node.name} className="input h-7 flex-1" aria-label="Layer name"
            onBlur={(e) => { const v = e.target.value.trim(); setEditing(false); if (v && v !== node.name) store.getState().changePage("Rename layer", (p) => { const n = locate(p as never, node.id)?.node; if (n) n.name = v.slice(0, 200); }); }}
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === "Escape") (e.target as HTMLInputElement).blur(); e.stopPropagation(); }} />
        ) : (
          <button className={`flex-1 text-start truncate py-1.5 ${node.visible ? "" : "opacity-50"}`} onClick={(e) => {
            const s = store.getState();
            s.select(e.shiftKey ? (s.selection.includes(node.id) ? s.selection.filter((x) => x !== node.id) : [...s.selection, node.id]) : [node.id]);
          }} onDoubleClick={() => setEditing(true)} dir="auto">{node.name}</button>
        )}
        <button className="btn btn-ghost btn-icon size-6 opacity-0 group-hover:opacity-100 focus:opacity-100" onClick={() => move("forward")} aria-label={`Bring ${node.name} forward`}><ArrowUp size={13} /></button>
        <button className="btn btn-ghost btn-icon size-6 opacity-0 group-hover:opacity-100 focus:opacity-100" onClick={() => move("backward")} aria-label={`Send ${node.name} backward`}><ArrowDown size={13} /></button>
        <button className={`btn btn-ghost btn-icon size-6 ${node.locked ? "" : "opacity-0 group-hover:opacity-100 focus:opacity-100"}`} onClick={() => toggle("locked")} aria-label={node.locked ? `Unlock ${node.name}` : `Lock ${node.name}`}>{node.locked ? <Lock size={13} /> : <Unlock size={13} />}</button>
        <button className={`btn btn-ghost btn-icon size-6 ${node.visible ? "opacity-0 group-hover:opacity-100 focus:opacity-100" : ""}`} onClick={() => toggle("visible")} aria-label={node.visible ? `Hide ${node.name}` : `Show ${node.name}`}>{node.visible ? <Eye size={13} /> : <EyeOff size={13} />}</button>
      </div>
      {node.type === "group" && open && (
        <ul role="group">{[...node.children].reverse().map((c) => <LayerRow key={c.id} node={c} depth={depth + 1} />)}</ul>
      )}
    </li>
  );
}
