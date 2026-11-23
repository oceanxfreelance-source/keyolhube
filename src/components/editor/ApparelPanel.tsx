"use client";
import { Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { applyColourway, applyPattern, applyPlayer, buildKit, currentColourway, hasGarment, parseRoster, PATTERNS, rosterDoc, type Garment, type PatternKind } from "@/lib/apparel/garments";
import { exportPdf } from "@/lib/export/pdf";
import { download, safeName } from "@/lib/export/raster";
import { instantiate } from "@/lib/templates/instantiate";
import type { DesignDoc, RosterEntry } from "@/lib/doc/types";
import { fitText, useEd, useEditorCtx } from "./context";

const GARMENTS: { id: Garment; name: string }[] = [
  { id: "football", name: "Football kit (shirt + shorts)" }, { id: "basketball", name: "Basketball jersey" }, { id: "tshirt", name: "T-shirt" },
];

function refit(d: DesignDoc) {
  const walk = (ns: DesignDoc["pages"][number]["children"]) => ns.forEach((n) => { if (n.type === "text") fitText(n); if (n.type === "group") walk(n.children); });
  d.pages.forEach((p) => walk(p.children));
}

export function ApparelPanel() {
  const { store, project } = useEditorCtx();
  const doc = useEd((s) => s.doc);
  const garment = hasGarment(doc);
  const colours = currentColourway(doc) ?? { primary: "#0b3d91", secondary: "#f2b705", accent: "#ffffff" };
  const [kind, setKind] = useState<PatternKind>("stripes");
  const [paste, setPaste] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const roster = doc.roster ?? [];

  const startKit = (g: Garment) => {
    const kit = instantiate(buildKit(g));
    const s = store.getState();
    const empty = s.doc.pages.length === 1 && s.doc.pages[0].children.length === 0;
    if (!empty && !confirm("Start a kit? This replaces the pages in this design with the kit layout (you can undo).")) return;
    s.change("Start kit", (d) => { d.width = kit.width; d.height = kit.height; d.dpi = kit.dpi; d.unit = kit.unit; d.pages = kit.pages; d.roster = kit.roster; });
    s.setPage(kit.pages[0].id);
  };
  const setColours = (patch: Partial<typeof colours>) => {
    const c = { ...colours, ...patch };
    store.getState().change("Kit colours", (d) => applyColourway(d as DesignDoc, c, kind), { merge: "kit-colours" });
  };
  const setPattern = (k: PatternKind) => {
    setKind(k);
    store.getState().change("Kit pattern", (d) => applyPattern(d as DesignDoc, k, colours));
  };
  const setRoster = (r: RosterEntry[], label = "Roster") => store.getState().change(label, (d) => { d.roster = r; });
  const preview = (r: RosterEntry) => store.getState().change("Preview player", (d) => { applyPlayer(d as DesignDoc, r); refit(d as DesignDoc); });

  async function exportRoster() {
    setBusy("Preparing…");
    try {
      const d = rosterDoc(store.getState().doc);
      const { blob, dpi } = await exportPdf(d, (i, n) => setBusy(`Rendering page ${i + 1} of ${n}…`));
      download(blob, `${safeName(project.title)}-all-players.pdf`);
      setBusy(null);
      alert(`Saved ${d.pages.length} pages at ${dpi} DPI.`);
    } catch (e) { setBusy(null); alert((e as Error).message); }
  }

  if (!garment) return (
    <div className="space-y-3">
      <p className="text-sm text-muted">Design team kits: pick a garment, set colours and a pattern, add the team list, and export every player&apos;s shirt.</p>
      {GARMENTS.map((g) => <button key={g.id} className="btn w-full justify-start" onClick={() => startKit(g.id)}>{g.name}</button>)}
    </div>
  );

  return (
    <div className="space-y-4">
      <section className="space-y-2">
        <div className="label">Colours</div>
        {(["primary", "secondary", "accent"] as const).map((k) => (
          <label key={k} className="flex items-center gap-2 text-sm">
            <span className="w-24 text-muted capitalize">{k === "accent" ? "Trim & text" : k}</span>
            <input type="color" value={colours[k].slice(0, 7)} aria-label={`Kit ${k} colour`} onChange={(e) => setColours({ [k]: e.target.value })} />
            <span className="font-mono text-xs">{colours[k]}</span>
          </label>
        ))}
      </section>
      <section className="space-y-2">
        <div className="label">Pattern</div>
        <div className="grid grid-cols-4 gap-1">
          {PATTERNS.map((p) => (
            <button key={p.id} className={`btn h-auto py-1.5 text-[11px] ${kind === p.id ? "!bg-accent-soft !text-accent !border-accent/40" : ""}`} aria-pressed={kind === p.id} onClick={() => setPattern(p.id)}>{p.name}</button>
          ))}
        </div>
        <p className="text-xs text-muted">Every part (sleeves, collar, pattern) is a layer: select it on the canvas to fine-tune colours or put a photo/pattern in it.</p>
      </section>
      <section className="space-y-2">
        <div className="label">Team roster ({roster.length})</div>
        <ul className="space-y-1">
          {roster.map((r, i) => (
            <li key={i} className="flex items-center gap-1">
              <input className="input h-8 w-14" value={r.number} aria-label={`Number ${i + 1}`} onKeyDown={(e) => e.stopPropagation()}
                onChange={(e) => setRoster(roster.map((x, j) => (j === i ? { ...x, number: e.target.value.slice(0, 4) } : x)))} />
              <input className="input h-8 flex-1 min-w-0" value={r.name} aria-label={`Name ${i + 1}`} onKeyDown={(e) => e.stopPropagation()}
                onChange={(e) => setRoster(roster.map((x, j) => (j === i ? { ...x, name: e.target.value.slice(0, 60) } : x)))} />
              <input className="input h-8 w-12" value={r.size ?? ""} placeholder="Size" aria-label={`Size ${i + 1}`} onKeyDown={(e) => e.stopPropagation()}
                onChange={(e) => setRoster(roster.map((x, j) => (j === i ? { ...x, size: e.target.value.slice(0, 8) || undefined } : x)))} />
              <button className="btn btn-ghost h-8 px-2 text-xs" onClick={() => preview(r)} aria-label={`Preview ${r.name}`}>Show</button>
              <button className="btn btn-ghost btn-icon size-8" onClick={() => setRoster(roster.filter((_, j) => j !== i))} aria-label={`Remove ${r.name}`}><Trash2 size={13} /></button>
            </li>
          ))}
        </ul>
        <button className="btn w-full" onClick={() => setRoster([...roster, { name: "PLAYER", number: String(roster.length + 1) }])}><Plus size={15} /> Add player</button>
        <textarea className="input h-20 py-1.5" placeholder={"Paste a list (one per line):\nAhmed Ali, 7, M\nIbrahim, 10, L"} value={paste} aria-label="Paste roster" onKeyDown={(e) => e.stopPropagation()} onChange={(e) => setPaste(e.target.value)} />
        <button className="btn w-full" disabled={!paste.trim()} onClick={() => { const add = parseRoster(paste); if (add.length) { setRoster([...roster, ...add], "Import roster"); setPaste(""); } }}>Add pasted players</button>
      </section>
      <button className="btn btn-primary w-full" disabled={!!busy} onClick={exportRoster}>{busy ?? `Export all players (PDF, ${Math.max(1, roster.length) * doc.pages.length} pages)`}</button>
      <p className="text-xs text-muted">Print-size PDF, one set of pages per player, ready to send to a sublimation printer (RGB colours; ask your printer if they need CMYK). A 3D preview is not available yet.</p>
    </div>
  );
}
