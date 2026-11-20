"use client";
import { Plus, Trash2, Upload, X } from "lucide-react";
import { useRef, useState } from "react";
import { make } from "@/lib/doc/factory";
import { locate } from "@/lib/doc/geometry";
import type { FontRef, Page, TextNode } from "@/lib/doc/types";
import { nearestWeight, registerFont } from "@/lib/fonts";
import { fitText, useEditorCtx, useUi, type BrandKit } from "./context";
import { FontPicker } from "./FontPicker";
import { uploadImage, useAddImage } from "./useUploads";

type Role = "heading" | "subheading" | "body";
const ROLE_LABEL: Record<Role, string> = { heading: "Heading", subheading: "Subheading", body: "Body text" };
const ROLE_SIZE: Record<Role, number> = { heading: 96, subheading: 56, body: 32 };

export function BrandPanel() {
  const { store, ui } = useEditorCtx();
  const kits = useUi((s) => s.brandKits);
  const [kitId, setKitId] = useState<string | null>(null);
  const [picker, setPicker] = useState<Role | null>(null);
  const [error, setError] = useState<string | null>(null);
  const logoInput = useRef<HTMLInputElement>(null);
  const addImage = useAddImage();
  const kit = kits?.find((k) => k.id === kitId) ?? kits?.[0] ?? null;

  const setKits = (fn: (ks: BrandKit[]) => BrandKit[]) => ui.getState().set({ brandKits: fn(ui.getState().brandKits ?? []) });
  async function save(patch: Partial<BrandKit>) {
    if (!kit) return;
    setKits((ks) => ks.map((k) => (k.id === kit.id ? { ...k, ...patch } : k)));
    const r = await fetch(`/api/brand-kits/${kit.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(patch) });
    if (!r.ok) setError((await r.json().catch(() => ({}))).error ?? "Could not save the brand kit");
  }
  async function createKit() {
    const name = prompt("Brand name", kits?.length ? "New brand" : "My brand");
    if (!name?.trim()) return;
    const r = await fetch("/api/brand-kits", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: name.trim(), colors: ["#111827", "#ffffff"] }) });
    if (!r.ok) return setError("Could not create the brand kit");
    const k = await r.json();
    setKits((ks) => [k, ...ks]);
    setKitId(k.id);
  }
  async function deleteKit() {
    if (!kit || !confirm(`Delete the brand kit "${kit.name}"? Designs keep their colours and fonts.`)) return;
    if ((await fetch(`/api/brand-kits/${kit.id}`, { method: "DELETE" })).ok) { setKits((ks) => ks.filter((k) => k.id !== kit.id)); setKitId(null); }
  }

  /** Brand colour -> fill of the selection (text colour for text); page background if nothing is selected. */
  function applyColour(c: string) {
    const s = store.getState();
    if (!s.selection.length) { s.changePage("Background colour", (p) => { p.background = { type: "solid", color: c }; }); return; }
    s.changePage("Brand colour", (p) => {
      for (const id of s.selection) {
        const n = locate(p as Page, id)?.node;
        if (!n) continue;
        if (n.type === "line") n.stroke.color = c;
        else if ("fill" in n) n.fill = { type: "solid", color: c };
      }
    });
  }

  async function ensureFont(f: BrandKit["fonts"][number]) {
    if (f.ref) await registerFont(f.ref);
    await document.fonts.load(`${nearestWeight(f.family, f.weight)} 32px "${f.family}"`, "Aa").catch(() => {});
  }
  function withFontRef(d: { fonts?: FontRef[] }, ref?: FontRef) {
    if (!ref) return;
    d.fonts ??= [];
    if (!d.fonts.some((x) => x.family === ref.family && x.source === ref.source)) d.fonts.push(ref);
  }
  /** Add a text box in the brand font, or restyle the selected text. */
  async function applyBrandFont(role: Role) {
    const f = kit?.fonts.find((x) => x.role === role);
    if (!f) return setPicker(role);
    await ensureFont(f);
    const s = store.getState();
    const selectedText = s.selection.filter((id) => locate(s.page(), id)?.node.type === "text");
    s.change(`${ROLE_LABEL[role]} font`, (d) => {
      withFontRef(d, f.ref);
      const page = d.pages.find((p) => p.id === s.pageId)!;
      if (selectedText.length) {
        for (const id of selectedText) {
          const n = locate(page as Page, id)?.node as TextNode;
          n.fontFamily = f.family; n.fontWeight = nearestWeight(f.family, f.weight); fitText(n);
        }
      } else {
        const W = d.width;
        const n = make.text(0, 0, ROLE_LABEL[role], Math.round(ROLE_SIZE[role] * (W / 1080)), Math.round(W * 0.7));
        n.fontFamily = f.family; n.fontWeight = nearestWeight(f.family, f.weight);
        fitText(n);
        n.x = Math.round(W / 2 - n.width / 2); n.y = Math.round(d.height / 2 - n.height / 2);
        page.children.push(n);
        setTimeout(() => store.getState().select([n.id]));
      }
    });
  }

  if (kits === null) return <p className="text-sm text-muted">Loading…</p>;
  if (!kit) return (
    <div className="space-y-3">
      <p className="text-sm text-muted">Save your brand colours, fonts and logos once, then use them in every design with one click.</p>
      <button className="btn btn-primary w-full" onClick={createKit}><Plus size={16} /> Create a brand kit</button>
      {error && <p role="alert" className="text-xs text-danger">{error}</p>}
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <select className="input" value={kit.id} onChange={(e) => setKitId(e.target.value)} aria-label="Brand kit">
          {kits.map((k) => <option key={k.id} value={k.id}>{k.name}</option>)}
        </select>
        <button className="btn btn-icon" onClick={createKit} aria-label="New brand kit" title="New brand kit"><Plus size={16} /></button>
        <button className="btn btn-icon btn-danger" onClick={deleteKit} aria-label="Delete brand kit" title="Delete brand kit"><Trash2 size={16} /></button>
      </div>
      {error && <p role="alert" className="text-xs text-danger">{error}</p>}

      <section className="space-y-2">
        <div className="label">Colours</div>
        <div className="flex flex-wrap gap-2">
          {kit.colors.map((c, i) => (
            <div key={`${c}-${i}`} className="relative group">
              <button className="size-9 rounded-lg border border-line" style={{ background: c }} aria-label={`Apply brand colour ${c}`} title={`${c}: click to apply`} onClick={() => applyColour(c)} />
              <button className="absolute -top-1.5 -right-1.5 size-4 rounded-full bg-surface border border-line grid place-items-center opacity-0 group-hover:opacity-100 focus:opacity-100" aria-label={`Remove ${c}`} onClick={() => save({ colors: kit.colors.filter((_, j) => j !== i) })}><X size={10} /></button>
            </div>
          ))}
          <label className="size-9 rounded-lg border border-dashed border-line grid place-items-center cursor-pointer text-muted hover:text-ink" title="Add a colour">
            <Plus size={16} />
            <input type="color" className="sr-only" aria-label="Add brand colour" onChange={(e) => save({ colors: [...kit.colors, e.target.value] })} />
          </label>
        </div>
        <p className="text-xs text-muted">Click a colour to apply it to the selection (or the page background when nothing is selected). Brand colours also appear in every colour picker.</p>
      </section>

      <section className="space-y-2">
        <div className="label">Fonts</div>
        {(["heading", "subheading", "body"] as Role[]).map((role) => {
          const f = kit.fonts.find((x) => x.role === role);
          return (
            <div key={role} className="flex items-center gap-2">
              <button className="flex-1 text-start rounded-lg bg-surface-2 hover:bg-accent-soft px-3 py-2 min-w-0" onClick={() => applyBrandFont(role)} title={f ? "Click to add (or restyle selected text)" : "Choose a font"}>
                <div className="text-xs text-muted">{ROLE_LABEL[role]}</div>
                <div className="truncate" style={{ fontFamily: f ? `"${f.family}"` : undefined, fontWeight: f?.weight }}>{f ? f.family : "Choose font"}</div>
              </button>
              <button className="btn btn-ghost btn-icon" aria-label={`Change ${ROLE_LABEL[role]} font`} onClick={() => setPicker(role)}>…</button>
            </div>
          );
        })}
      </section>
      {picker && (
        <FontPicker current={kit.fonts.find((x) => x.role === picker)?.family ?? ""} onClose={() => setPicker(null)}
          onPick={(family, refs) => {
            const weight = picker === "body" ? 400 : picker === "subheading" ? 600 : 700;
            save({ fonts: [...kit.fonts.filter((x) => x.role !== picker), { role: picker, family, weight: nearestWeight(family, weight), ref: refs.find((r) => r.source === "google") ?? refs[0] }] });
          }} />
      )}

      <section className="space-y-2">
        <div className="flex items-center justify-between"><div className="label">Logos</div>
          <button className="btn h-7 px-2 text-xs" onClick={() => logoInput.current?.click()}><Upload size={13} /> Upload</button></div>
        <input ref={logoInput} type="file" hidden accept="image/png,image/jpeg,image/webp,image/gif" onChange={async (e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (!file) return;
          try {
            const a = await uploadImage(file);
            await save({ logos: [...kit.logos, { assetId: a.id, width: a.width, height: a.height, name: file.name }] });
          } catch (err) { setError((err as Error).message); }
        }} />
        {kit.logos.length === 0 ? <p className="text-xs text-muted">Upload your logo (PNG with a transparent background works best).</p> : (
          <div className="grid grid-cols-3 gap-2">
            {kit.logos.map((l, i) => (
              <div key={l.assetId} className="relative group">
                <button className="aspect-square w-full rounded-lg bg-surface-2 p-2 grid place-items-center hover:ring-2 ring-accent" aria-label={`Add logo ${l.name}`}
                  onClick={() => addImage({ id: l.assetId, url: `/api/assets/${l.assetId}`, width: l.width, height: l.height })}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={`/api/assets/${l.assetId}`} alt={l.name} className="max-w-full max-h-full" />
                </button>
                <button className="absolute top-1 right-1 size-5 rounded-full bg-surface border border-line grid place-items-center opacity-0 group-hover:opacity-100 focus:opacity-100" aria-label={`Remove logo ${l.name}`} onClick={() => save({ logos: kit.logos.filter((_, j) => j !== i) })}><X size={11} /></button>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
