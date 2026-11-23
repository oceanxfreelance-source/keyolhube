// Layered election / campaign templates (Dhivehi + English) in several party colour schemes.
// Candidate photos are frames: select one and choose "Put a photo in this shape".
// Dhivehi wording is placeholder text to be checked and replaced by the campaign.
import { bakeScale } from "../doc/ops";
import type { DesignNode } from "../doc/types";
import type { Template } from "./builtin";
import { alpha, circle, darken, docOf, dots, fit, icon, lg, lighten, path, pillLabel, portraitFrame, rect, ring, star, stripes } from "./kit";
import { photo, T } from "./pro";

type EP = { id: string; name: string; main: string; dark: string; light: string; acc: string; onMain: string };
const PALS: EP[] = [
  { id: "yellow", name: "Yellow", main: "#fcd116", dark: "#0b2a5b", light: "#fff8d6", acc: "#e11d48", onMain: "#0b2a5b" },
  { id: "green", name: "Green", main: "#15803d", dark: "#052e16", light: "#ecfdf3", acc: "#facc15", onMain: "#ffffff" },
  { id: "blue", name: "Blue", main: "#1d4ed8", dark: "#0b1a4a", light: "#eef3ff", acc: "#fbbf24", onMain: "#ffffff" },
  { id: "pink", name: "Pink", main: "#db2777", dark: "#4a0d2b", light: "#fdf0f6", acc: "#fde047", onMain: "#ffffff" },
  { id: "orange", name: "Orange", main: "#ea580c", dark: "#3b1405", light: "#fff4ec", acc: "#0ea5e9", onMain: "#ffffff" },
  { id: "red", name: "Red", main: "#c8102e", dark: "#3a0710", light: "#fff1f2", acc: "#ffffff", onMain: "#ffffff" },
];
const TH = "Noto Sans Thaana", A = "Anton", MS = "Montserrat", I = "Inter";
const W = 1080;
const NAME_DV = "ކެނޑިޑޭޓްގެ ނަން", SLOGAN_DV = "ޝިޢާރު މިތާ ލިޔޭ", VOTE_DV = "ވޯޓު ދެއްވާ";

function sunburst(cx: number, cy: number, r: number, rays: number, fill: string): DesignNode {
  let d = "";
  for (let i = 0; i < rays; i++) {
    const a1 = (i / rays) * Math.PI * 2, a2 = ((i + 0.5) / rays) * Math.PI * 2;
    d += `M${r} ${r}L${r + Math.cos(a1) * r} ${r + Math.sin(a1) * r}L${r + Math.cos(a2) * r} ${r + Math.sin(a2) * r}Z`;
  }
  return path(d, cx - r, cy - r, r * 2, r * 2, r * 2, r * 2, fill, null, "Sunburst");
}
function ballotBadge(cx: number, cy: number, d: number, p: EP, n = "3"): DesignNode[] {
  return [
    rect(cx - d / 2, cy - d / 2, d, d, p.acc === "#ffffff" ? p.dark : p.acc, { cornerRadius: d * 0.16, rotation: 0, name: "Ballot number box", stroke: { color: "#ffffff", width: d * 0.05 }, shadow: { color: "#000000", blur: 20, offsetX: 0, offsetY: 8, opacity: 0.25 } }),
    T(cx - d / 2, cy - d * 0.44, d, n, d * 0.72, { font: A, color: "#ffffff", align: "center", lh: 1.15, name: "Ballot number" }),
  ];
}
const dvName = (y: number, color: string, size = 92, x = 60, w = W - 120) => T(x, y, w, NAME_DV, size, { font: TH, weight: 800, color, align: "center", name: "Candidate name (Dhivehi)" });

type Ctx = { p: EP; H: number };
const D: Record<string, { title: string; tags: string[]; w?: number; h?: number; build: (c: Ctx) => { bg: string; nodes: DesignNode[] } }> = {
  poster: { title: "Candidate poster", tags: ["poster", "candidate", "campaign"], build: ({ p, H }) => {
    const k = H / 1350, cy = 470 * k, d = 560;
    return { bg: p.light, nodes: [
      rect(0, 0, W, 820 * k, lg(160, [0, lighten(p.main, 20)], [1, p.main]), { name: "Party colour" }),
      sunburst(W / 2, cy, 900, 36, alpha("#ffffff", 0.14)),
      dots(60, 60, 6, 6, 26, 8, p.onMain, 0.35),
      path("M0 0H1080V60C760 140 320 0 0 70Z", 0, 800 * k, W, 140, 1080, 140, p.main, null, "Wave"),
      ring(W / 2, cy, d + 40, "#ffffff", 10), ring(W / 2, cy, d + 90, alpha("#ffffff", 0.5), 3),
      ...portraitFrame(W / 2 - d / 2, cy - d / 2, d, d, "circle", darken(p.main, 20), p.dark),
      ...ballotBadge(W - 200, cy + 190, 190, p),
      dvName(900 * k, p.dark),
      T(60, 900 * k + 140, W - 120, "CANDIDATE NAME", 40, { font: MS, weight: 800, color: p.main === "#fcd116" ? p.dark : p.main, align: "center", ls: 8, name: "Candidate name (English)" }),
      rect(120, 1080 * k, W - 240, 90, p.dark, { cornerRadius: 45, name: "Slogan band" }),
      T(120, 1080 * k + 14, W - 240, SLOGAN_DV, 46, { font: TH, weight: 700, color: "#ffffff", align: "center", name: "Slogan (Dhivehi)" }),
      icon("Vote", 120, H - 150, 70, p.main === "#fcd116" ? p.dark : p.main, 2.2),
      T(210, H - 150, 400, VOTE_DV, 56, { font: TH, weight: 800, color: p.dark, name: "Vote (Dhivehi)" }),
      T(W - 520, H - 140, 400, "CONSTITUENCY · 2028", 26, { font: I, weight: 700, color: alpha(p.dark, 0.7), align: "right", ls: 3, name: "Constituency" }),
    ] };
  } },
  ballot: { title: "Vote for number", tags: ["ballot", "vote", "number", "social"], build: ({ p, H }) => {
    const rows = ["1", "2", "3", "4", "5"]; const top = 520, rh = 120;
    return { bg: p.main, nodes: [
      rect(0, 0, W, H, lg(160, [0, lighten(p.main, 15)], [1, darken(p.main, 10)]), { name: "Background" }),
      stripes(0, 0, W, 420, 60, 18, "#ffffff", -30, 0.08),
      T(60, 110, W - 120, VOTE_DV, 110, { font: TH, weight: 800, color: p.onMain, align: "center", name: "Vote (Dhivehi)" }),
      T(60, 290, W - 120, "VOTE FOR NUMBER 3", 52, { font: A, color: p.onMain, align: "center", ls: 3, name: "Headline" }),
      rect(120, 440, W - 240, rows.length * rh + 140, "#ffffff", { cornerRadius: 20, name: "Ballot paper", shadow: { color: "#000000", blur: 40, offsetX: 0, offsetY: 18, opacity: 0.25 }, rotation: -2 }),
      T(160, 462, W - 320, "BALLOT PAPER", 22, { font: I, weight: 800, color: "#94a3b8", align: "center", ls: 6, name: "Ballot title" }),
      ...rows.flatMap((n, i) => {
        const y = top + i * rh, on = n === "3";
        return [
          rect(160, y, W - 320, rh - 16, on ? alpha(p.main, 0.15) : "#f8fafc", { cornerRadius: 12, name: "Ballot row", stroke: on ? { color: p.main === "#fcd116" ? p.dark : p.main, width: 4 } : null }),
          T(180, y + 22, 80, n, 56, { font: A, color: on ? p.dark : "#94a3b8", align: "center", lh: 1.1, name: "Row number" }),
          circle(320, y + (rh - 16) / 2, 70, on ? p.main : "#e2e8f0", { name: "Party mark" }),
          T(380, y + 26, 360, on ? NAME_DV : "—", on ? 42 : 40, { font: on ? TH : I, weight: 700, color: on ? p.dark : "#cbd5e1", align: "right", name: "Row name" }),
          rect(W - 280, y + 14, 76, 76, "#ffffff", { cornerRadius: 10, name: "Tick box", stroke: { color: "#334155", width: 3 } }),
          ...(on ? [icon("Check", W - 274, y + 12, 70, p.main === "#fcd116" ? p.acc : p.main, 4)] : []),
        ];
      }),
      T(60, H - 170, W - 120, "ELECTION DAY · SATURDAY 8 APRIL 2028", 30, { font: MS, weight: 700, color: p.onMain, align: "center", ls: 3, name: "Election day" }),
      T(60, H - 115, W - 120, "Polls open 8:00 to 16:00", 26, { font: I, color: alpha(p.onMain, 0.8), align: "center", name: "Hours" }),
    ] };
  } },
  rally: { title: "Campaign rally", tags: ["rally", "meeting", "event", "announcement", "ބައްދަލުވުން"], build: ({ p, H }) => {
    const k = H / 1350;
    const crowd = photo("concert-crowd", 0, 0, W, 760 * k, { adjust: { saturation: -60, contrast: 10 } });
    return { bg: p.dark, nodes: [
      crowd, rect(0, 0, W, 760 * k, lg(90, [0, alpha(p.main, 0.55)], [1, p.dark]), { name: "Party tint" }),
      circle(W - 170, 170, 200, p.main, { name: "Megaphone badge" }), ring(W - 170, 170, 240, p.main, 4),
      icon("Megaphone", W - 225, 115, 110, p.onMain, 2),
      T(60, 380 * k, W - 120, "ބައްދަލުވުން", 140, { font: TH, weight: 800, color: "#ffffff", align: "center", name: "Rally (Dhivehi)" }),
      T(60, 380 * k + 200, W - 120, "CAMPAIGN RALLY", 60, { font: A, color: p.main, align: "center", ls: 6, name: "Headline" }),
      ...[["Calendar", "ތާރީޚު", "Friday 31 March 2028"], ["Clock", "ގަޑި", "20:30"], ["MapPin", "ތަން", "Artificial Beach, Malé"]].flatMap(([ic, dv, en], i) => {
        const y = 830 * k + i * 120;
        return [rect(60, y, W - 120, 100, alpha("#ffffff", 0.07), { cornerRadius: 50, name: "Detail row" }),
          circle(110, y + 50, 76, p.main, { name: "Icon circle" }), icon(ic as "Calendar", 88, y + 28, 44, p.onMain),
          T(170, y + 26, 520, en, 36, { font: MS, weight: 600, color: "#ffffff", name: "Detail" }),
          T(W - 380, y + 22, 300, dv, 40, { font: TH, weight: 700, color: p.main, align: "right", name: "Detail (Dhivehi)" })];
      }),
      ...portraitFrame(60, H - 180, 130, 130, "circle", p.main, darken(p.main, 30)),
      T(220, H - 160, 500, NAME_DV, 44, { font: TH, weight: 800, color: "#ffffff", align: "right", name: "Candidate name (Dhivehi)" }),
      T(220, H - 95, 500, "Everyone is welcome", 26, { font: I, color: alpha("#ffffff", 0.75), align: "right", name: "Welcome" }),
      ...ballotBadge(W - 140, H - 115, 130, p),
    ] };
  } },
  pledges: { title: "Our pledges", tags: ["pledges", "manifesto", "promises", "policy"], build: ({ p, H }) => {
    const items: [Parameters<typeof icon>[0], string, string][] = [["House", "Housing", "Affordable homes for families"], ["GraduationCap", "Education", "Free higher education"], ["Hospital", "Health", "A clinic on every island"], ["Briefcase", "Jobs", "10,000 new jobs for youth"], ["Ship", "Transport", "Daily ferry links"], ["Leaf", "Environment", "Protect reefs and beaches"]];
    const cw = (W - 120 - 30) / 2, ch = 250, top = 400;
    return { bg: p.light, nodes: [
      rect(0, 0, W, 360, lg(160, [0, lighten(p.main, 15)], [1, p.main]), { name: "Header" }),
      dots(W - 260, 50, 8, 5, 26, 8, p.onMain, 0.3),
      T(60, 80, W - 120, "ވަޢުދުތައް", 120, { font: TH, weight: 800, color: p.onMain, align: "center", name: "Pledges (Dhivehi)" }),
      T(60, 250, W - 120, "OUR PLEDGES TO YOU", 44, { font: A, color: p.onMain, align: "center", ls: 4, name: "Headline" }),
      ...items.flatMap(([ic, t, s], i) => {
        const x = 60 + (i % 2) * (cw + 30), y = top + Math.floor(i / 2) * (ch + 26);
        return [rect(x, y, cw, ch, "#ffffff", { cornerRadius: 24, name: "Pledge card", shadow: { color: "#000000", blur: 18, offsetX: 0, offsetY: 6, opacity: 0.08 } }),
          circle(x + 70, y + 72, 90, alpha(p.main, 0.15), { name: "Icon circle" }), icon(ic, x + 42, y + 44, 56, p.main === "#fcd116" ? p.dark : p.main),
          T(x + 130, y + 30, 50, String(i + 1).padStart(2, "0"), 30, { font: A, color: alpha(p.dark, 0.25), name: "Number" }),
          T(x + 36, y + 140, cw - 72, t, 38, { font: MS, weight: 800, color: p.dark, name: "Pledge title" }),
          T(x + 36, y + 190, cw - 72, s, 24, { font: I, color: alpha(p.dark, 0.7), name: "Pledge text" })];
      }),
      ...ballotBadge(W / 2, H - 100, 120, p),
    ] };
  } },
  countdown: { title: "Election countdown", tags: ["countdown", "days to go", "election day"], build: ({ p, H }) => {
    const cy = 560;
    const segs: DesignNode[] = Array.from({ length: 30 }, (_, i) => {
      const a = (i / 30) * Math.PI * 2 - Math.PI / 2, r = 340;
      return rect(W / 2 + Math.cos(a) * r - 9, cy + Math.sin(a) * r - 24, 18, 48, i < 25 ? p.main : alpha("#ffffff", 0.2), { rotation: (a * 180) / Math.PI + 90, cornerRadius: 9, name: "Countdown tick" });
    });
    return { bg: p.dark, nodes: [
      rect(0, 0, W, H, lg(160, [0, p.dark], [1, darken(p.dark, 10)]), { name: "Background" }),
      stripes(0, 0, W, H, 80, 2, p.main, -30, 0.15),
      ...segs,
      circle(W / 2, cy, 560, alpha(p.main, 0.12), { name: "Glow" }),
      T(W / 2 - 260, cy - 230, 520, "5", 380, { font: A, color: "#ffffff", align: "center", lh: 1.15, name: "Days number" }),
      T(60, 960, W - 120, "DAYS TO GO", 84, { font: A, color: p.main, align: "center", ls: 6, name: "Headline" }),
      T(60, 1070, W - 120, "ދުވަސް ބާކީ", 56, { font: TH, weight: 700, color: "#ffffff", align: "center", name: "Days left (Dhivehi)" }),
      ...pillLabel(W / 2 - 230, H - 150, "ELECTION DAY · 8 APRIL 2028", 24, p.main, p.onMain, MS, 800, 1.4, 2),
    ] };
  } },
  thanks: { title: "Thank you voters", tags: ["thank you", "victory", "result", "ޝުކުރިއްޔާ"], build: ({ p, H }) => {
    const cols = [p.main, p.acc, "#ffffff"];
    const conf: DesignNode[] = Array.from({ length: 36 }, (_, i) => rect((i * 307) % W, ((i * 173) % 480) + 30, 14, 30, cols[i % 3], { rotation: (i * 53) % 180, cornerRadius: 3, opacity: 0.85, name: "Confetti" }));
    return { bg: p.dark, nodes: [
      rect(0, 0, W, H, lg(90, [0, darken(p.main, 10)], [0.6, p.dark]), { name: "Background" }),
      sunburst(W / 2, 430, 820, 40, alpha("#ffffff", 0.06)),
      ...conf,
      ring(W / 2, 430, 470, p.main, 10),
      ...portraitFrame(W / 2 - 210, 220, 420, 420, "circle", lighten(p.main, 10), darken(p.main, 30)),
      T(60, 700, W - 120, "ޝުކުރިއްޔާ", 150, { font: TH, weight: 800, color: "#ffffff", align: "center", name: "Thank you (Dhivehi)" }),
      T(60, 900, W - 120, "THANK YOU", 96, { font: A, color: p.main, align: "center", ls: 8, name: "Headline" }),
      T(140, 1030, W - 280, "for your trust and support. Together we will build a better future for every island.", 30, { font: I, color: alpha("#ffffff", 0.85), align: "center", lh: 1.5, name: "Message" }),
      ...[0, 1, 2].map((i) => star(W / 2 - 70 + i * 70, H - 110, 44, 5, 0.45, p.main, { name: "Star" })),
    ] };
  } },
  banner: { title: "Campaign banner 3 × 6 ft", tags: ["banner", "print", "large format", "roadside"], w: 1440, h: 720, build: ({ p }) => {
    const BWd = 1440, BHd = 720;
    return { bg: p.main, nodes: [
      rect(0, 0, BWd, BHd, lg(135, [0, lighten(p.main, 15)], [1, p.main]), { name: "Background" }),
      sunburst(380, 360, 700, 32, alpha("#ffffff", 0.12)),
      path("M900 0H1440V720H700Z", 0, 0, BWd, BHd, 1440, 720, p.dark, null, "Dark panel"),
      path("M860 0H900L700 720H660Z", 0, 0, BWd, BHd, 1440, 720, p.acc === "#ffffff" ? "#ffffff" : p.acc, null, "Accent slash"),
      ring(380, 360, 540, "#ffffff", 8),
      ...portraitFrame(380 - 250, 110, 500, 500, "circle", darken(p.main, 20), p.dark),
      T(820, 140, 560, NAME_DV, 86, { font: TH, weight: 800, color: "#ffffff", align: "right", name: "Candidate name (Dhivehi)" }),
      T(820, 270, 560, "CANDIDATE NAME", 34, { font: MS, weight: 800, color: p.main, align: "right", ls: 6, name: "Candidate name (English)" }),
      T(820, 350, 560, SLOGAN_DV, 46, { font: TH, weight: 600, color: alpha("#ffffff", 0.85), align: "right", name: "Slogan (Dhivehi)" }),
      ...ballotBadge(1290, 560, 150, p),
      T(820, 520, 360, VOTE_DV, 62, { font: TH, weight: 800, color: "#ffffff", align: "right", name: "Vote (Dhivehi)" }),
    ] };
  } },
};

function scaled(nodes: DesignNode[], k: number) {
  for (const n of nodes) { bakeScale(n, k, k); n.x *= k; n.y *= k; }
  return nodes;
}

function generate(): Template[] {
  const out: Template[] = [];
  const keys = Object.keys(D);
  keys.forEach((id, di) => {
    PALS.forEach((p, pi) => {
      if ((di + pi) % 2 === 1 && id !== "poster") return; // every design in three colour schemes; the poster in all six
      const d = D[id];
      const formats: { H: number; label: string }[] = id === "poster" ? [{ H: 1350, label: "Instagram post" }, ...(pi % 2 === 0 ? [{ H: 1920, label: "Story" }] : [])] : [{ H: 1350, label: "Instagram post" }];
      for (const f of formats) {
        out.push({
          id: `elect-${id}-${p.id}${f.H === 1920 ? "-story" : ""}`, title: `${d.title} (${p.name.toLowerCase()})`, category: "Election", format: id === "banner" ? "Banner 3 × 6 ft" : f.label,
          tags: ["election", "campaign", "dhivehi", "ދިވެހި", "politics", "vote", p.name.toLowerCase(), ...d.tags],
          build: () => {
            if (d.w) { const b = d.build({ p, H: d.h! }); const k = 7200 / d.w; return docOf(7200, 3600, 100, "in", { type: "solid", color: b.bg }, scaled(b.nodes, k)); }
            const b = d.build({ p, H: f.H });
            return docOf(W, f.H, 96, "px", { type: "solid", color: b.bg }, b.nodes);
          },
        });
      }
    });
  });
  return out;
}

export const ELECTION_TEMPLATES: Template[] = generate();
