"use client";
import { Check, Search, Trash2, Upload } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { FontRef } from "@/lib/doc/types";
import { BUILTIN, googleCatalogue, nearestWeight, registerFont, type GoogleFont } from "@/lib/fonts";
import { Dialog } from "./Dialog";

type Uploaded = { id: string; family: string; weight: number; italic: boolean; file: string };
const CATS: Record<string, string> = { sans: "Sans serif", serif: "Serif", display: "Display", script: "Handwriting", mono: "Monospace", dhivehi: "Dhivehi" };

/**
 * Choose any font: built-in, uploaded, or one of ~1,900 Google Fonts. The chosen font is loaded
 * before it is applied, so text measures correctly. `onPick` receives the font reference(s) to
 * record in the design (none for built-in fonts).
 */
export function FontPicker({ current, weights = [400], onPick, onClose }: { current: string; weights?: number[]; onPick: (family: string, refs: FontRef[]) => void; onClose: () => void }) {
  const [q, setQ] = useState("");
  const [cat, setCat] = useState<string>("all");
  const [google, setGoogle] = useState<GoogleFont[] | null>(null);
  const [mine, setMine] = useState<Uploaded[] | null>(null);
  const [limit, setLimit] = useState(80);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [upload, setUpload] = useState<{ file: File; family: string; weight: number; italic: boolean } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    googleCatalogue().then(setGoogle).catch(() => setError("Could not load the Google Fonts list"));
    fetch("/api/fonts").then((r) => r.json()).then((b) => setMine(b.fonts)).catch(() => setMine([]));
  }, []);

  const needle = q.trim().toLowerCase();
  const thaana = /[ހ-޿]/.test(q);
  const g = useMemo(() => (google ?? []).filter((f) =>
    (cat === "all" || f.category === cat || (cat === "dhivehi" && f.scripts.includes("thaana"))) &&
    (thaana ? f.scripts.includes("thaana") : !needle || f.family.toLowerCase().includes(needle)))
    // exact name first, then names starting with the search, then popularity order
    .map((f, i) => ({ f, rank: !needle || thaana ? i : (f.family.toLowerCase() === needle ? -2e4 : f.family.toLowerCase().startsWith(needle) ? -1e4 : 0) + i }))
    .sort((a, b) => a.rank - b.rank).map((x) => x.f), [google, cat, needle, thaana]);
  const builtins = BUILTIN.filter((f) => (cat === "all" || f.category === cat) && (!needle || f.family.toLowerCase().includes(needle)));
  const myFamilies = useMemo(() => {
    const m = new Map<string, Uploaded[]>();
    for (const f of mine ?? []) m.set(f.family, [...(m.get(f.family) ?? []), f]);
    return [...m.entries()].filter(([fam]) => !needle || fam.toLowerCase().includes(needle));
  }, [mine, needle]);

  async function pick(family: string, refs: FontRef[]) {
    setBusy(family); setError(null);
    try {
      await Promise.all(refs.map(registerFont));
      // Download the actual font files for the weights in use before applying, so text is
      // measured with the real font (a stylesheet alone does not fetch the files).
      await Promise.all(weights.map((w) => document.fonts.load(`${nearestWeight(family, w)} 32px "${family}"`, "Aa")));
      onPick(family, refs);
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally { setBusy(null); }
  }

  async function doUpload() {
    if (!upload) return;
    setBusy("upload"); setError(null);
    const f = new FormData();
    f.append("file", upload.file); f.append("family", upload.family); f.append("weight", String(upload.weight)); f.append("italic", upload.italic ? "1" : "0");
    const r = await fetch("/api/fonts", { method: "POST", body: f });
    const b = await r.json().catch(() => ({}));
    setBusy(null);
    if (!r.ok) return setError(b.error ?? "Upload failed");
    setMine((m) => [{ id: b.id, family: b.family, weight: b.weight, italic: b.italic, file: upload.file.name }, ...(m ?? [])]);
    setUpload(null);
    setQ(""); // make sure the new font is visible
  }
  async function removeFont(f: Uploaded) {
    if (!confirm(`Delete the uploaded font file "${f.file}"? Designs using it will fall back to another font.`)) return;
    const r = await fetch(`/api/fonts/${f.id}`, { method: "DELETE" });
    if (r.ok) setMine((m) => m?.filter((x) => x.id !== f.id) ?? null);
  }

  const Row = ({ family, sub, onClick, right }: { family: string; sub?: string; onClick: () => void; right?: React.ReactNode }) => (
    <li className={`flex items-center gap-2 rounded-lg px-2 ${family === current ? "bg-accent-soft" : "hover:bg-surface-2"}`}>
      <button className="flex-1 text-start py-2 min-w-0" onClick={onClick} disabled={!!busy}>
        <div className="truncate text-[15px]">{family}{busy === family && " · loading…"}</div>
        {sub && <div className="text-xs text-muted truncate">{sub}</div>}
      </button>
      {family === current && <Check size={16} className="text-accent" />}
      {right}
    </li>
  );

  return (
    <Dialog title="Fonts" onClose={onClose} wide>
      <div className="space-y-3">
        <label className="relative block">
          <Search size={16} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted" />
          <input autoFocus className="input pl-8" placeholder="Search 1,900+ fonts (type ދިވެހި for Thaana fonts)" value={q} aria-label="Search fonts"
            onChange={(e) => { setQ(e.target.value); setLimit(80); }} onKeyDown={(e) => e.stopPropagation()} />
        </label>
        <div className="flex flex-wrap gap-1">
          {["all", "sans", "serif", "display", "script", "mono", "dhivehi"].map((c) => (
            <button key={c} className={`btn h-7 px-2 text-xs ${cat === c ? "!bg-accent-soft !text-accent !border-accent/40" : ""}`} aria-pressed={cat === c} onClick={() => { setCat(c); setLimit(80); }}>
              {c === "all" ? "All" : CATS[c]}
            </button>
          ))}
        </div>
        {error && <p role="alert" className="text-sm text-danger">{error}</p>}

        <section className="rounded-lg border border-line p-3 space-y-2">
          <div className="flex items-center justify-between"><h3 className="label">Your fonts</h3>
            <button className="btn h-8" onClick={() => fileRef.current?.click()}><Upload size={15} /> Upload font</button></div>
          <input ref={fileRef} type="file" hidden accept=".ttf,.otf,.woff,.woff2,font/ttf,font/otf,font/woff,font/woff2" data-testid="font-input"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              const base = file.name.replace(/\.(ttf|otf|woff2?)$/i, "");
              const bold = /bold|black|heavy/i.test(base), semi = /semi|demi/i.test(base), light = /light|thin/i.test(base);
              setUpload({ file, family: base.replace(/[-_ ]?(regular|bold|italic|semibold|demibold|light|thin|black|heavy|medium)+$/gi, "").replace(/[-_]+/g, " ").trim() || base,
                weight: bold && semi ? 600 : bold ? 700 : light ? 300 : /medium/i.test(base) ? 500 : 400, italic: /italic|oblique/i.test(base) });
              e.target.value = "";
            }} />
          {upload && (
            <div className="space-y-2 rounded-md bg-surface-2 p-2">
              <div className="text-xs text-muted truncate">{upload.file.name}</div>
              <input className="input" value={upload.family} aria-label="Font name" onChange={(e) => setUpload({ ...upload, family: e.target.value })} onKeyDown={(e) => e.stopPropagation()} />
              <div className="flex gap-2 items-center text-sm">
                <select className="input" value={upload.weight} aria-label="Font weight" onChange={(e) => setUpload({ ...upload, weight: Number(e.target.value) })}>
                  {[100, 200, 300, 400, 500, 600, 700, 800, 900].map((w) => <option key={w} value={w}>{w}{w === 400 ? " (regular)" : w === 700 ? " (bold)" : ""}</option>)}
                </select>
                <label className="flex items-center gap-1 whitespace-nowrap"><input type="checkbox" checked={upload.italic} onChange={(e) => setUpload({ ...upload, italic: e.target.checked })} /> Italic</label>
                <button className="btn btn-primary" disabled={busy === "upload" || !upload.family.trim()} onClick={doUpload}>{busy === "upload" ? "Uploading…" : "Add"}</button>
              </div>
              <p className="text-xs text-muted">Only upload fonts you are licensed to use. Upload each style (regular, bold, italic) under the same name to get a full family.</p>
            </div>
          )}
          {mine === null ? <p className="text-sm text-muted">Loading…</p> : myFamilies.length === 0 ? <p className="text-xs text-muted">No uploaded fonts yet. TTF, OTF, WOFF or WOFF2, up to 10 MB.</p> : (
            <ul>
              {myFamilies.map(([fam, files]) => (
                <Row key={fam} family={fam} sub={files.map((f) => `${f.weight}${f.italic ? " italic" : ""}`).join(", ")}
                  onClick={() => pick(fam, files.map((f) => ({ source: "upload", family: fam, assetId: f.id, weight: f.weight, italic: f.italic })))}
                  right={<button className="btn btn-ghost btn-icon size-7" aria-label={`Delete ${files[0].file}`} onClick={() => removeFont(files[0])}><Trash2 size={14} /></button>} />
              ))}
            </ul>
          )}
        </section>

        {builtins.length > 0 && (
          <section>
            <h3 className="label mb-1">Built in</h3>
            <ul>{builtins.map((f) => <Row key={f.family} family={f.family} sub={CATS[f.category]} onClick={() => pick(f.family, [])} />)}</ul>
          </section>
        )}
        <section>
          <h3 className="label mb-1">Google Fonts {google && <span className="normal-case font-normal">({g.length})</span>}</h3>
          {google === null ? <p className="text-sm text-muted">Loading…</p> : (
            <ul>
              {g.slice(0, limit).map((f) => (
                <Row key={f.family} family={f.family} sub={`${CATS[f.category] ?? f.category} · ${f.weights.length} weight${f.weights.length > 1 ? "s" : ""}${f.italics.length ? " + italic" : ""}${f.scripts.includes("thaana") ? " · Thaana" : ""}`}
                  onClick={() => pick(f.family, [{ source: "google", family: f.family, weights: f.weights, italics: f.italics }])} />
              ))}
            </ul>
          )}
          {google && g.length > limit && <button className="btn w-full mt-2" onClick={() => setLimit(limit + 120)}>Show more</button>}
        </section>
      </div>
    </Dialog>
  );
}
