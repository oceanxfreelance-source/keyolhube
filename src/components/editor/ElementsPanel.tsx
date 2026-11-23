"use client";
import Konva from "konva";
import { Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { newDoc } from "@/lib/doc/factory";
import { bakeScale } from "@/lib/doc/ops";
import type { DesignNode } from "@/lib/doc/types";
import { CATEGORIES, ELEMENTS, iconLabel, iconSvg, loadIcons, stickerPng, STICKERS, type ElementDef } from "@/lib/elements/library";
import { measureTextHeight } from "@/lib/editor/render";
import { renderPageCanvas } from "@/lib/export/raster";
import { importSvg } from "@/lib/vector/paths";
import { STOCK, stockUrl } from "@/lib/templates/stock";
import { useEditorCtx } from "./context";
import { uploadImage, useAddImage } from "./useUploads";

const previews = new Map<string, string>();
function fit(n: DesignNode) {
  if (n.type === "text") n.height = measureTextHeight(Konva, n);
  if (n.type === "group") n.children.forEach(fit);
}
async function preview(e: ElementDef): Promise<string> {
  const hit = previews.get(e.id);
  if (hit) return hit;
  const n = e.build(80); fit(n);
  const W = Math.max(n.width, n.height) + 16;
  const d = newDoc(W, W); d.pages[0].background = { type: "none" };
  n.x = (W - n.width) / 2; n.y = (W - n.height) / 2;
  d.pages[0].children = [n];
  const { canvas } = await renderPageCanvas(d, d.pages[0], { pixelRatio: 96 / W, transparent: true });
  const url = canvas.toDataURL("image/png");
  previews.set(e.id, url);
  return url;
}

export function ElementsPanel() {
  const { store } = useEditorCtx();
  const addImage = useAddImage();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const [thumbs, setThumbs] = useState<Record<string, string>>(() => Object.fromEntries(previews));
  const [icons, setIcons] = useState<[string, ReturnType<typeof Object.values>[number]][] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    (async () => { for (const e of ELEMENTS) { if (!previews.has(e.id)) { try { await preview(e); } catch {} if (alive) setThumbs(Object.fromEntries(previews)); } } })();
    loadIcons().then((m) => alive && setIcons(Object.entries(m))).catch(() => alive && setIcons([]));
    return () => { alive = false; };
  }, []);

  const needle = q.trim().toLowerCase();
  const match = (s: string) => !needle || s.toLowerCase().includes(needle);
  const els = ELEMENTS.filter((e) => match(`${e.name} ${e.tags} ${e.category}`));
  const iconHits = useMemo(() => (icons ?? []).filter(([n]) => match(iconLabel(n))), [icons, needle]); // eslint-disable-line react-hooks/exhaustive-deps
  const stickerHits = STICKERS.filter((s) => match(`${s.label} sticker emoji`));
  const photoHits = Object.values(STOCK).filter((ph) => match(`${ph.slug.replace(/-/g, " ")} ${ph.tags} photo`));

  function place(n: DesignNode, label: string) {
    const s = store.getState();
    fit(n);
    n.x = Math.round(s.doc.width / 2 - n.width / 2); n.y = Math.round(s.doc.height / 2 - n.height / 2);
    s.changePage(`Add ${label.toLowerCase()}`, (p) => { p.children.push(n); });
    s.select([n.id]);
  }
  const unit = () => Math.round(Math.min(store.getState().doc.width, store.getState().doc.height) * 0.3);
  function addIcon(name: string, node: unknown) {
    const r = importSvg(iconSvg(node as never));
    if (!r.node) return;
    const n = r.node as DesignNode;
    const k = (unit() * 0.7) / Math.max(n.width, n.height);
    bakeScale(n, k, k); // also scales the stroke width
    n.name = iconLabel(name);
    place(n, "icon");
  }
  async function addSticker(id: string, url: string, label: string) {
    setBusy(id); setError(null);
    try {
      const blob = await stickerPng(url);
      const a = await uploadImage(new File([blob], `${label}.png`, { type: "image/png" }));
      const nid = addImage(a);
      store.getState().changePage("Name sticker", (p) => { const n = p.children.find((x) => x.id === nid); if (n) { n.name = `Sticker (${label})`; const k = (unit() * 0.6) / Math.max(n.width, n.height); n.x += (n.width - n.width * k) / 2; n.y += (n.height - n.height * k) / 2; n.width *= k; n.height *= k; } }, { merge: `sticker:${nid}` });
    } catch (e) { setError((e as Error).message || "Could not add the sticker (offline?)"); } finally { setBusy(null); }
  }

  const Section = ({ id, title, count, children }: { id: string; title: string; count: number; children: (limit: number) => React.ReactNode }) => {
    if (!count) return null;
    const limit = open === id || needle ? 120 : 8;
    return (
      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="label">{title}</h3>
          {count > 8 && !needle && <button className="text-[11px] text-accent" onClick={() => setOpen(open === id ? null : id)}>{open === id ? "Show less" : `See all (${count})`}</button>}
        </div>
        <div className="grid grid-cols-4 gap-1.5">{children(limit)}</div>
      </section>
    );
  };

  return (
    <div className="space-y-4">
      <label className="relative block">
        <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted" />
        <input className="input pl-8" placeholder="Search elements, icons, stickers" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.stopPropagation()} aria-label="Search elements" />
      </label>
      {error && <p role="alert" className="text-xs text-danger">{error}</p>}
      {CATEGORIES.map((cat) => {
        const list = els.filter((e) => e.category === cat);
        return (
          <Section key={cat} id={cat} title={cat} count={list.length}>
            {(limit) => list.slice(0, limit).map((e) => (
              <button key={e.id} onClick={() => place(e.build(unit()), e.name)} title={e.name} aria-label={`Add ${e.name}`}
                className="aspect-square rounded-md bg-surface-2 hover:bg-surface-3 grid place-items-center p-1.5">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {thumbs[e.id] ? <img src={thumbs[e.id]} alt="" className="max-w-full max-h-full" /> : null}
              </button>
            ))}
          </Section>
        );
      })}
      <Section id="icons" title={`Icons${icons ? "" : " (loading…)"}`} count={iconHits.length}>
        {(limit) => iconHits.slice(0, needle ? 120 : limit).map(([name, node]) => (
          <button key={name} onClick={() => addIcon(name, node)} title={iconLabel(name)} aria-label={`Add icon ${iconLabel(name)}`}
            className="aspect-square rounded-md bg-surface-2 hover:bg-surface-3 grid place-items-center text-ink">
            <span className="size-6" dangerouslySetInnerHTML={{ __html: iconSvg(node as never, "currentColor").replace('width="24" height="24"', 'width="24" height="24" aria-hidden="true"') }} />
          </button>
        ))}
      </Section>
      <Section id="photos" title="Photos" count={photoHits.length}>
        {(limit) => photoHits.slice(0, limit).map((ph) => (
          <button key={ph.slug} onClick={() => addImage({ id: `stock-${ph.slug}`, url: stockUrl(ph.slug), width: ph.width, height: ph.height })} title={ph.slug.replace(/-/g, " ")} aria-label={`Add photo ${ph.slug.replace(/-/g, " ")}`}
            className="aspect-square rounded-md bg-surface-2 overflow-hidden hover:ring-2 ring-accent">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={stockUrl(ph.slug)} alt="" loading="lazy" className="w-full h-full object-cover" />
          </button>
        ))}
      </Section>
      <Section id="stickers" title="Stickers" count={stickerHits.length}>
        {(limit) => stickerHits.slice(0, limit).map((s) => (
          <button key={s.id} onClick={() => addSticker(s.id, s.url, s.label)} title={s.label} aria-label={`Add sticker ${s.label}`} disabled={busy === s.id}
            className="aspect-square rounded-md bg-surface-2 hover:bg-surface-3 grid place-items-center p-1.5 disabled:opacity-50">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={s.url} alt="" loading="lazy" className="max-w-full max-h-full" />
          </button>
        ))}
      </Section>
      {!els.length && !iconHits.length && !stickerHits.length && <p className="text-sm text-muted">Nothing matches “{q}”.</p>}
      <p className="text-[11px] text-muted">Photos: public domain (CC0) via Openverse. Icons: Lucide (ISC licence). Stickers: Google Noto Emoji (Apache 2.0). Free for commercial use. Frames: select one and use “Put a photo in this shape”.</p>
    </div>
  );
}
