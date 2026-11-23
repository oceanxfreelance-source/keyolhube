// Built-in templates: real, fully editable documents (shapes, text, photo frames). Photo areas
// are frames: select one and use "Put a photo in this shape". Dhivehi wording is placeholder
// text for the user to replace.
import { make, newDoc, newId, solid } from "../doc/factory";
import type { DesignDoc, DesignNode, Fill, GroupNode, RectNode, TextNode } from "../doc/types";
import { PRESETS } from "../presets";
import { buildKit } from "../apparel/garments";
import { PRO_TEMPLATES } from "./pro";
import { GENERATED_TEMPLATES } from "./generated";
import { SPORTS_TEMPLATES } from "./sports";
import { CERTIFICATE_TEMPLATES } from "./certificates";
import { ELECTION_TEMPLATES } from "./election";

export type Template = { id: string; title: string; category: string; tags: string[]; format?: string; build: () => DesignDoc };

const lin = (angle: number, a: string, b: string): Fill => ({ type: "linear", angle, stops: [{ offset: 0, color: a }, { offset: 1, color: b }] });

function text(x: number, y: number, w: number, t: string, size: number, o: Partial<TextNode> = {}): TextNode {
  const n = make.text(x, y, t, size, w);
  Object.assign(n, { name: t.slice(0, 30) }, o);
  return n;
}
function rect(x: number, y: number, w: number, h: number, fill: Fill, o: Partial<RectNode> = {}): RectNode {
  return { ...make.rect(x, y, w, h), fill, name: "Rectangle", ...o };
}
/** A photo frame: a placeholder shape the user fills with their own photo. */
function frame(x: number, y: number, w: number, h: number, shape: "rect" | "circle", fill = "#cbd5e1", radius = 0): DesignNode {
  return shape === "circle"
    ? { ...make.ellipse(x, y, w, h, fill), name: "Photo frame" }
    : { ...make.rect(x, y, w, h, fill), cornerRadius: radius, name: "Photo frame" };
}
function group(name: string, children: DesignNode[]): GroupNode {
  const x = Math.min(...children.map((c) => c.x)), y = Math.min(...children.map((c) => c.y));
  const r = Math.max(...children.map((c) => c.x + c.width)), b = Math.max(...children.map((c) => c.y + c.height));
  return { id: newId(), name, type: "group", x, y, width: r - x, height: b - y, rotation: 0, opacity: 1, visible: true, locked: false, blendMode: "source-over", shadow: null,
    children: children.map((c) => ({ ...c, x: c.x - x, y: c.y - y })) };
}
function docFor(presetId: string, bg: Fill, children: DesignNode[]): DesignDoc {
  const p = PRESETS.find((x) => x.id === presetId)!;
  const d = newDoc(p.width, p.height, p.dpi, p.unit);
  d.pages[0].background = bg;
  d.pages[0].children = children;
  return d;
}
const TH = "Noto Sans Thaana";

export const BUILTIN_TEMPLATES: Template[] = [
  {
    id: "election-poster-dv", title: "Election poster (Dhivehi)", category: "Election", tags: ["election", "campaign", "dhivehi", "poster", "a3", "candidate", "ދިވެހި"],
    build: () => {
      const W = 3508, H = 4961; // A3 at 300 DPI
      return docFor("a3", lin(90, "#0b3d91", "#06204f"), [
        rect(0, H * 0.62, W, H * 0.38, lin(0, "#f2b705", "#f28705"), { name: "Colour band" }),
        { ...make.ellipse(W * 0.5 - 1250, 520, 2500, 2500, "#ffffff"), name: "Photo ring" },
        frame(W * 0.5 - 1150, 620, 2300, 2300, "circle"),
        text(200, 3150, W - 400, "ކެނޑިޑޭޓްގެ ނަން", 300, { fontFamily: TH, fontWeight: 800, align: "center", fill: solid("#ffffff") }),
        text(200, 3600, W - 400, "ޝިޢާރު މިތާ ލިޔޭ", 170, { fontFamily: TH, fontWeight: 600, align: "center", fill: solid("#06204f") }),
        group("Number badge", [
          { ...make.ellipse(W - 900, 300, 600, 600, "#f2b705"), stroke: { color: "#ffffff", width: 24 } },
          text(W - 900, 420, 600, "1", 340, { fontWeight: 800, align: "center", fill: solid("#06204f") }),
        ]),
        text(200, 4250, W - 400, "ވޯޓު ދެއްވާ", 260, { fontFamily: TH, fontWeight: 800, align: "center", fill: solid("#ffffff") }),
        text(200, 4650, W - 400, "Campaign name · 2028", 90, { fontWeight: 600, align: "center", fill: solid("#06204f"), letterSpacing: 6 }),
      ]);
    },
  },
  {
    id: "election-social-dv", title: "Campaign social post (Dhivehi)", category: "Election", tags: ["election", "campaign", "dhivehi", "instagram", "social", "ދިވެހި"],
    build: () => docFor("ig-post", solid("#f8fafc"), [
      rect(0, 0, 1080, 760, lin(120, "#0f766e", "#134e4a"), { name: "Top panel" }),
      frame(240, 120, 600, 600, "circle"),
      { ...make.ellipse(220, 100, 640, 640, "#000000"), fill: { type: "none" }, stroke: { color: "#facc15", width: 14 }, name: "Ring" },
      text(60, 800, 960, "ކެނޑިޑޭޓްގެ ނަން", 86, { fontFamily: TH, fontWeight: 800, align: "center", fill: solid("#134e4a") }),
      text(60, 930, 960, "ޝިޢާރު މިތާ ލިޔޭ", 46, { fontFamily: TH, fontWeight: 500, align: "center", fill: solid("#334155") }),
      rect(340, 1060, 400, 120, solid("#facc15"), { cornerRadius: 60, name: "Button" }),
      text(340, 1088, 400, "ވޯޓު ދެއްވާ", 52, { fontFamily: TH, fontWeight: 800, align: "center", fill: solid("#134e4a") }),
      text(60, 1240, 960, "#Campaign2028", 34, { fontWeight: 600, align: "center", fill: solid("#0f766e") }),
    ]),
  },
  {
    id: "meeting-dv-en", title: "Meeting announcement (Dhivehi + English)", category: "Election", tags: ["meeting", "announcement", "story", "dhivehi", "english", "ބައްދަލުވުން"],
    build: () => docFor("story", lin(90, "#1e1b4b", "#4c1d95"), [
      text(80, 220, 920, "ބައްދަލުވުން", 150, { fontFamily: TH, fontWeight: 800, align: "center", fill: solid("#ffffff") }),
      text(80, 430, 920, "PUBLIC MEETING", 64, { fontWeight: 800, align: "center", fill: solid("#fbbf24"), letterSpacing: 12 }),
      frame(140, 620, 800, 520, "rect", "#a5b4fc", 40),
      group("Details", [
        rect(80, 1220, 920, 460, solid("#ffffff"), { cornerRadius: 36, opacity: 0.12 }),
        text(140, 1270, 800, "ތާރީޚު: ‎— / — / 2028", 54, { fontFamily: TH, fontWeight: 600, align: "right", fill: solid("#ffffff") }),
        text(140, 1380, 800, "ގަޑި: ‎—:—", 54, { fontFamily: TH, fontWeight: 600, align: "right", fill: solid("#ffffff") }),
        text(140, 1490, 800, "ތަން: —", 54, { fontFamily: TH, fontWeight: 600, align: "right", fill: solid("#ffffff") }),
      ]),
      text(80, 1760, 920, "Everyone is welcome", 44, { fontWeight: 500, align: "center", fill: solid("#e9d5ff") }),
    ]),
  },
  {
    id: "sale-post", title: "Sale post", category: "Business", tags: ["sale", "promo", "discount", "shop", "instagram", "square"],
    build: () => docFor("ig-square", solid("#fff7ed"), [
      { ...make.ellipse(560, -180, 760, 760, "#fb923c"), name: "Blob" },
      { ...make.ellipse(-220, 700, 600, 600, "#fdba74"), name: "Blob" },
      frame(560, 380, 440, 560, "rect", "#fed7aa", 32),
      text(80, 140, 520, "BIG", 120, { fontFamily: "Bebas Neue", fill: solid("#7c2d12") }),
      text(80, 250, 520, "SALE", 220, { fontFamily: "Bebas Neue", fill: solid("#ea580c") }),
      text(80, 480, 460, "Up to 50% off everything this weekend only.", 40, { fontFamily: "Poppins", fill: solid("#7c2d12"), lineHeight: 1.35 }),
      rect(80, 700, 340, 100, solid("#7c2d12"), { cornerRadius: 50, name: "Button" }),
      text(80, 725, 340, "Shop now", 40, { fontFamily: "Poppins", fontWeight: 600, align: "center", fill: solid("#ffffff") }),
      text(80, 960, 920, "@yourshop · Malé", 30, { fontFamily: "Poppins", fill: solid("#9a3412") }),
    ]),
  },
  {
    id: "event-flyer", title: "Event flyer", category: "Events", tags: ["event", "flyer", "party", "concert", "a4", "poster"],
    build: () => {
      const W = 2480;
      return docFor("a4", lin(135, "#0f172a", "#1e293b"), [
        { ...make.star(W - 900, 260, 700, "#22d3ee"), opacity: 0.25, name: "Star" },
        frame(160, 520, W - 320, 1500, "rect", "#334155", 60),
        text(160, 2120, W - 320, "SUMMER NIGHTS", 260, { fontFamily: "Oswald", fontWeight: 700, fill: solid("#ffffff") }),
        text(160, 2470, W - 320, "Live music · Food · Fireworks", 100, { fontFamily: "Montserrat", fontWeight: 500, fill: solid("#22d3ee") }),
        rect(160, 2800, W - 320, 4, solid("#334155"), { name: "Divider" }),
        text(160, 2900, 1000, "SAT 12 JULY\n7 PM ONWARDS", 90, { fontFamily: "Montserrat", fontWeight: 700, fill: solid("#ffffff"), lineHeight: 1.3 }),
        text(1300, 2900, 1020, "Artificial Beach\nMalé", 90, { fontFamily: "Montserrat", fontWeight: 500, align: "right", fill: solid("#cbd5e1"), lineHeight: 1.3 }),
      ]);
    },
  },
  {
    id: "menu", title: "Restaurant menu", category: "Food", tags: ["menu", "restaurant", "cafe", "food", "a4"],
    build: () => {
      const W = 2480;
      const items: [string, string][] = [["Mas huni & roshi", "MVR 45"], ["Garudhiya with rice", "MVR 85"], ["Tuna curry", "MVR 95"], ["Grilled reef fish", "MVR 160"], ["Fresh coconut", "MVR 30"]];
      return docFor("a4", solid("#fdf8f0"), [
        text(200, 260, W - 400, "The Island Kitchen", 200, { fontFamily: "Playfair Display", fontWeight: 700, align: "center", fill: solid("#3f2d20") }),
        text(200, 560, W - 400, "MENU", 90, { fontFamily: "Montserrat", fontWeight: 600, align: "center", fill: solid("#b45309"), letterSpacing: 30 }),
        rect(W / 2 - 200, 720, 400, 6, solid("#b45309"), { name: "Divider" }),
        ...items.flatMap(([name, price], i) => [
          text(260, 950 + i * 380, 1400, name, 96, { fontFamily: "Lora", fontWeight: 600, fill: solid("#3f2d20") }),
          text(1700, 950 + i * 380, 520, price, 96, { fontFamily: "Lora", align: "right", fill: solid("#b45309") }),
          text(260, 1080 + i * 380, 1400, "Short description of the dish", 56, { fontFamily: "Lora", italic: true, fill: solid("#78716c") }),
        ]),
      ]);
    },
  },
  {
    id: "business-card", title: "Business card", category: "Business", tags: ["business card", "card", "print", "contact", "brand"],
    build: () => {
      const H = 650;
      return docFor("card", solid("#ffffff"), [
        rect(0, 0, 360, H, lin(90, "#4f46e5", "#7c3aed"), { name: "Side panel" }),
        { ...make.polygon(110, 210, 140, 6, "#ffffff"), name: "Logo mark" },
        text(420, 150, 600, "Your Name", 72, { fontFamily: "Montserrat", fontWeight: 700, fill: solid("#111827") }),
        text(420, 250, 600, "Graphic Designer", 40, { fontFamily: "Montserrat", fill: solid("#4f46e5") }),
        text(420, 380, 600, "+960 000 0000\nhello@yourstudio.mv\nMalé, Maldives", 32, { fontFamily: "Inter", fill: solid("#4b5563"), lineHeight: 1.5 }),
      ]);
    },
  },
  {
    id: "yt-thumb", title: "YouTube thumbnail", category: "Social media", tags: ["youtube", "thumbnail", "video", "vlog"],
    build: () => docFor("yt-thumb", lin(0, "#dc2626", "#7f1d1d"), [
      frame(700, 0, 580, 720, "rect", "#fca5a5"),
      text(60, 120, 700, "HOW I", 130, { fontFamily: "Bebas Neue", fill: solid("#ffffff") }),
      text(60, 250, 700, "DID IT", 230, { fontFamily: "Bebas Neue", fill: solid("#fde047"), stroke: { color: "#000000", width: 8, join: "round" } }),
      rect(60, 520, 380, 90, solid("#000000"), { cornerRadius: 12, name: "Label" }),
      text(60, 540, 380, "FULL GUIDE", 48, { fontFamily: "Oswald", fontWeight: 700, align: "center", fill: solid("#ffffff") }),
    ]),
  },
  {
    id: "quote", title: "Quote post", category: "Social media", tags: ["quote", "motivation", "instagram", "square", "text"],
    build: () => docFor("ig-square", lin(160, "#ecfeff", "#cffafe"), [
      text(120, 120, 300, "“", 360, { fontFamily: "Playfair Display", fontWeight: 700, fill: solid("#0891b2") }),
      text(120, 380, 840, "The sea, once it casts its spell, holds one in its net of wonder forever.", 64, { fontFamily: "Playfair Display", italic: true, fill: solid("#164e63"), lineHeight: 1.3 }),
      rect(120, 820, 120, 6, solid("#0891b2"), { name: "Divider" }),
      text(120, 860, 840, "Jacques Cousteau", 40, { fontFamily: "Montserrat", fontWeight: 600, fill: solid("#0e7490") }),
    ]),
  },
  {
    id: "certificate", title: "Certificate", category: "Education", tags: ["certificate", "award", "school", "a4", "landscape"],
    build: () => {
      const W = 3508, H = 2480;
      const d = newDoc(W, H, 300, "mm");
      d.pages[0].background = solid("#fffdf7");
      d.pages[0].children = [
        { ...make.rect(80, 80, W - 160, H - 160), fill: { type: "none" }, stroke: { color: "#b8860b", width: 16 }, name: "Border" },
        { ...make.rect(130, 130, W - 260, H - 260), fill: { type: "none" }, stroke: { color: "#b8860b", width: 4 }, name: "Inner border" },
        text(300, 380, W - 600, "CERTIFICATE", 200, { fontFamily: "Playfair Display", fontWeight: 700, align: "center", fill: solid("#3f2d20"), letterSpacing: 20 }),
        text(300, 640, W - 600, "OF ACHIEVEMENT", 80, { fontFamily: "Montserrat", fontWeight: 600, align: "center", fill: solid("#b8860b"), letterSpacing: 24 }),
        text(300, 920, W - 600, "This is proudly presented to", 70, { fontFamily: "Lora", italic: true, align: "center", fill: solid("#57534e") }),
        text(300, 1080, W - 600, "Recipient Name", 220, { fontFamily: "Dancing Script", fontWeight: 700, align: "center", fill: solid("#1c1917") }),
        text(500, 1450, W - 1000, "for outstanding performance and dedication.", 70, { fontFamily: "Lora", align: "center", fill: solid("#57534e") }),
        rect(500, 1950, 800, 4, solid("#57534e"), { name: "Signature line" }),
        text(500, 1990, 800, "Signature", 56, { fontFamily: "Montserrat", align: "center", fill: solid("#57534e") }),
        rect(W - 1300, 1950, 800, 4, solid("#57534e"), { name: "Date line" }),
        text(W - 1300, 1990, 800, "Date", 56, { fontFamily: "Montserrat", align: "center", fill: solid("#57534e") }),
      ];
      return d;
    },
  },
];

BUILTIN_TEMPLATES.push(
  { id: "kit-football", title: "Football kit (shirt + shorts)", category: "Apparel", tags: ["jersey", "football", "soccer", "kit", "team", "sports", "uniform", "shorts"], build: () => buildKit("football") },
  { id: "kit-basketball", title: "Basketball jersey", category: "Apparel", tags: ["jersey", "basketball", "team", "sports", "uniform"], build: () => buildKit("basketball", { primary: "#7c3aed", secondary: "#facc15", accent: "#ffffff" }, "solid") },
  { id: "kit-tshirt", title: "T-shirt", category: "Apparel", tags: ["t-shirt", "tshirt", "shirt", "apparel", "merch", "event"], build: () => buildKit("tshirt", { primary: "#111827", secondary: "#22d3ee", accent: "#ffffff" }, "chevron") },
);

// Professional photo templates first; retire the simpler versions they replace.
{
  const replaced = new Set(["sale-post", "event-flyer", "menu", "yt-thumb", "quote"]);
  const kept = BUILTIN_TEMPLATES.filter((t) => !replaced.has(t.id));
  BUILTIN_TEMPLATES.length = 0;
  BUILTIN_TEMPLATES.push(...PRO_TEMPLATES, ...SPORTS_TEMPLATES, ...CERTIFICATE_TEMPLATES, ...ELECTION_TEMPLATES, ...kept, ...GENERATED_TEMPLATES);
}

const ORDER = ["Social media", "Business", "Sports", "Certificates", "Election", "Food", "Travel", "Events", "Education", "Presentation", "Apparel"];
export const TEMPLATE_CATEGORIES = [...new Set(BUILTIN_TEMPLATES.map((t) => t.category))].sort((a, b) => (ORDER.indexOf(a) + 99) % 99 - (ORDER.indexOf(b) + 99) % 99);
