// Layered certificate templates (A4 landscape, 300 DPI): ornate borders, seals, ribbons, signatures.
// Designed on a 1123 × 794 grid and scaled up to print resolution.
import { bakeScale } from "../doc/ops";
import type { DesignNode } from "../doc/types";
import type { Template } from "./builtin";
import { alpha, circle, docOf, dots, fit, icon, lg, line, path, pillLabel, polygon, portraitFrame, rect, ring, seal, star, stripes } from "./kit";
import { T } from "./pro";

type CP = { id: string; name: string; paper: string; ink: string; gold: string; deep: string; soft: string };
const PALS: CP[] = [
  { id: "navy-gold", name: "Navy and gold", paper: "#fbf8f1", ink: "#14213d", gold: "#c9a227", deep: "#14213d", soft: "#e9e2cf" },
  { id: "green-gold", name: "Green and gold", paper: "#f9faf5", ink: "#163a2b", gold: "#bf9b30", deep: "#1f5139", soft: "#dfe7d8" },
  { id: "burgundy", name: "Burgundy and silver", paper: "#fdf9f8", ink: "#3d0f1c", gold: "#a8a9ad", deep: "#6b1a2f", soft: "#eedfe2" },
  { id: "blue-teal", name: "Blue and teal", paper: "#f7fbfc", ink: "#0b2545", gold: "#13a89e", deep: "#134074", soft: "#d7e8ef" },
  { id: "black-gold", name: "Black and gold", paper: "#111111", ink: "#f5f0e1", gold: "#d4af37", deep: "#1c1c1c", soft: "#2b2b2b" },
];
const BW = 1123, BH = 794;
const CZ = "Cinzel", GV = "Great Vibes", MS = "Montserrat", CG = "Cormorant Garamond";

function signatures(p: CP, y: number, left = "Mohamed Ali", lt = "Director", right = "Fathimath Hassan", rt = "Programme Manager", x1 = 150, x2 = BW - 400): DesignNode[] {
  return [[x1, left, lt], [x2, right, rt]].flatMap(([x, n, t]) => [
    T(x as number, y - 46, 250, "Signature", 30, { font: GV, color: alpha(p.ink, 0.35), align: "center", name: "Signature placeholder" }),
    line(x as number, y, (x as number) + 250, y, p.ink, 1.2),
    T(x as number, y + 10, 250, n as string, 15, { font: MS, weight: 700, color: p.ink, align: "center", name: "Signer name" }),
    T(x as number, y + 32, 250, t as string, 12, { font: MS, color: alpha(p.ink, 0.7), align: "center", ls: 1, name: "Signer title" }),
  ]);
}
function cornerOrnament(x: number, y: number, sx: number, sy: number, c: string): DesignNode[] {
  return [
    polygon(x + sx * 18, y + sy * 18, 22, 4, c, { name: "Corner diamond" }),
    line(x + sx * 36, y + sy * 18, x + sx * 110, y + sy * 18, c, 1.5), line(x + sx * 18, y + sy * 36, x + sx * 18, y + sy * 110, c, 1.5),
    circle(x + sx * 118, y + sy * 18, 6, c, { name: "Corner dot" }), circle(x + sx * 18, y + sy * 118, 6, c, { name: "Corner dot" }),
  ];
}
const nameBlock = (p: CP, y: number, x = 120, w = BW - 240, name = "Aisha Mohamed", color = p.ink, size = 84): DesignNode[] => [
  fit(x, y, w, name, size, { font: GV, color, align: "center", name: "Recipient name" }),
  line(x + w * 0.2, y + size * 1.15, x + w * 0.8, y + size * 1.15, p.gold, 1.5),
];

type Ctx = { p: CP };
const D: Record<string, { title: string; tags: string[]; build: (c: Ctx) => { bg: string; nodes: DesignNode[] } }> = {
  classic: { title: "Certificate of achievement", tags: ["achievement", "classic", "gold", "award"], build: ({ p }) => ({ bg: p.paper, nodes: [
    rect(22, 22, BW - 44, BH - 44, { type: "none" }, { stroke: { color: p.gold, width: 7 }, name: "Outer border" }),
    rect(40, 40, BW - 80, BH - 80, { type: "none" }, { stroke: { color: p.gold, width: 1.5 }, name: "Inner border" }),
    rect(48, 48, BW - 96, BH - 96, { type: "none" }, { stroke: { color: alpha(p.gold, 0.5), width: 0.8, dash: [3, 4] }, name: "Dotted border" }),
    ...cornerOrnament(48, 48, 1, 1, p.gold), ...cornerOrnament(BW - 48, 48, -1, 1, p.gold), ...cornerOrnament(48, BH - 48, 1, -1, p.gold), ...cornerOrnament(BW - 48, BH - 48, -1, -1, p.gold),
    star(BW / 2, 96, 26, 5, 0.45, p.gold, { name: "Top star" }), line(BW / 2 - 120, 96, BW / 2 - 24, 96, p.gold, 1.2), line(BW / 2 + 24, 96, BW / 2 + 120, 96, p.gold, 1.2),
    T(100, 122, BW - 200, "CERTIFICATE", 64, { font: CZ, weight: 700, color: p.ink, align: "center", ls: 12, name: "Title" }),
    line(BW / 2 - 250, 225, BW / 2 - 140, 225, p.gold, 1.5), line(BW / 2 + 140, 225, BW / 2 + 250, 225, p.gold, 1.5),
    T(BW / 2 - 140, 212, 280, "OF ACHIEVEMENT", 20, { font: CZ, weight: 700, color: p.gold, align: "center", ls: 6, name: "Subtitle" }),
    T(100, 272, BW - 200, "This certificate is proudly presented to", 22, { font: CG, weight: 600, italic: true, color: alpha(p.ink, 0.8), align: "center", name: "Presented to" }),
    ...nameBlock(p, 312),
    T(220, 450, BW - 440, "In recognition of outstanding dedication, hard work and excellent results throughout the 2026 academic year.", 16, { font: MS, color: alpha(p.ink, 0.8), align: "center", lh: 1.6, name: "Description" }),
    ...signatures(p, 640),
    ...seal(BW / 2, 620, 130, p.gold, p.deep, "2026", "AWARD"),
    T(BW / 2 - 150, 715, 300, "Malé, 14 December 2026", 12, { font: MS, color: alpha(p.ink, 0.6), align: "center", ls: 1, name: "Date" }),
  ] }) },
  modern: { title: "Certificate of completion", tags: ["completion", "course", "training", "modern"], build: ({ p }) => ({ bg: p.paper, nodes: [
    rect(0, 0, 300, BH, p.deep, { name: "Side band" }),
    stripes(0, 0, 300, BH, 34, 10, p.gold, -35, 0.18),
    rect(300, 0, 10, BH, p.gold, { name: "Gold rule" }),
    circle(150, 150, 120, p.paper, { name: "Logo circle" }), T(90, 136, 120, "LOGO", 22, { font: MS, weight: 800, color: p.deep, align: "center", ls: 3, name: "Logo placeholder" }),
    icon("Award", 100, 520, 100, p.gold, 1.6),
    T(40, 650, 220, "CERT. NO. 2026-0148", 12, { font: MS, weight: 600, color: alpha("#ffffff", 0.7), align: "center", ls: 2, name: "Certificate number" }),
    T(380, 110, 680, "CERTIFICATE", 62, { font: MS, weight: 800, color: p.ink, ls: 10, name: "Title" }),
    T(384, 186, 600, "of Completion", 54, { font: GV, color: p.gold, name: "Subtitle" }),
    T(384, 290, 600, "THIS IS TO CERTIFY THAT", 14, { font: MS, weight: 700, color: alpha(p.ink, 0.6), ls: 4, name: "Certify" }),
    fit(384, 318, 660, "Ibrahim Rasheed", 64, { font: MS, weight: 700, color: p.ink, name: "Recipient name" }),
    rect(384, 410, 120, 5, p.gold, { name: "Accent bar" }),
    T(384, 440, 640, "has successfully completed the 40-hour course in Graphic Design Fundamentals, including typography, layout and colour theory.", 16, { font: MS, color: alpha(p.ink, 0.8), lh: 1.6, name: "Description" }),
    ...signatures(p, 660, "Mohamed Ali", "Lead Instructor", "Aminath Zahir", "Academy Director", 384, 760),
  ] }) },
  geometric: { title: "Certificate of excellence", tags: ["excellence", "geometric", "corporate", "award"], build: ({ p }) => ({ bg: p.paper, nodes: [
    path("M0 0H380L0 260Z", 0, 0, 380, 260, 380, 260, p.deep, null, "Corner shape"),
    path("M0 0H230L0 400Z", 0, 0, 230, 400, 230, 400, alpha(p.gold, 0.9), null, "Corner shape"),
    path("M0 0H120L0 120Z", 0, 0, 120, 120, 120, 120, p.soft, null, "Corner shape"),
    path("M380 260H0L380 0Z", BW - 380, BH - 260, 380, 260, 380, 260, p.deep, null, "Corner shape"),
    path("M230 400H0L230 0Z", BW - 230, BH - 400, 230, 400, 230, 400, alpha(p.gold, 0.9), null, "Corner shape"),
    dots(BW - 220, 60, 7, 5, 22, 6, p.gold, 0.6), dots(80, BH - 160, 7, 5, 22, 6, p.gold, 0.6),
    T(150, 120, BW - 300, "CERTIFICATE", 70, { font: CZ, weight: 700, color: p.ink, align: "center", ls: 10, name: "Title" }),
    ...pillLabel(BW / 2 - 140, 210, "OF EXCELLENCE", 16, p.deep, "#ffffff", MS, 700, 1.4, 5),
    T(150, 285, BW - 300, "PROUDLY PRESENTED TO", 15, { font: MS, weight: 700, color: alpha(p.ink, 0.6), align: "center", ls: 5, name: "Presented to" }),
    ...nameBlock(p, 318),
    T(240, 455, BW - 480, "For exceptional performance and leadership as Team Lead of the Year 2026.", 16, { font: MS, color: alpha(p.ink, 0.8), align: "center", lh: 1.6, name: "Description" }),
    ...signatures(p, 650, "Mohamed Ali", "CEO", "Fathimath Hassan", "HR Manager", 200, BW - 450),
    ...seal(BW / 2, 625, 120, p.gold, p.deep, "BEST", "2026"),
  ] }) },
  sports: { title: "Sports award certificate", tags: ["sports", "award", "trophy", "tournament", "best player"], build: ({ p }) => {
    const dark = p.id === "black-gold" ? p.paper : p.deep; const gold = p.gold;
    return { bg: dark, nodes: [
      rect(0, 0, BW, BH, lg(135, [0, dark], [1, alpha("#000000", 0.6)]), { name: "Shade" }),
      stripes(0, 0, BW, BH, 70, 2, gold, -30, 0.18),
      rect(26, 26, BW - 52, BH - 52, { type: "none" }, { stroke: { color: gold, width: 3 }, name: "Border" }),
      circle(BW / 2, 130, 120, gold, { name: "Trophy badge" }), ring(BW / 2, 130, 146, gold, 2),
      icon("Trophy", BW / 2 - 34, 96, 68, dark, 2),
      T(100, 210, BW - 200, "AWARD OF EXCELLENCE", 52, { font: CZ, weight: 700, color: "#ffffff", align: "center", ls: 6, name: "Title" }),
      T(100, 285, BW - 200, "BEST PLAYER · ISLAND PREMIER LEAGUE 2026", 15, { font: MS, weight: 700, color: gold, align: "center", ls: 4, name: "Award" }),
      ...nameBlock({ ...p, ink: "#ffffff" }, 330, 120, BW - 240, "Adam Rasheed", gold, 88),
      T(240, 470, BW - 480, "For outstanding skill, sportsmanship and 12 goals across the season.", 16, { font: MS, color: alpha("#ffffff", 0.85), align: "center", lh: 1.6, name: "Description" }),
      ...[0, 1, 2, 3, 4].map((i) => star(BW / 2 - 100 + i * 50, 560, 30, 5, 0.45, gold, { name: "Star" })),
      ...signatures({ ...p, ink: "#ffffff" }, 680, "Hassan Saeed", "Head Coach", "Ali Waheed", "League President"),
    ] };
  } },
  appreciation: { title: "Certificate of appreciation", tags: ["appreciation", "thank you", "volunteer", "waves"], build: ({ p }) => ({ bg: p.paper, nodes: [
    path("M0 0H1123V120C900 190 700 60 480 120S120 170 0 110Z", 0, 0, BW, 190, 1123, 190, p.deep, null, "Top wave"),
    path("M0 0H1123V80C900 150 700 30 480 90S120 140 0 70Z", 0, 0, BW, 150, 1123, 150, alpha(p.gold, 0.85), null, "Top wave accent"),
    path("M0 190V70C200 0 420 120 640 70S1000 0 1123 60V190Z", 0, BH - 190, BW, 190, 1123, 190, p.deep, null, "Bottom wave"),
    path("M0 150V90C220 30 420 140 640 90S1000 30 1123 80V150Z", 0, BH - 150, BW, 150, 1123, 150, alpha(p.gold, 0.85), null, "Bottom wave accent"),
    T(100, 170, BW - 200, "CERTIFICATE", 60, { font: CZ, weight: 700, color: p.ink, align: "center", ls: 10, name: "Title" }),
    T(100, 240, BW - 200, "of Appreciation", 48, { font: GV, color: p.gold, align: "center", name: "Subtitle" }),
    T(100, 320, BW - 200, "WITH SINCERE THANKS TO", 15, { font: MS, weight: 700, color: alpha(p.ink, 0.6), align: "center", ls: 5, name: "Thanks to" }),
    ...nameBlock(p, 345),
    T(230, 480, BW - 460, "For your generous time and support as a volunteer at the Reef Clean-up 2026.", 16, { font: MS, color: alpha(p.ink, 0.8), align: "center", lh: 1.6, name: "Description" }),
    ...signatures(p, 600, "Mohamed Ali", "Chairperson", "Aminath Zahir", "Volunteer Lead", 170, BW - 420),
    icon("HandHeart", BW / 2 - 30, 560, 60, p.gold, 1.6),
  ] }) },
  employee: { title: "Employee of the month", tags: ["employee", "staff", "month", "corporate", "recognition"], build: ({ p }) => ({ bg: p.paper, nodes: [
    rect(0, 0, BW, BH, p.paper, { name: "Paper" }),
    rect(0, 0, 420, BH, p.soft, { name: "Panel" }),
    ...portraitFrame(90, 150, 240, 240, "circle", p.deep, p.gold),
    ring(210, 270, 270, p.gold, 4), ring(210, 270, 300, alpha(p.gold, 0.4), 1.5),
    polygon(210, 470, 90, 3, p.deep, { rotation: 0, name: "Ribbon" }),
    ...pillLabel(110, 420, "SEPTEMBER 2026", 14, p.deep, "#ffffff", MS, 700, 1.6, 3),
    T(60, 520, 300, "Customer Service Team", 16, { font: MS, weight: 600, color: p.ink, align: "center", name: "Department" }),
    T(480, 120, 580, "EMPLOYEE", 64, { font: MS, weight: 800, color: p.ink, ls: 8, name: "Title" }),
    T(482, 200, 580, "of the Month", 56, { font: GV, color: p.gold, name: "Subtitle" }),
    rect(482, 300, 90, 5, p.gold, { name: "Accent bar" }),
    fit(480, 330, 580, "Mariyam Shifza", 56, { font: MS, weight: 700, color: p.ink, name: "Recipient name" }),
    T(482, 420, 560, "Thank you for your positive attitude, teamwork and for going the extra mile for every customer.", 16, { font: MS, color: alpha(p.ink, 0.8), lh: 1.6, name: "Description" }),
    ...signatures(p, 640, "Mohamed Ali", "General Manager", "Fathimath Hassan", "HR Manager", 470, 790),
    star(BW - 80, 80, 70, 8, 0.5, p.gold, { name: "Star" }),
  ] }) },
  dhivehi: { title: "Certificate (Dhivehi + English)", tags: ["dhivehi", "ދިވެހި", "certificate", "bilingual", "school"], build: ({ p }) => ({ bg: p.paper, nodes: [
    rect(22, 22, BW - 44, BH - 44, { type: "none" }, { stroke: { color: p.deep, width: 6 }, name: "Outer border" }),
    rect(38, 38, BW - 76, BH - 76, { type: "none" }, { stroke: { color: p.gold, width: 2 }, name: "Inner border" }),
    ...cornerOrnament(38, 38, 1, 1, p.gold), ...cornerOrnament(BW - 38, 38, -1, 1, p.gold), ...cornerOrnament(38, BH - 38, 1, -1, p.gold), ...cornerOrnament(BW - 38, BH - 38, -1, -1, p.gold),
    T(100, 95, BW - 200, "ޝަހާދަތްނާމާ", 70, { font: "Noto Sans Thaana", weight: 800, color: p.ink, align: "center", name: "Title (Dhivehi)" }),
    T(100, 200, BW - 200, "CERTIFICATE", 30, { font: CZ, weight: 700, color: p.gold, align: "center", ls: 10, name: "Title (English)" }),
    T(100, 270, BW - 200, "ކެނޑިޑޭޓްގެ ނަން", 46, { font: "Noto Sans Thaana", weight: 700, color: p.deep, align: "center", name: "Name (Dhivehi)" }),
    ...nameBlock(p, 340, 120, BW - 240, "Aisha Mohamed", p.ink, 70),
    T(200, 460, BW - 400, "In recognition of excellent results in the 2026 school year.", 16, { font: MS, color: alpha(p.ink, 0.8), align: "center", lh: 1.6, name: "Description" }),
    ...signatures(p, 640, "Mohamed Ali", "Principal", "Aminath Zahir", "Class Teacher"),
    ...seal(BW / 2, 625, 120, p.gold, p.deep, "2026", "SCHOOL"),
  ] }) },
  kids: { title: "Kids superstar award", tags: ["kids", "school", "student", "star", "children", "award"], build: ({ p }) => {
    const cols = ["#f43f5e", "#f59e0b", "#10b981", "#3b82f6", "#a855f7"];
    const conf: DesignNode[] = Array.from({ length: 40 }, (_, i) => {
      const x = (i * 263) % BW, y = i % 2 ? (i * 37) % 110 + 20 : BH - 130 + ((i * 53) % 100);
      return i % 3 === 0 ? star(x, y, 26, 5, 0.45, cols[i % 5], { name: "Confetti star", rotation: i * 13 }) : rect(x, y, 10, 22, cols[i % 5], { rotation: (i * 41) % 180, cornerRadius: 3, name: "Confetti" });
    });
    return { bg: "#fffdf6", nodes: [
      ...conf,
      rect(60, 140, BW - 120, BH - 280, "#ffffff", { cornerRadius: 36, stroke: { color: cols[3], width: 5, dash: [18, 12] }, name: "Card", shadow: { color: "#000000", blur: 20, offsetX: 0, offsetY: 8, opacity: 0.12 } }),
      star(BW / 2, 150, 150, 5, 0.48, "#fbbf24", { name: "Big star", stroke: { color: "#ffffff", width: 6 } }),
      T(100, 250, BW - 200, "SUPERSTAR AWARD", 58, { font: "Poppins", weight: 800, color: "#1e293b", align: "center", ls: 2, name: "Title" }),
      T(100, 335, BW - 200, "This award goes to", 20, { font: "Poppins", weight: 600, color: "#64748b", align: "center", name: "Goes to" }),
      fit(140, 365, BW - 280, "Maryam Ali", 84, { font: GV, color: cols[4], align: "center", name: "Recipient name" }),
      T(200, 478, BW - 400, "For being kind, curious and always trying your best in Grade 3!", 18, { font: "Poppins", color: "#334155", align: "center", lh: 1.5, name: "Description" }),
      ...signatures({ ...p, ink: "#1e293b", gold: cols[0] }, 600, "Ms. Aminath", "Class Teacher", "Mr. Hassan", "Principal", 170, BW - 420),
    ] };
  } },
};

function scaled(nodes: DesignNode[], k: number) {
  for (const n of nodes) { bakeScale(n, k, k); n.x *= k; n.y *= k; }
  return nodes;
}

function generate(): Template[] {
  const out: Template[] = [];
  const W = 3508, H = 2480, k = W / BW;
  Object.entries(D).forEach(([id, d], di) => {
    for (let v = 0; v < 3; v++) {
      const p = PALS[(di + v * 2) % PALS.length];
      const pal = id === "kids" && v > 0 ? null : p;
      if (!pal) continue;
      out.push({
        id: `cert-${id}-${p.id}`, title: d.title, category: "Certificates", format: "A4 landscape",
        tags: ["certificate", "award", "diploma", "print", p.name.toLowerCase(), ...d.tags],
        build: () => { const b = d.build({ p }); return docOf(W, H, 300, "mm", { type: "solid", color: b.bg }, scaled(b.nodes, k)); },
      });
    }
  });
  return out;
}

export const CERTIFICATE_TEMPLATES: Template[] = generate();
