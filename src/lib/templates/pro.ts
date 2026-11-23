// Professional templates built on CC0 stock photography (public/stock, see credits.json).
// Every element is editable: photos can be replaced, text restyled, shapes recoloured.
import { make, newDoc, newId, solid } from "../doc/factory";
import type { DesignDoc, DesignNode, Fill, ImageNode, RectNode, TextNode } from "../doc/types";
import type { Adjustments } from "../photo/adjust";
import { PRESETS } from "../presets";
import { STOCK, stockUrl } from "./stock";
import type { Template } from "./builtin";

// ---------- design helpers ----------
function photo(slug: string, x: number, y: number, w: number, h: number, o: { radius?: number; adjust?: Adjustments; focusY?: number; focusX?: number } = {}): ImageNode {
  const s = STOCK[slug];
  const n = make.image(x, y, w, h, `stock-${slug}`, stockUrl(slug), s.width, s.height);
  const fa = w / h, na = s.width / s.height;
  const cw = na > fa ? s.height * fa : s.width, ch = cw / fa;
  const fx = o.focusX ?? 0.5, fy = o.focusY ?? 0.5;
  n.crop = { x: Math.max(0, Math.min(s.width - cw, fx * s.width - cw / 2)), y: Math.max(0, Math.min(s.height - ch, fy * s.height - ch / 2)), width: cw, height: ch };
  n.cornerRadius = o.radius ?? 0;
  if (o.adjust) n.adjust = o.adjust;
  n.name = "Photo";
  return n;
}
const lin = (angle: number, stops: [number, string][]): Fill => ({ type: "linear", angle, stops: stops.map(([offset, color]) => ({ offset, color })) });
function box(x: number, y: number, w: number, h: number, fill: Fill, o: Partial<RectNode> = {}): RectNode {
  return { ...make.rect(x, y, w, h), fill, name: "Shape", ...o };
}
type TOpts = { font?: string; weight?: number; color?: string; align?: TextNode["align"]; ls?: number; lh?: number; italic?: boolean; name?: string };
function T(x: number, y: number, w: number, text: string, size: number, o: TOpts = {}): TextNode {
  const n = make.text(x, y, text, size, w);
  return Object.assign(n, {
    fontFamily: o.font ?? "Inter", fontWeight: o.weight ?? 400, fill: solid(o.color ?? "#111827"), align: o.align ?? "left",
    letterSpacing: o.ls ?? 0, lineHeight: o.lh ?? 1.2, italic: o.italic ?? false, name: o.name ?? text.slice(0, 32),
  });
}
function doc(preset: string, bg: Fill, children: DesignNode[]): DesignDoc {
  const p = PRESETS.find((x) => x.id === preset)!;
  const d = newDoc(p.width, p.height, p.dpi, p.unit);
  d.pages[0].background = bg;
  d.pages[0].children = children;
  return d;
}
const pill = (x: number, y: number, w: number, h: number, fill: string, label: string, color: string, size: number, font = "Inter") => [
  box(x, y, w, h, solid(fill), { cornerRadius: h / 2, name: "Button" }),
  T(x, y + (h - size * 1.2) / 2, w, label, size, { font, weight: 600, color, align: "center", name: "Button label" }),
];

export const PRO_TEMPLATES: Template[] = [
  {
    id: "pro-resort", title: "Resort getaway", category: "Travel", tags: ["travel", "resort", "maldives", "hotel", "holiday", "beach", "instagram"],
    build: () => doc("ig-post", solid("#0b1320"), [
      photo("maldives-overwater", 0, 0, 1080, 1350, { focusX: 0.55, adjust: { vibrance: 18, contrast: 6 } }),
      box(0, 600, 1080, 750, lin(90, [[0, "#0b132000"], [0.55, "#0b1320cc"], [1, "#0b1320f2"]]), { name: "Shade" }),
      T(80, 860, 920, "MALDIVES · 5 NIGHTS", 30, { weight: 600, color: "#7dd3fc", ls: 6 }),
      T(80, 915, 920, "Escape to\nparadise", 120, { font: "Playfair Display", weight: 700, color: "#ffffff", lh: 1.02 }),
      T(80, 1185, 560, "Overwater villa, breakfast and sunset cruise included.", 30, { color: "#cbd5e1", lh: 1.4 }),
      ...pill(720, 1180, 280, 84, "#ffffff", "Book now", "#0b1320", 30),
      T(720, 1080, 280, "from $1,290", 34, { weight: 700, color: "#ffffff", align: "center" }),
    ]),
  },
  {
    id: "pro-food-special", title: "Today's special", category: "Food", tags: ["food", "restaurant", "menu", "burger", "special", "cafe", "instagram"],
    build: () => doc("ig-post", solid("#121212"), [
      photo("gourmet-burger", 0, 0, 1080, 860, { focusY: 0.45, adjust: { contrast: 10, vibrance: 15, sharpen: 15 } }),
      box(0, 820, 1080, 530, solid("#121212"), { name: "Panel" }),
      box(80, 780, 300, 80, solid("#f59e0b"), { cornerRadius: 8, name: "Tag" }),
      T(80, 798, 300, "TODAY'S SPECIAL", 28, { weight: 800, color: "#121212", align: "center", ls: 2 }),
      T(80, 900, 920, "Double smash burger", 88, { font: "Oswald", weight: 700, color: "#ffffff" }),
      T(80, 1020, 640, "Two beef patties, cheddar, caramelised onion and house sauce, with fries.", 30, { color: "#a3a3a3", lh: 1.45 }),
      T(760, 1015, 240, "MVR\n120", 64, { font: "Oswald", weight: 700, color: "#f59e0b", align: "right", lh: 1 }),
      box(80, 1200, 920, 2, solid("#2a2a2a"), { name: "Divider" }),
      T(80, 1235, 920, "Open daily 11:00 to 23:00  ·  Majeedhee Magu, Malé", 26, { color: "#d4d4d4" }),
    ]),
  },
  {
    id: "pro-coffee", title: "Coffee shop promo", category: "Food", tags: ["coffee", "cafe", "drink", "promo", "square"],
    build: () => doc("ig-square", solid("#f5efe6"), [
      photo("coffee-red", 540, 0, 540, 1080, { focusX: 0.45 }),
      T(80, 140, 420, "Fresh brew", 34, { font: "Dancing Script", weight: 700, color: "#b91c1c" }),
      T(80, 200, 440, "MONDAY\nCOFFEE\nCLUB", 104, { font: "Bebas Neue", color: "#2b1d16", lh: 0.95 }),
      T(80, 560, 400, "Buy any coffee before 10 AM and get a pastry free.", 30, { color: "#57443a", lh: 1.45 }),
      ...pill(80, 800, 300, 80, "#2b1d16", "Visit us", "#f5efe6", 28),
      T(80, 960, 420, "@yourcafe", 26, { weight: 600, color: "#8a6f60" }),
    ]),
  },
  {
    id: "pro-quote", title: "Quote on photo", category: "Social media", tags: ["quote", "inspiration", "motivation", "sunset", "square"],
    build: () => doc("ig-square", solid("#000000"), [
      photo("palm-silhouettes", 0, 0, 1080, 1080, { adjust: { exposure: -0.2, vibrance: 20 } }),
      box(0, 0, 1080, 1080, lin(90, [[0, "#00000055"], [1, "#000000aa"]]), { name: "Shade" }),
      T(140, 300, 800, "“", 220, { font: "Playfair Display", weight: 700, color: "#fbbf24", align: "center" }),
      T(140, 470, 800, "Life is better\nwhen you're\nbarefoot.", 92, { font: "Playfair Display", italic: true, color: "#ffffff", align: "center", lh: 1.15 }),
      box(490, 850, 100, 4, solid("#fbbf24"), { name: "Divider" }),
      T(140, 885, 800, "YOUR BRAND", 28, { weight: 600, color: "#e5e7eb", align: "center", ls: 8 }),
    ]),
  },
  {
    id: "pro-concert", title: "Live music night", category: "Events", tags: ["concert", "music", "event", "party", "night", "poster", "gig"],
    build: () => doc("ig-post", solid("#1e0b3a"), [
      photo("concert-hands", 0, 0, 1080, 1350, { adjust: { saturation: -60, contrast: 20 } }),
      { ...box(0, 0, 1080, 1350, lin(135, [[0, "#7c3aed"], [1, "#db2777"]]), { name: "Duotone" }), blendMode: "multiply" as const },
      T(70, 90, 940, "FRIDAY 18 JULY · 9 PM", 32, { weight: 700, color: "#fde68a", ls: 6 }),
      T(60, 820, 960, "LIVE\nNIGHT", 260, { font: "Bebas Neue", color: "#ffffff", lh: 0.85 }),
      T(70, 1250, 600, "Sea Breeze Arena · Hulhumalé", 30, { weight: 600, color: "#ffffff" }),
      T(700, 1250, 310, "Tickets MVR 250", 30, { weight: 700, color: "#fde68a", align: "right" }),
    ]),
  },
  {
    id: "pro-sale-story", title: "Season sale story", category: "Business", tags: ["sale", "fashion", "clothing", "store", "discount", "story", "offer"],
    build: () => doc("story", solid("#f8f5f0"), [
      photo("clothing-rack", 0, 0, 1080, 1150, { adjust: { vibrance: 10 } }),
      box(0, 1150, 1080, 770, solid("#f8f5f0"), { name: "Panel" }),
      box(80, 1060, 380, 180, solid("#111111"), { name: "Badge" }),
      T(80, 1085, 380, "50%", 120, { font: "Bebas Neue", color: "#ffffff", align: "center" }),
      T(80, 1300, 920, "END OF SEASON", 52, { weight: 700, color: "#9a3412", ls: 8 }),
      T(80, 1380, 920, "SALE", 260, { font: "Bebas Neue", color: "#111111", lh: 0.9 }),
      T(80, 1640, 920, "On everything in store and online. This weekend only.", 36, { color: "#525252", lh: 1.4 }),
      ...pill(80, 1770, 400, 96, "#111111", "Shop now", "#ffffff", 34),
    ]),
  },
  {
    id: "pro-villa", title: "Property listing", category: "Business", tags: ["real estate", "property", "villa", "hotel", "listing", "rent", "pool"],
    build: () => doc("ig-post", solid("#ffffff"), [
      photo("resort-pool", 0, 0, 1080, 900, { adjust: { vibrance: 12 } }),
      box(60, 760, 960, 520, solid("#ffffff"), { cornerRadius: 28, name: "Card", shadow: { color: "#000000", blur: 40, offsetX: 0, offsetY: 16, opacity: 0.18 } }),
      T(110, 810, 600, "FOR RENT", 28, { weight: 700, color: "#0d9488", ls: 6 }),
      T(110, 860, 860, "Pool villa with garden", 64, { font: "Playfair Display", weight: 700, color: "#0f172a" }),
      T(110, 960, 860, "3 bedrooms  ·  2 bathrooms  ·  private pool  ·  sea view", 30, { color: "#475569" }),
      box(110, 1040, 860, 2, solid("#e2e8f0"), { name: "Divider" }),
      T(110, 1080, 500, "$2,400 / month", 52, { weight: 800, color: "#0f172a" }),
      ...pill(700, 1075, 270, 76, "#0d9488", "Contact", "#ffffff", 28),
      T(110, 1170, 860, "Hulhumalé Phase 2 · Call +960 000 0000", 26, { color: "#64748b" }),
    ]),
  },
  {
    id: "pro-webinar", title: "Webinar announcement", category: "Business", tags: ["webinar", "business", "event", "online", "facebook", "workshop"],
    build: () => doc("fb-post", solid("#0f172a"), [
      photo("coffee-notebook", 640, 0, 560, 630, { focusX: 0.4 }),
      box(560, 0, 200, 630, lin(0, [[0, "#0f172a"], [1, "#0f172a00"]]), { name: "Fade" }),
      T(60, 70, 560, "FREE WEBINAR", 22, { weight: 700, color: "#38bdf8", ls: 6 }),
      T(60, 115, 560, "Grow your small\nbusiness online", 58, { font: "Montserrat", weight: 800, color: "#ffffff", lh: 1.1 }),
      T(60, 290, 520, "Practical marketing tips you can use the same day.", 24, { color: "#94a3b8", lh: 1.45 }),
      T(60, 420, 520, "THU 24 JULY  ·  8 PM", 24, { weight: 700, color: "#ffffff" }),
      ...pill(60, 480, 250, 70, "#38bdf8", "Register free", "#0f172a", 24),
    ]),
  },
  {
    id: "pro-matchday", title: "Match day", category: "Sports", tags: ["football", "soccer", "match", "sports", "team", "fixture", "game"],
    build: () => doc("ig-post", solid("#04130c"), [
      photo("stadium-ball", 0, 0, 1080, 1350, { focusY: 0.6, adjust: { contrast: 12, vibrance: 10 } }),
      box(0, 0, 1080, 1350, lin(90, [[0, "#04130ccc"], [0.45, "#04130c33"], [1, "#04130cee"]]), { name: "Shade" }),
      T(60, 90, 960, "MATCH DAY", 150, { font: "Bebas Neue", color: "#ffffff", align: "center" }),
      T(60, 250, 960, "DHIVEHI PREMIER LEAGUE · ROUND 12", 26, { weight: 700, color: "#86efac", align: "center", ls: 4 }),
      T(60, 1010, 400, "HOME FC", 70, { font: "Oswald", weight: 700, color: "#ffffff", align: "center" }),
      T(440, 1000, 200, "VS", 90, { font: "Bebas Neue", color: "#86efac", align: "center" }),
      T(620, 1010, 400, "AWAY UTD", 70, { font: "Oswald", weight: 700, color: "#ffffff", align: "center" }),
      box(240, 1160, 600, 84, solid("#86efac"), { cornerRadius: 42, name: "Date bar" }),
      T(240, 1182, 600, "SAT 20:30 · NATIONAL STADIUM", 30, { weight: 800, color: "#04130c", align: "center" }),
    ]),
  },
  {
    id: "pro-travel-story", title: "Travel story", category: "Travel", tags: ["travel", "story", "island", "aerial", "tour", "excursion"],
    build: () => doc("story", solid("#0e7490"), [
      photo("aerial-lagoon", 0, 0, 1080, 1920, { adjust: { vibrance: 15 } }),
      box(0, 0, 1080, 700, lin(90, [[0, "#083344cc"], [1, "#08334400"]]), { name: "Shade" }),
      T(80, 160, 920, "DISCOVER", 48, { weight: 700, color: "#a5f3fc", ls: 14 }),
      T(80, 230, 920, "Hidden\nsandbanks", 150, { font: "Playfair Display", weight: 700, color: "#ffffff", lh: 1 }),
      box(80, 1560, 920, 240, solid("#ffffff"), { cornerRadius: 32, name: "Card" }),
      T(130, 1600, 600, "Half-day snorkel trip", 44, { weight: 700, color: "#083344" }),
      T(130, 1665, 600, "Turtles, reef sharks and lunch on a sandbank", 28, { color: "#475569" }),
      T(760, 1620, 190, "$75", 72, { font: "Oswald", weight: 700, color: "#0e7490", align: "right" }),
    ]),
  },
  {
    id: "pro-menu", title: "Restaurant menu (A4)", category: "Food", tags: ["menu", "restaurant", "cafe", "food", "print", "a4"],
    build: () => {
      const W = 2480, M = 200;
      const items: [string, string, string][] = [["Grilled reef fish", "Lime, chilli and garlic butter", "MVR 210"], ["Tuna mas huni", "With fresh roshi and black tea", "MVR 65"], ["Chicken curry", "Coconut, curry leaves, steamed rice", "MVR 140"], ["Garden salad", "Seasonal greens and citrus dressing", "MVR 95"], ["Coconut panna cotta", "Passion fruit and mint", "MVR 80"]];
      return doc("a4", solid("#fbf7f0"), [
        photo("brunch-table", 0, 0, W, 1200, { adjust: { vibrance: 12, contrast: 6 } }),
        box(0, 900, W, 300, lin(90, [[0, "#fbf7f000"], [1, "#fbf7f0"]]), { name: "Fade" }),
        T(M, 1180, W - 2 * M, "The Island Kitchen", 190, { font: "Playfair Display", weight: 700, color: "#2b1d16", align: "center" }),
        T(M, 1430, W - 2 * M, "LUNCH & DINNER MENU", 64, { weight: 600, color: "#b45309", align: "center", ls: 20 }),
        ...items.flatMap(([n, d, p], i) => [
          T(M + 60, 1680 + i * 330, 1500, n, 88, { font: "Playfair Display", weight: 700, color: "#2b1d16" }),
          T(M + 60, 1790 + i * 330, 1500, d, 54, { font: "Lora", italic: true, color: "#78716c" }),
          T(W - M - 560, 1690 + i * 330, 500, p, 80, { font: "Lora", weight: 600, color: "#b45309", align: "right" }),
        ]),
        box(M, 3360, W - 2 * M, 4, solid("#e7dccb"), { name: "Divider" }),
        T(M, 3390, W - 2 * M, "Majeedhee Magu, Malé  ·  +960 000 0000  ·  @islandkitchen", 50, { color: "#78716c", align: "center" }),
      ]);
    },
  },
  {
    id: "pro-corporate", title: "Corporate flyer (A4)", category: "Business", tags: ["corporate", "business", "flyer", "company", "services", "a4", "print"],
    build: () => {
      const W = 2480, M = 200;
      return doc("a4", solid("#ffffff"), [
        photo("city-skyline", 0, 0, W, 1500),
        box(0, 0, W, 1500, lin(90, [[0, "#0b1e3f55"], [1, "#0b1e3fdd"]]), { name: "Shade" }),
        T(M, 260, 1600, "YOUR COMPANY", 70, { weight: 700, color: "#93c5fd", ls: 14 }),
        T(M, 900, W - 2 * M, "Building the future\nof business", 190, { font: "Montserrat", weight: 800, color: "#ffffff", lh: 1.05 }),
        box(0, 1500, W, 140, solid("#2563eb"), { name: "Band" }),
        ...([["Strategy", "Clear plans that turn goals into results."], ["Design", "Brands and products people remember."], ["Technology", "Reliable systems that scale with you."]] as [string, string][]).flatMap(([h, d], i) => [
          box(M + i * 720, 1820, 80, 8, solid("#2563eb"), { name: "Accent" }),
          T(M + i * 720, 1870, 640, h, 96, { font: "Montserrat", weight: 700, color: "#0b1e3f" }),
          T(M + i * 720, 2010, 600, d, 56, { color: "#475569", lh: 1.45 }),
        ]),
        box(M, 2700, W - 2 * M, 520, solid("#f1f5f9"), { cornerRadius: 40, name: "Contact card" }),
        T(M + 100, 2800, 1300, "Let's talk", 110, { font: "Montserrat", weight: 800, color: "#0b1e3f" }),
        T(M + 100, 2960, 1400, "hello@yourcompany.mv  ·  +960 000 0000", 58, { color: "#475569" }),
        ...pill(W - M - 700, 2860, 600, 170, "#2563eb", "Book a call", "#ffffff", 64),
      ]);
    },
  },
  {
    id: "pro-slide-title", title: "Presentation title slide", category: "Presentation", tags: ["presentation", "slide", "pitch", "deck", "title", "16:9"],
    build: () => doc("pres", solid("#0b0f19"), [
      photo("snow-peaks", 860, 0, 1060, 1080, { adjust: { saturation: -20 } }),
      box(760, 0, 300, 1080, lin(0, [[0, "#0b0f19"], [1, "#0b0f1900"]]), { name: "Fade" }),
      box(120, 300, 12, 380, solid("#818cf8"), { name: "Accent bar" }),
      T(170, 300, 880, "Annual report\n2026", 96, { font: "Montserrat", weight: 800, color: "#ffffff", lh: 1.05 }),
      T(170, 560, 700, "Results, highlights and the road ahead", 40, { color: "#a5b4fc", lh: 1.35 }),
      T(170, 900, 760, "Your Company  ·  January 2027", 28, { weight: 600, color: "#64748b", ls: 2 }),
    ]),
  },
  {
    id: "pro-slide-content", title: "Presentation content slide", category: "Presentation", tags: ["presentation", "slide", "content", "agenda", "deck"],
    build: () => doc("pres", solid("#ffffff"), [
      T(120, 110, 1200, "Three priorities for next year", 72, { font: "Montserrat", weight: 800, color: "#0f172a" }),
      box(120, 230, 120, 8, solid("#4f46e5"), { name: "Accent" }),
      ...([["01", "Customers", "Faster replies and a better app experience."], ["02", "Growth", "Two new islands and online booking."], ["03", "Team", "Training and hiring for key roles."]] as [string, string, string][]).flatMap(([n, h, d], i) => [
        T(120, 340 + i * 220, 160, n, 80, { font: "Montserrat", weight: 800, color: "#c7d2fe" }),
        T(300, 345 + i * 220, 700, h, 50, { font: "Montserrat", weight: 700, color: "#0f172a" }),
        T(300, 415 + i * 220, 700, d, 32, { color: "#64748b" }),
      ]),
      photo("meeting-paperwork", 1120, 300, 680, 660, { radius: 32 }),
    ]),
  },
  {
    id: "pro-yt", title: "YouTube thumbnail", category: "Social media", tags: ["youtube", "thumbnail", "video", "vlog", "travel"],
    build: () => doc("yt-thumb", solid("#000000"), [
      photo("mountain-valley", 0, 0, 1280, 720, { adjust: { vibrance: 25, contrast: 15 } }),
      box(0, 0, 760, 720, lin(0, [[0, "#000000dd"], [1, "#00000000"]]), { name: "Shade" }),
      T(60, 140, 700, "I HIKED", 140, { font: "Bebas Neue", color: "#ffffff" }),
      T(60, 270, 700, "FOR 7 DAYS", 170, { font: "Bebas Neue", color: "#facc15" }),
      box(60, 500, 360, 90, solid("#ef4444"), { cornerRadius: 12, name: "Label" }),
      T(60, 520, 360, "FULL STORY", 48, { font: "Oswald", weight: 700, color: "#ffffff", align: "center" }),
    ]),
  },
  {
    id: "pro-fb-cover", title: "Facebook cover", category: "Social media", tags: ["facebook", "cover", "banner", "page", "beach"],
    build: () => doc("fb-cover", solid("#000000"), [
      photo("beach-dusk", 0, 0, 1640, 624, { focusY: 0.55, adjust: { vibrance: 15 } }),
      box(0, 0, 1640, 624, lin(0, [[0, "#0f172af0"], [0.45, "#0f172acc"], [0.8, "#0f172a00"]]), { name: "Shade" }),
      T(110, 210, 900, "Sun Island Dive Centre", 76, { font: "Playfair Display", weight: 700, color: "#ffffff" }),
      T(110, 320, 900, "PADI courses · Reef trips · Equipment rental", 32, { color: "#e2e8f0" }),
    ]),
  },
  {
    id: "pro-collection", title: "New collection", category: "Business", tags: ["fashion", "collection", "launch", "gradient", "product", "square"],
    build: () => doc("ig-square", solid("#1e1b4b"), [
      photo("abstract-violet", 0, 0, 1080, 1080),
      photo("fashion-store", 160, 300, 760, 520, { radius: 24, adjust: { saturation: -10 } }),
      T(80, 110, 920, "NEW COLLECTION", 92, { font: "Bebas Neue", color: "#ffffff", align: "center", ls: 4 }),
      T(80, 870, 920, "Summer 2026 · In stores now", 40, { weight: 600, color: "#f5d0fe", align: "center" }),
    ]),
  },
];

export { newId };
