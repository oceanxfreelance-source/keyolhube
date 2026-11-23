"use client";
import { Copy, FolderOpen, Home, ImageIcon, LayoutTemplate, LogOut, MoreHorizontal, Plus, Search, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Logo } from "@/components/Logo";
import { ThemeToggle } from "@/components/ThemeToggle";
import { useTemplateThumbs } from "@/components/templates/useTemplateThumbs";
import { authClient } from "@/lib/auth-client";
import { newDoc } from "@/lib/doc/factory";
import type { DesignDoc } from "@/lib/doc/types";
import { fromUnit, PRESETS, type Preset } from "@/lib/presets";
import { BUILTIN_TEMPLATES, TEMPLATE_CATEGORIES } from "@/lib/templates/builtin";
import { instantiate } from "@/lib/templates/instantiate";

type Summary = { id: string; title: string; width: number; height: number; pages: number; thumbnailAssetId: string | null; updatedAt: string };
type View = "home" | "templates" | "designs";

export function Dashboard({ user }: { user: { name: string; email: string } }) {
  const router = useRouter();
  const [view, setView] = useState<View>("home");
  const [projects, setProjects] = useState<Summary[] | null>(null);
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("All");
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [custom, setCustom] = useState({ w: 1080, h: 1080, unit: "px" as "px" | "mm" | "in" });
  const [menu, setMenu] = useState<string | null>(null);
  const thumbs = useTemplateThumbs(320);

  const load = useCallback(async (query: string) => {
    const r = await fetch(`/api/projects${query ? `?q=${encodeURIComponent(query)}` : ""}`);
    if (r.status === 401) return router.replace("/sign-in");
    if (!r.ok) return setError("Could not load your designs.");
    setProjects((await r.json()).projects);
  }, [router]);
  useEffect(() => { const t = setTimeout(() => load(q), q ? 250 : 0); return () => clearTimeout(t); }, [q, load]);

  async function createDoc(title: string, doc: DesignDoc) {
    setCreating(true);
    const r = await fetch("/api/projects", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ title, doc }) });
    setCreating(false);
    if (!r.ok) return setError("Could not create the design.");
    router.push(`/editor/${(await r.json()).id}`);
  }
  const create = (p: Pick<Preset, "name" | "width" | "height" | "dpi" | "unit">) => createDoc(`Untitled ${p.name.toLowerCase()}`, newDoc(p.width, p.height, p.dpi, p.unit));
  async function duplicate(id: string) { setMenu(null); if ((await fetch(`/api/projects/${id}/duplicate`, { method: "POST" })).ok) load(q); }
  async function remove(p: Summary) {
    setMenu(null);
    if (!confirm(`Delete "${p.title}"? This cannot be undone.`)) return;
    if ((await fetch(`/api/projects/${p.id}`, { method: "DELETE" })).ok) setProjects((ps) => ps?.filter((x) => x.id !== p.id) ?? null);
  }
  async function signOut() { await authClient.signOut(); router.replace("/sign-in"); }

  const needle = q.trim().toLowerCase();
  const templates = useMemo(() => BUILTIN_TEMPLATES.filter((t) => (cat === "All" || t.category === cat) &&
    (!needle || t.title.toLowerCase().includes(needle) || t.tags.some((g) => g.includes(needle)))), [cat, needle]);
  const customDpi = custom.unit === "px" ? 96 : 300;
  const NAV: { id: View; label: string; icon: React.ComponentType<{ size?: number }> }[] = [
    { id: "home", label: "Home", icon: Home }, { id: "templates", label: "Templates", icon: LayoutTemplate }, { id: "designs", label: "Your designs", icon: FolderOpen },
  ];

  const TemplateCard = ({ t }: { t: (typeof BUILTIN_TEMPLATES)[number] }) => (
    <button disabled={creating} data-template={t.id} onClick={() => createDoc(t.title, instantiate(t.build()))} className="group text-left">
      <div className="relative aspect-[4/5] rounded-xl bg-surface-2 border border-line overflow-hidden grid place-items-center group-hover:border-accent transition-colors">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {thumbs[t.id] ? <img src={thumbs[t.id]} alt="" className="absolute inset-3 h-[calc(100%-1.5rem)] w-[calc(100%-1.5rem)] object-contain drop-shadow-lg group-hover:scale-[1.03] transition-transform" /> : <span className="text-xs text-muted">Loading…</span>}
      </div>
      <div className="mt-2 text-[13px] font-medium leading-tight">{t.title}</div>
      <div className="text-[11.5px] text-muted">{t.category}</div>
    </button>
  );

  const Designs = ({ limit }: { limit?: number }) => (
    projects === null ? <p className="text-muted text-sm">Loading…</p>
      : projects.length === 0 ? <div className="rounded-xl border border-dashed border-line p-10 text-center text-sm text-muted">{q ? "No designs match your search." : "No designs yet. Start from a template or a blank size."}</div>
      : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          {projects.slice(0, limit).map((p) => (
            <div key={p.id} className="group relative" data-project={p.id}>
              <Link href={`/editor/${p.id}`} className="block">
                <div className="relative aspect-[4/3] rounded-xl bg-surface-2 border border-line overflow-hidden grid place-items-center group-hover:border-accent transition-colors">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {p.thumbnailAssetId ? <img src={`/api/assets/${p.thumbnailAssetId}`} alt="" className="absolute inset-3 h-[calc(100%-1.5rem)] w-[calc(100%-1.5rem)] object-contain drop-shadow-lg" /> : <ImageIcon className="text-muted" />}
                </div>
                <div className="mt-2 text-[13px] font-medium truncate">{p.title}</div>
                <div className="text-[11.5px] text-muted">{p.width} × {p.height} px · {p.pages} page{p.pages > 1 ? "s" : ""} · {ago(p.updatedAt)}</div>
              </Link>
              <button className="btn btn-icon absolute top-2 right-2 opacity-0 group-hover:opacity-100 focus:opacity-100 max-sm:opacity-100 bg-surface"
                aria-label={`More actions for ${p.title}`} onClick={(e) => { e.stopPropagation(); setMenu(menu === p.id ? null : p.id); }}><MoreHorizontal size={15} /></button>
              {menu === p.id && (
                <div className="menu absolute top-11 right-2 z-20" onClick={(e) => e.stopPropagation()}>
                  <button className="menu-item" onClick={() => duplicate(p.id)}><span className="flex items-center gap-2"><Copy size={14} /> Duplicate</span></button>
                  <button className="menu-item text-danger" onClick={() => remove(p)}><span className="flex items-center gap-2"><Trash2 size={14} /> Delete</span></button>
                </div>
              )}
            </div>
          ))}
        </div>
      )
  );

  return (
    <div className="min-h-full flex" onClick={() => setMenu(null)}>
      <aside className="hidden md:flex w-60 shrink-0 flex-col border-r border-line bg-surface sticky top-0 h-dvh">
        <div className="h-14 flex items-center px-4"><Logo small /></div>
        <nav className="px-2 space-y-0.5">
          {NAV.map((n) => (
            <button key={n.id} onClick={() => setView(n.id)} aria-current={view === n.id}
              className={`w-full flex items-center gap-2.5 px-3 h-9 rounded-lg text-[13px] ${view === n.id ? "bg-accent-soft text-accent font-medium" : "text-muted hover:text-ink hover:bg-surface-2"}`}>
              <n.icon size={16} />{n.label}
            </button>
          ))}
        </nav>
        <div className="flex-1" />
        <div className="p-3 border-t border-line flex items-center gap-2">
          <div className="size-8 rounded-full bg-accent text-accent-ink grid place-items-center text-sm font-semibold">{(user.name || user.email)[0]?.toUpperCase()}</div>
          <div className="min-w-0 flex-1"><div className="text-[13px] font-medium truncate">{user.name}</div><div className="text-[11px] text-muted truncate">{user.email}</div></div>
          <ThemeToggle />
          <button className="btn btn-ghost btn-icon" onClick={signOut} title="Sign out" aria-label="Sign out"><LogOut size={16} /></button>
        </div>
      </aside>

      <div className="flex-1 min-w-0">
        <header className="sticky top-0 z-10 bg-bg/85 backdrop-blur border-b border-line">
          <div className="h-14 px-4 md:px-8 flex items-center gap-3">
            <div className="md:hidden"><Logo small /></div>
            <label className="relative flex-1 max-w-xl">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
              <input className="input pl-9 h-10 rounded-xl" placeholder="Search templates and your designs" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search designs" />
            </label>
            <div className="flex-1 hidden md:block" />
            <button className="btn btn-primary h-10 rounded-xl" onClick={() => setView("home")}><Plus size={16} /> Create design</button>
            <div className="md:hidden flex"><ThemeToggle /><button className="btn btn-ghost btn-icon" onClick={signOut} aria-label="Sign out"><LogOut size={16} /></button></div>
          </div>
        </header>

        <main className="px-4 md:px-8 py-8 space-y-12 max-w-[1500px]">
          {error && <p role="alert" className="text-danger text-sm">{error}</p>}
          {view === "home" && (
            <>
              <section className="rounded-2xl p-8 md:p-10 bg-[linear-gradient(120deg,#312e81,#6d28d9_55%,#db2777)] text-white">
                <h1 className="text-3xl md:text-4xl font-semibold tracking-tight">What will you design today?</h1>
                <p className="mt-2 text-white/80 text-[15px]">Posters, social posts, menus, jerseys and campaigns, in English and Dhivehi.</p>
                <div className="mt-6 flex flex-wrap gap-2">
                  {PRESETS.slice(0, 9).map((p) => (
                    <button key={p.id} disabled={creating} onClick={() => create(p)} data-preset={p.id} className="h-9 px-3.5 rounded-full bg-white/15 hover:bg-white/25 text-[13px] font-medium backdrop-blur">
                      {p.name}
                    </button>
                  ))}
                </div>
              </section>
              <section>
                <div className="flex items-end justify-between mb-4">
                  <h2 className="text-lg font-semibold">Templates</h2>
                  <button className="text-[13px] text-accent" onClick={() => setView("templates")}>See all {BUILTIN_TEMPLATES.length}</button>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-6 gap-4">
                  {templates.slice(0, 12).map((t) => <TemplateCard key={t.id} t={t} />)}
                </div>
              </section>
              <section>
                <h2 className="text-lg font-semibold mb-4">All sizes</h2>
                <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
                  {[...new Set(PRESETS.map((p) => p.group))].map((g) => (
                    <div key={g} className="card p-4">
                      <div className="label mb-2">{g}</div>
                      <div className="space-y-0.5">
                        {PRESETS.filter((p) => p.group === g).map((p) => (
                          <button key={p.id} disabled={creating} onClick={() => create(p)} className="w-full flex items-center justify-between gap-3 px-2 h-8 rounded-md hover:bg-surface-2 text-[13px]">
                            <span>{p.name}</span><span className="text-[11.5px] text-muted">{p.note ?? `${p.width}×${p.height}`}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                  <div className="card p-4">
                    <div className="label mb-2">Custom size</div>
                    <div className="flex gap-2 items-center">
                      <input className="input w-20" type="number" min={1} aria-label="Width" value={custom.w} onChange={(e) => setCustom({ ...custom, w: Number(e.target.value) })} />
                      <span className="text-muted">×</span>
                      <input className="input w-20" type="number" min={1} aria-label="Height" value={custom.h} onChange={(e) => setCustom({ ...custom, h: Number(e.target.value) })} />
                      <select className="input w-16" aria-label="Unit" value={custom.unit} onChange={(e) => setCustom({ ...custom, unit: e.target.value as "px" | "mm" | "in" })}>
                        <option value="px">px</option><option value="mm">mm</option><option value="in">in</option>
                      </select>
                    </div>
                    <button className="btn btn-primary w-full mt-3" disabled={creating || !(custom.w > 0 && custom.h > 0)} onClick={() => {
                      const w = fromUnit(custom.w, custom.unit, customDpi), h = fromUnit(custom.h, custom.unit, customDpi);
                      if (w > 30000 || h > 30000) return setError("That size is too large (max 30000 px per side).");
                      create({ name: "design", width: w, height: h, dpi: customDpi, unit: custom.unit });
                    }}><Plus size={15} /> Create</button>
                  </div>
                </div>
              </section>
              <section>
                <div className="flex items-end justify-between mb-4">
                  <h2 className="text-lg font-semibold">Recent designs</h2>
                  <button className="text-[13px] text-accent" onClick={() => setView("designs")}>See all</button>
                </div>
                <Designs limit={10} />
              </section>
            </>
          )}
          {view === "templates" && (
            <section>
              <h1 className="text-2xl font-semibold mb-4">Templates</h1>
              <div className="flex flex-wrap gap-1.5 mb-6">
                {["All", ...TEMPLATE_CATEGORIES].map((c) => (
                  <button key={c} onClick={() => setCat(c)} aria-pressed={cat === c}
                    className={`h-8 px-3.5 rounded-full text-[13px] border ${cat === c ? "bg-accent text-accent-ink border-accent" : "border-line hover:bg-surface-2"}`}>{c}</button>
                ))}
              </div>
              {templates.length === 0 ? <p className="text-sm text-muted">No templates match.</p> : (
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-6 gap-4">{templates.map((t) => <TemplateCard key={t.id} t={t} />)}</div>
              )}
            </section>
          )}
          {view === "designs" && (
            <section>
              <h1 className="text-2xl font-semibold mb-6">Your designs</h1>
              <Designs />
            </section>
          )}
        </main>
      </div>
    </div>
  );
}

function ago(iso: string) {
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return new Date(iso).toLocaleDateString();
}
