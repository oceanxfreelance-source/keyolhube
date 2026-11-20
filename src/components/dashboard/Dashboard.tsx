"use client";
import { Copy, ImageIcon, LogOut, MoreHorizontal, Plus, Search, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Logo } from "@/components/Logo";
import { ThemeToggle } from "@/components/ThemeToggle";
import { authClient } from "@/lib/auth-client";
import { newDoc } from "@/lib/doc/factory";
import { fromUnit, PRESETS, type Preset } from "@/lib/presets";

type Summary = { id: string; title: string; width: number; height: number; pages: number; thumbnailAssetId: string | null; updatedAt: string };

export function Dashboard({ user }: { user: { name: string; email: string } }) {
  const router = useRouter();
  const [projects, setProjects] = useState<Summary[] | null>(null);
  const [q, setQ] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [custom, setCustom] = useState({ w: 1080, h: 1080, unit: "px" as "px" | "mm" | "in" });
  const [menu, setMenu] = useState<string | null>(null);

  const load = useCallback(async (query: string) => {
    const r = await fetch(`/api/projects${query ? `?q=${encodeURIComponent(query)}` : ""}`);
    if (r.status === 401) return router.replace("/sign-in");
    if (!r.ok) return setError("Could not load your designs.");
    setProjects((await r.json()).projects);
  }, [router]);

  useEffect(() => {
    const t = setTimeout(() => load(q), q ? 250 : 0);
    return () => clearTimeout(t);
  }, [q, load]);

  async function create(p: Pick<Preset, "name" | "width" | "height" | "dpi" | "unit">) {
    setCreating(true);
    const r = await fetch("/api/projects", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ title: `Untitled ${p.name.toLowerCase()}`, doc: newDoc(p.width, p.height, p.dpi, p.unit) }) });
    setCreating(false);
    if (!r.ok) return setError("Could not create the design.");
    router.push(`/editor/${(await r.json()).id}`);
  }

  async function duplicate(id: string) {
    setMenu(null);
    const r = await fetch(`/api/projects/${id}/duplicate`, { method: "POST" });
    if (r.ok) load(q);
  }
  async function remove(p: Summary) {
    setMenu(null);
    if (!confirm(`Delete "${p.title}"? This cannot be undone.`)) return;
    const r = await fetch(`/api/projects/${p.id}`, { method: "DELETE" });
    if (r.ok) setProjects((ps) => ps?.filter((x) => x.id !== p.id) ?? null);
  }
  async function signOut() {
    await authClient.signOut();
    router.replace("/sign-in");
  }

  const groups = useMemo(() => [...new Set(PRESETS.map((p) => p.group))], []);
  const customDpi = custom.unit === "px" ? 96 : 300;

  return (
    <div className="min-h-full" onClick={() => setMenu(null)}>
      <header className="sticky top-0 z-10 bg-bg/90 backdrop-blur border-b border-line">
        <div className="mx-auto max-w-7xl px-4 h-14 flex items-center gap-3">
          <Logo small />
          <div className="flex-1" />
          <span className="hidden sm:block text-sm text-muted">{user.name}</span>
          <ThemeToggle />
          <button className="btn btn-ghost btn-icon" onClick={signOut} title="Sign out" aria-label="Sign out"><LogOut size={18} /></button>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-8 space-y-10">
        <section>
          <h1 className="text-2xl font-semibold">What will you design today?</h1>
          {groups.map((g) => (
            <div key={g} className="mt-5">
              <h2 className="label mb-2">{g}</h2>
              <div className="flex gap-3 overflow-x-auto pb-2 -mx-1 px-1">
                {PRESETS.filter((p) => p.group === g).map((p) => (
                  <button key={p.id} disabled={creating} onClick={() => create(p)} data-preset={p.id}
                    className="card shrink-0 w-36 p-3 text-left hover:border-accent transition-colors">
                    <div className="h-20 grid place-items-center">
                      <div className="bg-accent-soft border border-accent/30 rounded" style={aspectBox(p.width, p.height, 72)} />
                    </div>
                    <div className="text-sm font-medium mt-2 leading-tight">{p.name}</div>
                    <div className="text-xs text-muted mt-0.5">{p.note ?? `${p.width} × ${p.height} px`}</div>
                  </button>
                ))}
              </div>
            </div>
          ))}
          <div className="mt-5 flex flex-wrap items-end gap-2">
            <div>
              <div className="label mb-1">Custom size</div>
              <div className="flex gap-2">
                <input className="input w-24" type="number" min={1} aria-label="Width" value={custom.w} onChange={(e) => setCustom({ ...custom, w: Number(e.target.value) })} />
                <span className="self-center text-muted">×</span>
                <input className="input w-24" type="number" min={1} aria-label="Height" value={custom.h} onChange={(e) => setCustom({ ...custom, h: Number(e.target.value) })} />
                <select className="input w-20" aria-label="Unit" value={custom.unit} onChange={(e) => setCustom({ ...custom, unit: e.target.value as "px" | "mm" | "in" })}>
                  <option value="px">px</option><option value="mm">mm</option><option value="in">in</option>
                </select>
              </div>
            </div>
            <button className="btn btn-primary" disabled={creating || !(custom.w > 0 && custom.h > 0)}
              onClick={() => {
                const w = fromUnit(custom.w, custom.unit, customDpi), h = fromUnit(custom.h, custom.unit, customDpi);
                if (w > 30000 || h > 30000) return setError("That size is too large (max 30000 px per side).");
                create({ name: "design", width: w, height: h, dpi: customDpi, unit: custom.unit });
              }}>
              <Plus size={16} /> Create
            </button>
          </div>
        </section>

        <section>
          <div className="flex items-center gap-3 flex-wrap">
            <h2 className="text-lg font-semibold flex-1">Your designs</h2>
            <label className="relative w-full sm:w-72">
              <Search size={16} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted" />
              <input className="input pl-8" placeholder="Search designs" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search designs" />
            </label>
          </div>
          {error && <p role="alert" className="text-danger text-sm mt-3">{error}</p>}
          {projects === null ? (
            <p className="text-muted text-sm mt-6">Loading…</p>
          ) : projects.length === 0 ? (
            <p className="text-muted text-sm mt-6">{q ? "No designs match your search." : "No designs yet. Pick a size above to start."}</p>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 mt-4">
              {projects.map((p) => (
                <div key={p.id} className="group relative" data-project={p.id}>
                  <Link href={`/editor/${p.id}`} className="block card overflow-hidden hover:border-accent transition-colors">
                    <div className="aspect-[4/3] bg-surface-2 grid place-items-center p-3">
                      {p.thumbnailAssetId ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={`/api/assets/${p.thumbnailAssetId}`} alt="" className="max-h-full max-w-full object-contain shadow-sm" />
                      ) : (
                        <ImageIcon className="text-muted" />
                      )}
                    </div>
                    <div className="p-3">
                      <div className="text-sm font-medium truncate">{p.title}</div>
                      <div className="text-xs text-muted mt-0.5">{p.width} × {p.height} px · {p.pages} page{p.pages > 1 ? "s" : ""} · {ago(p.updatedAt)}</div>
                    </div>
                  </Link>
                  <button className="btn btn-icon absolute top-2 right-2 opacity-0 group-hover:opacity-100 focus:opacity-100 max-sm:opacity-100"
                    aria-label={`More actions for ${p.title}`} onClick={(e) => { e.stopPropagation(); setMenu(menu === p.id ? null : p.id); }}>
                    <MoreHorizontal size={16} />
                  </button>
                  {menu === p.id && (
                    <div className="card absolute top-12 right-2 z-20 p-1 w-40" onClick={(e) => e.stopPropagation()}>
                      <button className="btn btn-ghost w-full justify-start" onClick={() => duplicate(p.id)}><Copy size={15} /> Duplicate</button>
                      <button className="btn btn-ghost btn-danger w-full justify-start" onClick={() => remove(p)}><Trash2 size={15} /> Delete</button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}

function aspectBox(w: number, h: number, max: number) {
  const s = max / Math.max(w, h);
  return { width: Math.max(8, w * s), height: Math.max(8, h * s) };
}

function ago(iso: string) {
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return new Date(iso).toLocaleDateString();
}
