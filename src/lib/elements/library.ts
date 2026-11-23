// Elements library (Canva-style): shapes, lines, photo frames, badges & banners, decorations,
// icons (Lucide, ISC licence) and stickers (Google Noto Emoji, Apache 2.0; flags public domain).
// Everything except stickers is inserted as editable vectors.
import { make, newId, solid } from "../doc/factory";
import type { DesignNode, Fill, GroupNode, PathNode, Stroke } from "../doc/types";

export type ElementDef = { id: string; name: string; tags: string; category: Category; build: (u: number) => DesignNode };
export type Category = "Shapes" | "Lines" | "Frames" | "Badges & banners" | "Decorations";

function p(name: string, data: string, sw: number, sh: number, w: number, h: number, fill: Fill, stroke: Stroke = null, extra: Partial<PathNode> = {}): PathNode {
  return { id: newId(), name, type: "path", x: 0, y: 0, width: w, height: h, rotation: 0, opacity: 1, visible: true, locked: false, blendMode: "source-over", shadow: null,
    data, sourceWidth: sw, sourceHeight: sh, fill, stroke, ...extra };
}
function grp(name: string, children: DesignNode[]): GroupNode {
  const r = Math.max(...children.map((c) => c.x + c.width)), b = Math.max(...children.map((c) => c.y + c.height));
  return { id: newId(), name, type: "group", x: 0, y: 0, width: r, height: b, rotation: 0, opacity: 1, visible: true, locked: false, blendMode: "source-over", shadow: null, children };
}
const frame = (name: string, data: string, sw: number, sh: number) => (u: number) => p(`Photo frame (${name})`, data, sw, sh, u, (u * sh) / sw, solid("#cbd5e1"));

export const ELEMENTS: ElementDef[] = [
  // ---- shapes ----
  { id: "sq", name: "Square", tags: "rectangle box", category: "Shapes", build: (u) => make.rect(0, 0, u, u) },
  { id: "rsq", name: "Rounded square", tags: "rounded rectangle card", category: "Shapes", build: (u) => ({ ...make.rect(0, 0, u, u, "#6366f1"), cornerRadius: Math.round(u * 0.15), name: "Rounded rectangle" }) },
  { id: "circle", name: "Circle", tags: "ellipse round dot", category: "Shapes", build: (u) => make.ellipse(0, 0, u, u) },
  { id: "tri", name: "Triangle", tags: "polygon", category: "Shapes", build: (u) => make.polygon(0, 0, u, 3) },
  { id: "hex", name: "Hexagon", tags: "polygon honeycomb", category: "Shapes", build: (u) => ({ ...make.polygon(0, 0, u, 6, "#14b8a6"), name: "Hexagon" }) },
  { id: "pent", name: "Pentagon", tags: "polygon", category: "Shapes", build: (u) => ({ ...make.polygon(0, 0, u, 5, "#8b5cf6"), name: "Pentagon" }) },
  { id: "star", name: "Star", tags: "rating favourite", category: "Shapes", build: (u) => make.star(0, 0, u) },
  { id: "pill", name: "Pill", tags: "capsule button rounded", category: "Shapes", build: (u) => ({ ...make.rect(0, 0, u * 1.6, u * 0.6, "#0ea5e9"), cornerRadius: u * 0.3, name: "Pill" }) },
  { id: "heart", name: "Heart", tags: "love valentine", category: "Shapes", build: (u) => p("Heart", "M50,90 C20,70 0,50 0,28 C0,10 14,0 28,0 C38,0 46,6 50,14 C54,6 62,0 72,0 C86,0 100,10 100,28 C100,50 80,70 50,90 Z", 100, 90, u, u * 0.9, solid("#ef4444")) },
  { id: "arrow-shape", name: "Arrow", tags: "direction right block", category: "Shapes", build: (u) => p("Arrow shape", "M0,30 H60 V0 L100,50 L60,100 V70 H0 Z", 100, 100, u, u, solid("#f97316")) },
  { id: "diamond", name: "Diamond", tags: "rhombus", category: "Shapes", build: (u) => p("Diamond", "M50,0 L100,50 L50,100 L0,50 Z", 100, 100, u, u, solid("#06b6d4")) },
  { id: "half", name: "Half circle", tags: "semicircle arch", category: "Shapes", build: (u) => p("Half circle", "M0,50 A50,50 0 0 1 100,50 Z", 100, 50, u, u / 2, solid("#f59e0b")) },
  { id: "cross", name: "Cross", tags: "plus add medical", category: "Shapes", build: (u) => p("Cross", "M35,0 H65 V35 H100 V65 H65 V100 H35 V65 H0 V35 H35 Z", 100, 100, u, u, solid("#22c55e")) },
  { id: "ring", name: "Ring", tags: "circle outline donut", category: "Shapes", build: (u) => ({ ...make.ellipse(0, 0, u, u), fill: { type: "none" }, stroke: { color: "#111827", width: Math.max(4, u / 12) }, name: "Ring" }) },
  // ---- lines ----
  { id: "line", name: "Line", tags: "straight rule", category: "Lines", build: (u) => make.line(0, 0, u * 1.5) },
  { id: "dashed", name: "Dashed line", tags: "dash", category: "Lines", build: (u) => { const l = make.line(0, 0, u * 1.5); l.stroke = { ...l.stroke, dash: [12, 8] }; l.name = "Dashed line"; return l; } },
  { id: "dotted", name: "Dotted line", tags: "dots", category: "Lines", build: (u) => { const l = make.line(0, 0, u * 1.5); l.stroke = { ...l.stroke, width: 6, dash: [0.01, 14], cap: "round" }; l.name = "Dotted line"; return l; } },
  { id: "thick", name: "Thick line", tags: "bold bar", category: "Lines", build: (u) => { const l = make.line(0, 0, u * 1.5); l.stroke = { ...l.stroke, width: Math.max(10, u / 10) }; l.name = "Thick line"; return l; } },
  { id: "arrow", name: "Arrow", tags: "pointer direction", category: "Lines", build: (u) => ({ ...make.line(0, 0, u * 1.5), arrowEnd: true, name: "Arrow" }) },
  { id: "curve", name: "Curved line", tags: "arc swoosh", category: "Lines", build: (u) => p("Curved line", "M0,60 Q100,0 200,60", 200, 60, u * 1.5, u * 0.45, { type: "none" }, { color: "#111827", width: 6, cap: "round" }) },
  { id: "wave-line", name: "Wavy line", tags: "squiggle wave", category: "Lines", build: (u) => p("Wavy line", "M0,20 Q25,0 50,20 T100,20 T150,20 T200,20", 200, 40, u * 1.5, u * 0.3, { type: "none" }, { color: "#111827", width: 6, cap: "round", join: "round" }) },
  { id: "zigzag", name: "Zigzag", tags: "zig zag", category: "Lines", build: (u) => p("Zigzag", "M0,30 L25,0 L50,30 L75,0 L100,30 L125,0 L150,30 L175,0 L200,30", 200, 30, u * 1.5, u * 0.22, { type: "none" }, { color: "#111827", width: 6, cap: "round", join: "round" }) },
  // ---- photo frames ----
  { id: "f-circle", name: "Circle frame", tags: "photo frame round portrait", category: "Frames", build: frame("circle", "M50,0 A50,50 0 1 1 49.99,0 Z", 100, 100) },
  { id: "f-rounded", name: "Rounded frame", tags: "photo frame card", category: "Frames", build: (u) => ({ ...make.rect(0, 0, u, u * 1.25, "#cbd5e1"), cornerRadius: u * 0.08, name: "Photo frame (rounded)" }) },
  { id: "f-arch", name: "Arch frame", tags: "photo frame arch window", category: "Frames", build: frame("arch", "M0,130 V50 A50,50 0 0 1 100,50 V130 Z", 100, 130) },
  { id: "f-heart", name: "Heart frame", tags: "photo frame love", category: "Frames", build: frame("heart", "M50,90 C20,70 0,50 0,28 C0,10 14,0 28,0 C38,0 46,6 50,14 C54,6 62,0 72,0 C86,0 100,10 100,28 C100,50 80,70 50,90 Z", 100, 90) },
  { id: "f-blob", name: "Blob frame", tags: "photo frame organic", category: "Frames", build: frame("blob", "M62,2 C82,8 98,26 99,48 C100,72 84,94 60,98 C36,102 10,90 3,66 C-4,42 10,16 32,6 C42,1 52,-1 62,2 Z", 100, 100) },
  { id: "f-hex", name: "Hexagon frame", tags: "photo frame polygon", category: "Frames", build: frame("hexagon", "M25,0 H75 L100,43 L75,86 H25 L0,43 Z", 100, 86) },
  { id: "f-star", name: "Star frame", tags: "photo frame star", category: "Frames", build: (u) => ({ ...make.star(0, 0, u, "#cbd5e1"), innerRatio: 0.6, name: "Photo frame (star)" }) },
  { id: "f-diamond", name: "Diamond frame", tags: "photo frame rhombus", category: "Frames", build: frame("diamond", "M50,0 L100,50 L50,100 L0,50 Z", 100, 100) },
  // ---- badges & banners ----
  { id: "ribbon", name: "Ribbon banner", tags: "banner title label", category: "Badges & banners", build: (u) => grp("Ribbon banner", [
    p("Ribbon", "M0,10 H200 L185,40 L200,70 H0 L15,40 Z", 200, 80, u * 2, u * 0.8, solid("#dc2626")),
    { ...make.text(u * 0.2, u * 0.26, "YOUR TEXT", Math.round(u * 0.22), u * 1.6), align: "center", fontWeight: 700, fill: solid("#ffffff"), name: "Banner text" },
  ]) },
  { id: "burst", name: "Sale burst", tags: "starburst sale offer promo discount", category: "Badges & banners", build: (u) => grp("Sale burst", [
    { ...make.star(0, 0, u, "#facc15"), points: 16, innerRatio: 0.82, name: "Burst" },
    { ...make.text(0, u * 0.36, "SALE", Math.round(u * 0.24), u), align: "center", fontWeight: 800, fill: solid("#7c2d12"), name: "Burst text" },
  ]) },
  { id: "seal", name: "Seal", tags: "badge certificate award stamp", category: "Badges & banners", build: (u) => grp("Seal", [
    { ...make.star(0, 0, u, "#b45309"), points: 24, innerRatio: 0.9, name: "Seal edge" },
    { ...make.ellipse(u * 0.12, u * 0.12, u * 0.76, u * 0.76, "#b45309"), stroke: { color: "#fde68a", width: Math.max(2, u / 60) }, name: "Seal centre" },
    { ...make.text(u * 0.12, u * 0.4, "BEST", Math.round(u * 0.17), u * 0.76), align: "center", fontWeight: 800, fill: solid("#fde68a"), name: "Seal text" },
  ]) },
  { id: "badge-new", name: "Circle badge", tags: "badge new label sticker", category: "Badges & banners", build: (u) => grp("Circle badge", [
    make.ellipse(0, 0, u, u, "#2563eb"),
    { ...make.ellipse(u * 0.06, u * 0.06, u * 0.88, u * 0.88), fill: { type: "none" }, stroke: { color: "#ffffff", width: Math.max(2, u / 50), dash: [6, 6] }, name: "Stitch" },
    { ...make.text(0, u * 0.36, "NEW", Math.round(u * 0.24), u), align: "center", fontWeight: 800, fill: solid("#ffffff"), name: "Badge text" },
  ]) },
  { id: "speech", name: "Speech bubble", tags: "chat talk quote comment", category: "Badges & banners", build: (u) => p("Speech bubble", "M20,0 H180 Q200,0 200,20 V100 Q200,120 180,120 H70 L40,150 L45,120 H20 Q0,120 0,100 V20 Q0,0 20,0 Z", 200, 150, u * 1.4, u * 1.05, solid("#ffffff"), { color: "#111827", width: 4, join: "round" }) },
  { id: "tag", name: "Price tag", tags: "label tag price", category: "Badges & banners", build: (u) => p("Price tag", "M0,0 H150 L190,40 L150,80 H0 Z", 190, 80, u * 1.6, u * 0.67, solid("#16a34a")) },
  { id: "label", name: "Label", tags: "label pill tag", category: "Badges & banners", build: (u) => grp("Label", [
    { ...make.rect(0, 0, u * 1.6, u * 0.45, "#111827"), cornerRadius: u * 0.225 },
    { ...make.text(0, u * 0.1, "LABEL", Math.round(u * 0.2), u * 1.6), align: "center", fontWeight: 700, letterSpacing: 4, fill: solid("#ffffff"), name: "Label text" },
  ]) },
  // ---- decorations ----
  { id: "blob1", name: "Blob", tags: "organic shape background", category: "Decorations", build: (u) => p("Blob", "M62,2 C82,8 98,26 99,48 C100,72 84,94 60,98 C36,102 10,90 3,66 C-4,42 10,16 32,6 C42,1 52,-1 62,2 Z", 100, 100, u, u, solid("#a5b4fc")) },
  { id: "blob2", name: "Blob 2", tags: "organic shape background", category: "Decorations", build: (u) => p("Blob", "M48,4 C70,-4 96,10 98,36 C100,58 90,70 80,84 C66,102 34,104 16,86 C0,70 -4,44 10,26 C20,14 32,10 48,4 Z", 100, 100, u, u, solid("#fbcfe8")) },
  { id: "wave", name: "Wave divider", tags: "wave ocean sea divider footer", category: "Decorations", build: (u) => p("Wave", "M0,40 C50,0 100,80 150,40 C200,0 250,80 300,40 V100 H0 Z", 300, 100, u * 3, u, solid("#0ea5e9")) },
  { id: "sparkle", name: "Sparkle", tags: "star shine twinkle", category: "Decorations", build: (u) => ({ ...make.star(0, 0, u * 0.6, "#facc15"), points: 4, innerRatio: 0.28, name: "Sparkle" }) },
  { id: "dots", name: "Dot grid", tags: "dots pattern texture", category: "Decorations", build: (u) => {
    const r = 3, d: string[] = [];
    for (let y = 0; y < 6; y++) for (let x = 0; x < 6; x++) { const cx = 10 + x * 20, cy = 10 + y * 20; d.push(`M${cx - r},${cy} A${r},${r} 0 1 0 ${cx + r},${cy} A${r},${r} 0 1 0 ${cx - r},${cy} Z`); }
    return p("Dot grid", d.join(" "), 120, 120, u, u, solid("#111827"));
  } },
  { id: "squiggle", name: "Squiggle", tags: "doodle scribble", category: "Decorations", build: (u) => p("Squiggle", "M5,30 C15,5 25,5 30,25 C35,45 45,45 50,25 C55,5 65,5 70,25 C75,45 85,45 95,20", 100, 50, u, u / 2, { type: "none" }, { color: "#ec4899", width: 8, cap: "round", join: "round" }) },
  { id: "corner", name: "Corner frame", tags: "border corner bracket", category: "Decorations", build: (u) => p("Corner frame", "M0,40 V0 H40 M160,0 H200 V40 M200,160 V200 H160 M40,200 H0 V160", 200, 200, u, u, { type: "none" }, { color: "#111827", width: 6, cap: "square" }) },
  { id: "palm", name: "Island sun", tags: "maldives island sun beach tropical", category: "Decorations", build: (u) => grp("Island sun", [
    make.ellipse(u * 0.2, 0, u * 0.6, u * 0.6, "#fbbf24"),
    p("Sea", "M0,70 C25,60 50,80 75,70 C100,60 125,80 150,70 V100 H0 Z", 150, 100, u, u * 0.67, solid("#0ea5e9"), null, { y: u * 0.33 } as Partial<PathNode>),
  ]) },
];

export const CATEGORIES: Category[] = ["Shapes", "Lines", "Frames", "Badges & banners", "Decorations"];

// ---------- icons (Lucide, ISC) ----------
type IconNode = [string, Record<string, string>][];
let iconsP: Promise<Record<string, IconNode>> | null = null;
export function loadIcons(): Promise<Record<string, IconNode>> {
  iconsP ??= import("lucide").then((m) => m.icons as unknown as Record<string, IconNode>);
  return iconsP;
}
export const iconLabel = (name: string) => name.replace(/([a-z0-9])([A-Z])/g, "$1 $2").toLowerCase();
export function iconSvg(node: IconNode, colour = "#111827"): string {
  const esc = (v: string) => v.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
  const kids = node.map(([tag, attrs]) => `<${tag} ${Object.entries(attrs).map(([k, v]) => `${k}="${esc(String(v))}"`).join(" ")}/>`).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="${colour}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${kids}</svg>`;
}

// ---------- stickers (Noto Emoji, Apache 2.0; region flags public domain) ----------
const NOTO = "https://cdn.jsdelivr.net/gh/googlefonts/noto-emoji@main";
export type Sticker = { id: string; label: string; url: string };
const EMOJI: [string, string][] = [
  ["1f600", "grinning"], ["1f602", "laughing tears"], ["1f60d", "heart eyes"], ["1f60e", "cool sunglasses"], ["1f929", "star struck"], ["1f973", "party face"],
  ["1f44d", "thumbs up"], ["1f44f", "clapping"], ["1f64f", "pray thanks"], ["1f4aa", "strong muscle"], ["270c", "victory peace"], ["1f91d", "handshake"],
  ["2764", "red heart"], ["1f499", "blue heart"], ["1f49a", "green heart"], ["1f49b", "yellow heart"], ["1f525", "fire hot"], ["2b50", "star"],
  ["2728", "sparkles"], ["1f389", "party popper celebration"], ["1f38a", "confetti"], ["1f381", "gift present"], ["1f388", "balloon"], ["1f382", "birthday cake"],
  ["1f3c6", "trophy winner"], ["1f947", "gold medal first"], ["26bd", "football soccer"], ["1f3c0", "basketball"], ["1f3d0", "volleyball"], ["1f3c4", "surfing"],
  ["1f3dd", "island beach maldives"], ["1f334", "palm tree"], ["1f30a", "wave ocean"], ["2600", "sun"], ["1f305", "sunrise"], ["1f308", "rainbow"],
  ["1f420", "tropical fish"], ["1f42c", "dolphin"], ["1f422", "turtle"], ["1f988", "shark"], ["1f419", "octopus"], ["1f41a", "shell"],
  ["26f5", "sailboat"], ["1f6a4", "speedboat"], ["2708", "airplane travel"], ["1f3e8", "hotel"], ["1f4cd", "location pin"], ["1f5fa", "map"],
  ["1f37d", "food plate"], ["1f35b", "curry rice"], ["1f965", "coconut"], ["1f964", "drink"], ["2615", "coffee"], ["1f370", "cake"],
  ["1f4e2", "announcement loudspeaker"], ["1f4e3", "megaphone"], ["1f5f3", "ballot vote"], ["2705", "check yes"], ["274c", "cross no"], ["2757", "exclamation"],
  ["1f4c5", "calendar date"], ["23f0", "alarm clock time"], ["1f4de", "phone call"], ["1f4e7", "email"], ["1f4f8", "camera"], ["1f3b5", "music"],
  ["1f4b0", "money bag"], ["1f6cd", "shopping bags"], ["1f3f7", "label tag"], ["1f4af", "100 hundred"], ["1f195", "new"], ["1f193", "free"],
];
const FLAGS: [string, string][] = [["MV", "Maldives flag"], ["GB", "United Kingdom flag"], ["US", "United States flag"], ["IN", "India flag"], ["LK", "Sri Lanka flag"], ["CN", "China flag"]];
export const STICKERS: Sticker[] = [
  ...EMOJI.map(([cp, label]) => ({ id: `e-${cp}`, label, url: `${NOTO}/2D/svg/emoji_u${cp}.svg` })),
  ...FLAGS.map(([code, label]) => ({ id: `f-${code}`, label, url: `${NOTO}/third_party/region-flags/svg/${code}.svg` })),
];

/** Render a sticker SVG to a high-resolution PNG (stickers are inserted as images). */
export async function stickerPng(url: string, size = 1024): Promise<Blob> {
  const svg = await (await fetch(url)).text();
  const blobUrl = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
  try {
    const img = new Image();
    img.src = blobUrl;
    await img.decode();
    const k = size / Math.max(img.naturalWidth || 128, img.naturalHeight || 128);
    const c = document.createElement("canvas");
    c.width = Math.round((img.naturalWidth || 128) * k); c.height = Math.round((img.naturalHeight || 128) * k);
    c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
    return await new Promise<Blob>((r, j) => c.toBlob((b) => (b ? r(b) : j(new Error("Could not render the sticker"))), "image/png"));
  } finally { URL.revokeObjectURL(blobUrl); }
}
