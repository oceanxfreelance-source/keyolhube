// Jersey & apparel studio: garment outlines, patterns, colourways and team rosters.
// Garments are drawn in a fixed source box and scaled by the path node, so every part stays an
// editable vector. Tags mark the parts the Apparel panel restyles.
import { make, newDoc, newId, solid } from "../doc/factory";
import type { DesignDoc, DesignNode, Fill, GroupNode, Page, PathNode, RosterEntry, TextNode } from "../doc/types";

export type Garment = "football" | "basketball" | "tshirt";
export type PatternKind = "solid" | "stripes" | "pinstripes" | "hoops" | "halves" | "sash" | "chevron" | "gradient";
export const PATTERNS: { id: PatternKind; name: string }[] = [
  { id: "solid", name: "Plain" }, { id: "stripes", name: "Stripes" }, { id: "pinstripes", name: "Pinstripes" }, { id: "hoops", name: "Hoops" },
  { id: "halves", name: "Halves" }, { id: "sash", name: "Sash" }, { id: "chevron", name: "Chevron" }, { id: "gradient", name: "Fade" },
];
export type Colourway = { primary: string; secondary: string; accent: string };

// Source boxes (units are arbitrary; the node scales them).
const SHIRT = { w: 1000, h: 1080 };
const SHORTS = { w: 1000, h: 700 };

const OUTLINE: Record<Garment, { front: string; back: string }> = {
  football: {
    front: "M300,40 C350,95 650,95 700,40 L860,90 L1000,300 L880,390 L820,320 L820,1080 L180,1080 L180,320 L120,390 L0,300 L140,90 Z",
    back: "M300,40 C350,62 650,62 700,40 L860,90 L1000,300 L880,390 L820,320 L820,1080 L180,1080 L180,320 L120,390 L0,300 L140,90 Z",
  },
  basketball: {
    front: "M290,40 C350,190 650,190 710,40 L800,40 C810,200 880,280 960,300 L960,1080 L40,1080 L40,300 C120,280 190,200 200,40 Z",
    back: "M290,40 C350,120 650,120 710,40 L800,40 C810,200 880,280 960,300 L960,1080 L40,1080 L40,300 C120,280 190,200 200,40 Z",
  },
  tshirt: {
    front: "M320,40 C360,110 640,110 680,40 L870,100 L1000,330 L860,410 L800,330 L800,1080 L200,1080 L200,330 L140,410 L0,330 L130,100 Z",
    back: "M320,40 C360,70 640,70 680,40 L870,100 L1000,330 L860,410 L800,330 L800,1080 L200,1080 L200,330 L140,410 L0,330 L130,100 Z",
  },
};
const SLEEVES: Record<Garment, string[]> = {
  football: ["M140,90 L0,300 L120,390 L180,320 Z", "M860,90 L1000,300 L880,390 L820,320 Z"],
  basketball: [],
  tshirt: ["M130,100 L0,330 L140,410 L200,330 Z", "M870,100 L1000,330 L860,410 L800,330 Z"],
};
const COLLAR: Record<Garment, { front: string; back: string }> = {
  football: { front: "M300,40 C350,95 650,95 700,40", back: "M300,40 C350,62 650,62 700,40" },
  basketball: { front: "M290,40 C350,190 650,190 710,40 M200,40 C190,200 120,280 40,300 M800,40 C810,200 880,280 960,300", back: "M290,40 C350,120 650,120 710,40 M200,40 C190,200 120,280 40,300 M800,40 C810,200 880,280 960,300" },
  tshirt: { front: "M320,40 C360,110 640,110 680,40", back: "M320,40 C360,70 640,70 680,40" },
};
const CUFFS: Record<Garment, string> = {
  football: "M0,300 L120,390 M1000,300 L880,390",
  basketball: "",
  tshirt: "M0,330 L140,410 M1000,330 L860,410",
};
const SHORTS_OUTLINE = "M100,0 H900 L1000,650 H560 L500,250 L440,650 H0 Z";

function path(name: string, data: string, box: { w: number; h: number }, x: number, y: number, w: number, h: number, fill: Fill, stroke: PathNode["stroke"] = null, tag?: string): PathNode {
  return { id: newId(), name, type: "path", x, y, width: w, height: h, rotation: 0, opacity: 1, visible: true, locked: false, blendMode: "source-over", shadow: null,
    data, sourceWidth: box.w, sourceHeight: box.h, fill, stroke, ...(tag ? { tag } : {}) };
}

/** Pattern artwork in the garment's source box. */
export function patternData(kind: PatternKind, box: { w: number; h: number }): string {
  const { w, h } = box;
  const rects = (rs: [number, number, number, number][]) => rs.map(([x, y, rw, rh]) => `M${x},${y} H${x + rw} V${y + rh} H${x} Z`).join(" ");
  switch (kind) {
    case "stripes": return rects(Array.from({ length: 6 }, (_, i) => [w * (0.08 + i * 0.16), 0, w * 0.08, h] as [number, number, number, number]));
    case "pinstripes": return rects(Array.from({ length: 20 }, (_, i) => [w * (0.025 + i * 0.05), 0, w * 0.008, h] as [number, number, number, number]));
    case "hoops": return rects(Array.from({ length: 6 }, (_, i) => [0, h * (0.08 + i * 0.16), w, h * 0.08] as [number, number, number, number]));
    case "halves": return rects([[w / 2, 0, w / 2, h]]);
    case "sash": return `M${w * 0.78},0 L${w},${h * 0.12} L${w * 0.3},${h} L${w * 0.04},${h} Z`;
    case "chevron": return `M0,${h * 0.25} L${w / 2},${h * 0.45} L${w},${h * 0.25} L${w},${h * 0.37} L${w / 2},${h * 0.57} L0,${h * 0.37} Z`;
    default: return `M0,0 H0 Z`; // solid / gradient: no extra artwork
  }
}

function patternNode(kind: PatternKind, c: Colourway, box: { w: number; h: number }, w: number, h: number): PathNode {
  const n = path("Pattern", patternData(kind, box), box, 0, 0, w, h, solid(c.secondary), null, "jersey-pattern");
  n.visible = kind !== "solid" && kind !== "gradient";
  return n;
}

function baseFill(kind: PatternKind, c: Colourway): Fill {
  return kind === "gradient" ? { type: "linear", angle: 90, stops: [{ offset: 0, color: c.primary }, { offset: 1, color: c.secondary }] } : solid(c.primary);
}

/** The garment body: a clipping mask (outline) holding colour, pattern, sleeves and trims. */
function body(g: Garment, side: "front" | "back", c: Colourway, kind: PatternKind, x: number, y: number, w: number, h: number): DesignNode[] {
  const B = SHIRT;
  const children: DesignNode[] = [
    path("Outline (mask)", OUTLINE[g][side], B, 0, 0, w, h, solid("#ffffff"), null, "jersey-silhouette"),
    { ...make.rect(0, 0, w, h), fill: baseFill(kind, c), name: "Base colour", tag: "jersey-base" },
    patternNode(kind, c, B, w, h),
    ...SLEEVES[g].map((d, i) => path(i ? "Right sleeve" : "Left sleeve", d, B, 0, 0, w, h, solid(c.secondary), null, "jersey-sleeve")),
  ];
  // Trims sit inside the mask, so they end exactly at the garment edge (no halo outside it).
  const sw = Math.round(w / 60);
  children.push(path("Collar", COLLAR[g][side], B, 0, 0, w, h, { type: "none" }, { color: c.accent, width: sw * 3, cap: "round", join: "round" }, "jersey-collar"));
  if (CUFFS[g]) children.push(path("Sleeve cuffs", CUFFS[g], B, 0, 0, w, h, { type: "none" }, { color: c.accent, width: sw * 2.4, cap: "butt" }, "jersey-collar"));
  const grp: GroupNode = { id: newId(), name: `${side === "front" ? "Front" : "Back"} body`, type: "group", x, y, width: w, height: h, rotation: 0, opacity: 1, visible: true, locked: false,
    blendMode: "source-over", shadow: null, mask: true, children, tag: "jersey-body" };
  const seam = path("Seam outline", OUTLINE[g][side], B, x, y, w, h, { type: "none" }, { color: "#0f172a", width: Math.max(3, sw / 4), join: "round" }, "jersey-outline");
  return [grp, seam];
}

function label(x: number, y: number, w: number, t: string, size: number, o: Partial<TextNode>): TextNode {
  const n = make.text(x, y, t, size, w);
  return Object.assign(n, { name: t, align: "center" as const }, o);
}

/** A complete kit design: front, back (name & number) and, for football, matching shorts. */
export function buildKit(g: Garment, c: Colourway = { primary: "#0b3d91", secondary: "#f2b705", accent: "#ffffff" }, kind: PatternKind = "stripes"): DesignDoc {
  // Print canvas ~61 x 69 cm at 100 DPI (sublimation panels are usually printed at 100-150 DPI).
  const W = 2400, H = 2700;
  const doc = newDoc(W, H, 100, "mm");
  const bw = 2000, bh = 2160, bx = 200, by = 300;
  const name = (n: string) => n;
  const front: Page = { id: newId(), name: name("Front"), background: solid("#f1f5f9"), children: [
    ...body(g, "front", c, kind, bx, by, bw, bh),
    { ...make.ellipse(bx + bw * 0.62, by + bh * 0.2, 240, 240, "#e2e8f0"), name: "Team badge (photo frame)", tag: "team-badge" },
    label(bx + bw * 0.2, by + bh * 0.42, bw * 0.6, "SPONSOR", 200, { fontFamily: "Oswald", fontWeight: 700, fill: solid(c.accent), tag: "sponsor" }),
    label(bx + bw * 0.25, by + bh * 0.2, 260, "10", 160, { fontFamily: "Oswald", fontWeight: 700, fill: solid(c.accent), tag: "player-number" }),
  ] };
  const back: Page = { id: newId(), name: name("Back"), background: solid("#f1f5f9"), children: [
    ...body(g, "back", c, kind, bx, by, bw, bh),
    label(bx + bw * 0.15, by + bh * 0.16, bw * 0.7, "PLAYER", 210, { fontFamily: "Oswald", fontWeight: 700, letterSpacing: 12, fill: solid(c.accent), tag: "player-name" }),
    label(bx + bw * 0.15, by + bh * 0.3, bw * 0.7, "10", 820, { fontFamily: "Oswald", fontWeight: 700, fill: solid(c.accent), stroke: { color: "#0f172a", width: 10, join: "round" }, tag: "player-number" }),
  ] };
  doc.pages = [front, back];
  if (g === "football") {
    const sw = 2000, sh = 1400, sx = 200, sy = 600;
    const grp: GroupNode = { id: newId(), name: "Shorts body", type: "group", x: sx, y: sy, width: sw, height: sh, rotation: 0, opacity: 1, visible: true, locked: false,
      blendMode: "source-over", shadow: null, mask: true, tag: "jersey-body", children: [
        path("Outline (mask)", SHORTS_OUTLINE, SHORTS, 0, 0, sw, sh, solid("#ffffff"), null, "jersey-silhouette"),
        { ...make.rect(0, 0, sw, sh), fill: solid(c.secondary), name: "Base colour", tag: "shorts-base" },
        path("Side stripes", "M60,0 H150 L270,650 H180 Z M850,0 H940 L820,650 H730 Z", SHORTS, 0, 0, sw, sh, solid(c.primary), null, "jersey-sleeve"),
        path("Waistband", "M0,30 H1000", SHORTS, 0, 0, sw, sh, { type: "none" }, { color: c.accent, width: 80, cap: "butt" }, "jersey-collar"),
      ] };
    doc.pages.push({ id: newId(), name: "Shorts", background: solid("#f1f5f9"), children: [
      grp,
      path("Seam outline", SHORTS_OUTLINE, SHORTS, sx, sy, sw, sh, { type: "none" }, { color: "#0f172a", width: 8, join: "round" }, "jersey-outline"),
      label(sx + sw * 0.08, sy + sh * 0.62, 300, "10", 180, { fontFamily: "Oswald", fontWeight: 700, fill: solid(c.accent), tag: "player-number" }),
    ] });
  }
  doc.roster = [{ name: "PLAYER", number: "10", size: "M" }];
  return doc;
}

// ---------- restyling ----------
function walk(ns: DesignNode[], fn: (n: DesignNode) => void) {
  for (const n of ns) { fn(n); if (n.type === "group") walk(n.children, fn); }
}

/** Apply a colourway to every tagged part on every page. */
export function applyColourway(doc: DesignDoc, c: Colourway, kind?: PatternKind) {
  for (const p of doc.pages) walk(p.children, (n) => {
    if (n.tag === "jersey-base" && n.type === "rect") n.fill = kind === "gradient" ? baseFill("gradient", c) : solid(c.primary);
    if (n.tag === "shorts-base" && n.type === "rect") n.fill = solid(c.secondary);
    if ((n.tag === "jersey-pattern" || n.tag === "jersey-sleeve") && "fill" in n) n.fill = solid(n.tag === "jersey-sleeve" && n.name === "Side stripes" ? c.primary : c.secondary);
    if (n.tag === "jersey-collar" && "stroke" in n && n.stroke) n.stroke = { ...n.stroke, color: c.accent };
    if ((n.tag === "player-name" || n.tag === "player-number" || n.tag === "sponsor") && n.type === "text") n.fill = solid(c.accent);
  });
}

/** Replace the pattern artwork on every garment body. */
export function applyPattern(doc: DesignDoc, kind: PatternKind, c: Colourway) {
  for (const p of doc.pages) walk(p.children, (n) => {
    if (n.type !== "group" || n.tag !== "jersey-body") return;
    const sil = n.children.find((x) => x.tag === "jersey-silhouette") as PathNode | undefined;
    if (!sil || sil.sourceHeight !== SHIRT.h) return; // shirts only (shorts keep their stripes)
    const i = n.children.findIndex((x) => x.tag === "jersey-pattern");
    const pat = patternNode(kind, c, SHIRT, sil.width, sil.height);
    if (i >= 0) { pat.id = n.children[i].id; n.children[i] = pat; }
    const base = n.children.find((x) => x.tag === "jersey-base");
    if (base?.type === "rect") base.fill = baseFill(kind, c);
  });
}

export function currentColourway(doc: DesignDoc): Colourway | null {
  let primary: string | null = null, secondary: string | null = null, accent: string | null = null;
  for (const p of doc.pages) walk(p.children, (n) => {
    if (n.tag === "jersey-base" && n.type === "rect") primary ??= n.fill.type === "solid" ? n.fill.color : n.fill.type === "linear" ? n.fill.stops[0].color : null;
    if (n.tag === "jersey-pattern" && "fill" in n && n.fill.type === "solid") secondary ??= n.fill.color;
    if (n.tag === "jersey-collar" && "stroke" in n && n.stroke) accent ??= n.stroke.color;
  });
  return primary && secondary && accent ? { primary, secondary, accent } : null;
}

export function hasGarment(doc: DesignDoc) {
  let found = false;
  for (const p of doc.pages) walk(p.children, (n) => { if (n.tag === "jersey-body") found = true; });
  return found;
}

// ---------- roster ----------
/** Put one player's name and number into every tagged text (in place). */
export function applyPlayer(doc: DesignDoc, r: RosterEntry) {
  for (const p of doc.pages) walk(p.children, (n) => {
    if (n.type !== "text") return;
    if (n.tag === "player-name") n.text = r.name.toUpperCase();
    if (n.tag === "player-number") n.text = r.number;
  });
}

/** One document with every player's pages, for print export (Name #N – Front/Back/...). */
export function rosterDoc(doc: DesignDoc): DesignDoc {
  const players = doc.roster?.length ? doc.roster : [{ name: "PLAYER", number: "10" }];
  const out: DesignDoc = { ...JSON.parse(JSON.stringify(doc)), pages: [] };
  for (const r of players) {
    const copy: DesignDoc = JSON.parse(JSON.stringify(doc));
    applyPlayer(copy, r);
    out.pages.push(...copy.pages.map((p) => ({ ...p, id: newId(), name: `${r.name || "Player"} #${r.number}${r.size ? ` (${r.size})` : ""} - ${p.name}` })));
  }
  return out;
}

/** Parse pasted roster lines: "Name, 10, M" / "10 Name" / tab-separated from a spreadsheet. */
export function parseRoster(text: string): RosterEntry[] {
  return text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean).map((l) => {
    const parts = l.split(/\t|,|;/).map((x) => x.trim()).filter(Boolean);
    let name = "", number = "", size: string | undefined;
    if (parts.length === 1) {
      const m = parts[0].match(/^(\d{1,3})\s+(.+)$/) ?? parts[0].match(/^(.+?)\s+(\d{1,3})$/);
      if (m) { if (/^\d/.test(m[1])) { number = m[1]; name = m[2]; } else { name = m[1]; number = m[2]; } } else name = parts[0];
    } else {
      for (const p of parts) {
        if (!number && /^\d{1,3}$/.test(p)) number = p;
        else if (!size && /^(XXS|XS|S|M|L|XL|XXL|3XL|4XL|\d{1,2}Y)$/i.test(p)) size = p.toUpperCase();
        else if (!name) name = p;
      }
    }
    return { name: name.slice(0, 60), number: number.slice(0, 4), ...(size ? { size } : {}) };
  }).filter((r) => r.name || r.number).slice(0, 200);
}
