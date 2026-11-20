"use client";
import { Search, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { DesignDoc } from "@/lib/doc/types";
import { BUILTIN_TEMPLATES, TEMPLATE_CATEGORIES } from "@/lib/templates/builtin";
import { pagesForSize } from "@/lib/templates/instantiate";
import { useTemplateThumbs } from "@/components/templates/useTemplateThumbs";
import { activePage, useEditorCtx } from "./context";

type Mine = { id: string; title: string; category: string; doc: DesignDoc; thumbnailAssetId: string | null };

export function TemplatesPanel() {
  const { store, ui, project } = useEditorCtx();
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("All");
  const [mine, setMine] = useState<Mine[] | null>(null);
  const [saving, setSaving] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const thumbs = useTemplateThumbs();
  useEffect(() => { fetch("/api/templates").then((r) => r.json()).then((b) => setMine(b.templates)).catch(() => setMine([])); }, []);

  const needle = q.trim().toLowerCase();
  const builtins = useMemo(() => BUILTIN_TEMPLATES.filter((t) => (cat === "All" || t.category === cat) &&
    (!needle || t.title.toLowerCase().includes(needle) || t.tags.some((g) => g.toLowerCase().includes(needle)))), [cat, needle]);
  const myList = (mine ?? []).filter((t) => (cat === "All" || cat === "My templates") && (!needle || t.title.toLowerCase().includes(needle)));

  /** Apply: an empty page is replaced; otherwise the template is added as new page(s) after it. */
  function apply(doc: DesignDoc) {
    const s = store.getState();
    const pages = pagesForSize(doc, s.doc.width, s.doc.height);
    const cur = activePage(s);
    const empty = cur.children.length === 0;
    s.change("Use template", (d) => {
      d.fonts ??= [];
      for (const f of doc.fonts ?? []) if (!d.fonts.some((x) => x.family === f.family && x.source === f.source)) d.fonts.push(f);
      const i = d.pages.findIndex((p) => p.id === cur.id);
      if (empty) {
        d.pages[i].children = pages[0].children; d.pages[i].background = pages[0].background;
        d.pages.splice(i + 1, 0, ...pages.slice(1));
      } else d.pages.splice(i + 1, 0, ...pages);
    });
    if (!empty) s.setPage(pages[0].id);
    setNote(empty ? "Template applied. Click any text to change it." : "Added as a new page (this page already had content).");
  }

  async function saveAsTemplate() {
    const title = prompt("Template name", project.title);
    if (!title?.trim()) return;
    setSaving(true);
    await ui.getState().saveNow?.(); // the template copies the latest saved state
    const r = await fetch("/api/templates", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ projectId: project.id, title: title.trim() }) });
    setSaving(false);
    if (!r.ok) return setNote("Could not save the template");
    setNote("Saved to My templates.");
    fetch("/api/templates").then((x) => x.json()).then((b) => setMine(b.templates));
  }
  async function removeMine(t: Mine) {
    if (!confirm(`Delete the template "${t.title}"?`)) return;
    if ((await fetch(`/api/templates/${t.id}`, { method: "DELETE" })).ok) setMine((m) => m?.filter((x) => x.id !== t.id) ?? null);
  }

  return (
    <div className="space-y-3">
      <label className="relative block">
        <Search size={16} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted" />
        <input className="input pl-8" placeholder="Search templates" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.stopPropagation()} aria-label="Search templates" />
      </label>
      <div className="flex flex-wrap gap-1">
        {["All", ...TEMPLATE_CATEGORIES, "My templates"].map((c) => (
          <button key={c} className={`btn h-7 px-2 text-xs ${cat === c ? "!bg-accent-soft !text-accent !border-accent/40" : ""}`} aria-pressed={cat === c} onClick={() => setCat(c)}>{c}</button>
        ))}
      </div>
      {note && <p role="status" className="text-xs text-ok">{note}</p>}
      <div className="grid grid-cols-2 gap-2">
        {cat !== "My templates" && builtins.map((t) => (
          <button key={t.id} onClick={() => apply(t.build())} className="text-start space-y-1 group" aria-label={`Use template ${t.title}`}>
            <div className="aspect-square rounded-lg bg-surface-2 overflow-hidden grid place-items-center p-1.5 group-hover:ring-2 ring-accent">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {thumbs[t.id] ? <img src={thumbs[t.id]} alt="" className="max-w-full max-h-full shadow-sm" /> : <span className="text-xs text-muted">Loading…</span>}
            </div>
            <div className="text-xs leading-tight">{t.title}</div>
          </button>
        ))}
        {myList.map((t) => (
          <div key={t.id} className="relative group">
            <button onClick={() => apply(t.doc)} className="text-start space-y-1 w-full" aria-label={`Use template ${t.title}`}>
              <div className="aspect-square rounded-lg bg-surface-2 overflow-hidden grid place-items-center p-1.5 group-hover:ring-2 ring-accent">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {t.thumbnailAssetId ? <img src={`/api/assets/${t.thumbnailAssetId}`} alt="" className="max-w-full max-h-full" /> : <span className="text-xs text-muted">No preview</span>}
              </div>
              <div className="text-xs leading-tight">{t.title}</div>
            </button>
            <button className="btn btn-icon size-7 absolute top-1 right-1 opacity-0 group-hover:opacity-100 focus:opacity-100" aria-label={`Delete template ${t.title}`} onClick={() => removeMine(t)}><Trash2 size={13} /></button>
          </div>
        ))}
      </div>
      {builtins.length === 0 && myList.length === 0 && <p className="text-sm text-muted">No templates match.</p>}
      <button className="btn w-full" disabled={saving} onClick={saveAsTemplate}>{saving ? "Saving…" : "Save this design as a template"}</button>
      <p className="text-xs text-muted">Photo areas in templates are frames: select one and choose “Put a photo in this shape”. Dhivehi template wording is placeholder text, so check and replace it.</p>
    </div>
  );
}
