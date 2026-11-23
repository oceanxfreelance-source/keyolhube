// Layered sports templates: match day, results, player spotlight, fixtures, tournaments, line-ups,
// fun runs, recruitment and champions, for several sports and team colour schemes.
import type { DesignNode } from "../doc/types";
import type { Template } from "./builtin";
import { alpha, circle, docOf, dots, ellipse, fit, group, icon, lg, line, outlineText, path, pillLabel, portraitFrame, rect, ring, rings, star, stripes } from "./kit";
import { photo, T } from "./pro";
import { STOCK } from "./stock";

type SP = { id: string; bg: string; bg2: string; acc: string; acc2: string; ink: string; muted: string };
const PALS: SP[] = [
  { id: "navy", bg: "#08132b", bg2: "#13265a", acc: "#ffc93c", acc2: "#3b82f6", ink: "#08132b", muted: "#9fb0d0" },
  { id: "lime", bg: "#0a0a0a", bg2: "#1c1c1c", acc: "#c6f432", acc2: "#22c55e", ink: "#0a0a0a", muted: "#a3a3a3" },
  { id: "red", bg: "#2a0606", bg2: "#8b1111", acc: "#ffffff", acc2: "#ef4444", ink: "#8b1111", muted: "#f3b4b4" },
  { id: "purple", bg: "#1b0a3c", bg2: "#3b1a7a", acc: "#fbbf24", acc2: "#a78bfa", ink: "#1b0a3c", muted: "#c4b5fd" },
  { id: "teal", bg: "#031f1e", bg2: "#0f4f4b", acc: "#fb923c", acc2: "#2dd4bf", ink: "#031f1e", muted: "#99d5cc" },
  { id: "royal", bg: "#06144a", bg2: "#1739a8", acc: "#22d3ee", acc2: "#ffffff", ink: "#06144a", muted: "#a5b8f0" },
];
type Sport = { id: string; name: string; league: string; photos: string[]; score: [string, string]; designs: string[]; teams: [string, string] };
const SPORTS: Sport[] = [
  { id: "football", name: "Football", league: "ISLAND PREMIER LEAGUE", photos: ["stadium", "stadium-ball", "goal-sunset", "goal-field", "floodlights", "ball-on-grass"], score: ["3", "1"], teams: ["CORAL SHARKS", "LAGOON LIONS"], designs: ["matchday", "result", "player", "fixtures", "tournament", "lineup", "join", "champions"] },
  { id: "basketball", name: "Basketball", league: "CITY BASKETBALL LEAGUE", photos: ["court-palms", "street-court", "hoop-sky", "hoop-net"], score: ["86", "79"], teams: ["REEF RANGERS", "ATOLL EAGLES"], designs: ["matchday", "result", "player", "fixtures", "tournament", "join", "champions"] },
  { id: "volleyball", name: "Volleyball", league: "BEACH VOLLEYBALL OPEN", photos: ["beach-volley-game", "volleyball-sand"], score: ["3", "2"], teams: ["SUNSET SPIKERS", "WAVE RIDERS"], designs: ["matchday", "result", "tournament", "join", "champions"] },
  { id: "swimming", name: "Swimming", league: "NATIONAL SWIMMING GALA", photos: ["swim-lanes", "swim-stroke"], score: ["", ""], teams: ["", ""], designs: ["tournament", "join", "champions"] },
  { id: "athletics", name: "Athletics", league: "ISLAND ATHLETICS MEET", photos: ["track-1500", "track-lanes", "blue-track", "track-curve", "marathon-feet"], score: ["", ""], teams: ["", ""], designs: ["run", "tournament", "join", "champions"] },
  { id: "badminton", name: "Badminton", league: "OPEN BADMINTON CHAMPIONSHIP", photos: ["badminton-hall"], score: ["2", "1"], teams: ["A. HASSAN", "M. IBRAHIM"], designs: ["matchday", "tournament", "join"] },
  { id: "tabletennis", name: "Table tennis", league: "TABLE TENNIS CUP", photos: ["table-tennis", "ping-pong"], score: ["3", "1"], teams: ["S. ALI", "R. AHMED"], designs: ["matchday", "tournament", "join"] },
  { id: "cricket", name: "Cricket", league: "T20 ISLAND CUP", photos: ["cricket-hand"], score: ["182/6", "176/9"], teams: ["NORTH XI", "SOUTH XI"], designs: ["matchday", "result", "tournament", "join"] },
];

const W = 1080;
const A = "Anton", O = "Oswald", I = "Inter";

function crest(cx: number, cy: number, d: number, c1: string, c2: string, initials: string, ink: string): DesignNode[] {
  const h = d * 1.2;
  return [
    path("M50 0L100 14V58C100 90 78 110 50 120C22 110 0 90 0 58V14Z", cx - d / 2, cy - h / 2, d, h, 100, 120, c1, { color: "#ffffff", width: d * 0.035 }, "Crest"),
    path("M50 12L88 23V58C88 83 71 99 50 107C29 99 12 83 12 58V23Z", cx - d / 2, cy - h / 2, d, h, 100, 120, lg(90, [0, c2], [1, alpha(c2, 0.75)]), null, "Crest inner"),
    star(cx, cy - h * 0.2, d * 0.18, 5, 0.45, "#ffffff", { name: "Crest star" }),
    fit(cx - d * 0.36, cy - h * 0.06, d * 0.72, initials, d * 0.34, { font: A, color: ink, align: "center", name: "Crest initials" }),
  ];
}
const initials = (t: string) => t.split(/[\s.]+/).filter(Boolean).map((w) => w[0]).join("").slice(0, 3);
function infoRow(y: number, items: [Parameters<typeof icon>[0], string][], p: SP, x0 = 60, w = W - 120, h = 120): DesignNode[] {
  const out: DesignNode[] = [rect(x0, y, w, h, alpha("#ffffff", 0.08), { cornerRadius: 20, name: "Info bar", stroke: { color: alpha("#ffffff", 0.18), width: 2 } })];
  const cw = w / items.length;
  items.forEach(([ic, label], i) => {
    const cx = x0 + cw * i;
    out.push(icon(ic, cx + 30, y + (h - 40) / 2, 40, p.acc, 2.2));
    out.push(fit(cx + 84, y + (h - 34) / 2 - 2, cw - 100, label, 34, { font: O, weight: 700, color: "#ffffff", name: "Info" }));
    if (i) out.push(line(cx, y + 24, cx, y + h - 24, alpha("#ffffff", 0.2), 2));
  });
  return out;
}
function sponsors(y: number, p: SP, n = 4): DesignNode[] {
  const out: DesignNode[] = [T(60, y, W - 120, "OFFICIAL PARTNERS", 20, { font: I, weight: 700, color: p.muted, align: "center", ls: 6, name: "Partners title" })];
  const bw = 180, gap = 30, x0 = (W - (n * bw + (n - 1) * gap)) / 2;
  for (let i = 0; i < n; i++) {
    out.push(rect(x0 + i * (bw + gap), y + 44, bw, 64, alpha("#ffffff", 0.06), { cornerRadius: 12, stroke: { color: alpha("#ffffff", 0.25), width: 2, dash: [8, 6] }, name: "Logo slot" }));
    out.push(T(x0 + i * (bw + gap), y + 64, bw, "LOGO", 22, { font: I, weight: 700, color: alpha("#ffffff", 0.5), align: "center", ls: 4, name: "Logo placeholder" }));
  }
  return out;
}
function photoTop(slug: string, h: number, p: SP, opacity = 0.75): DesignNode[] {
  const ph = photo(slug, 0, 0, W, h, { adjust: { contrast: 12, saturation: -10 } });
  ph.opacity = opacity;
  return [ph, rect(0, h * 0.25, W, h * 0.75 + 2, lg(90, [0, alpha(p.bg, 0)], [1, p.bg]), { name: "Fade" })];
}

// ---------------- designs ----------------
type Ctx = { p: SP; s: Sport; ph: string; H: number };
const D: Record<string, (c: Ctx) => DesignNode[]> = {
  matchday: ({ p, s, ph, H }) => {
    const k = H / 1350; const [t1, t2] = s.teams;
    const vsY = 690 * k, cd = 205;
    return [
      ...photoTop(ph, 760 * k, p, 0.7),
      stripes(W * 0.58, 0, W * 0.42, 520 * k, 54, 16, p.acc, -30, 0.16),
      dots(60, 60, 8, 4, 26, 7, p.acc, 0.5),
      outlineText(-30, 150 * k, W + 60, "MATCH DAY", 250, alpha("#ffffff", 0.22), 3, { font: A, align: "center" }),
      ...pillLabel(60, 170 * k, s.league, 22, p.acc, p.ink, I, 800, 1.2, 3),
      fit(60, 260 * k, W - 120, "MATCH DAY", 210, { font: A, color: "#ffffff", name: "Headline" }),
      T(60, 260 * k + 225, W - 120, `ROUND 12  ·  ${s.name.toUpperCase()}`, 30, { font: O, weight: 500, color: p.acc, ls: 6, name: "Round" }),
      rect(0, vsY - 40, W, cd + 210, lg(0, [0, alpha(p.bg2, 0)], [0.5, alpha(p.bg2, 0.85)], [1, alpha(p.bg2, 0)]), { name: "Glow band" }),
      ...crest(W * 0.22, vsY + cd * 0.55, cd, p.bg2, p.acc2, initials(t1), "#ffffff"),
      ...crest(W * 0.78, vsY + cd * 0.55, cd, p.bg2, p.acc, initials(t2), p.ink),
      circle(W / 2, vsY + cd * 0.55, 140, p.acc, { name: "VS badge" }), ring(W / 2, vsY + cd * 0.55, 176, p.acc, 4),
      T(W / 2 - 70, vsY + cd * 0.55 - 46, 140, "VS", 78, { font: A, color: p.ink, align: "center", lh: 1.15, name: "VS" }),
      fit(W * 0.22 - 200, vsY + cd * 1.2, 400, t1, 40, { font: O, weight: 700, color: "#ffffff", align: "center", ls: 2, name: "Home team" }),
      fit(W * 0.78 - 200, vsY + cd * 1.2, 400, t2, 40, { font: O, weight: 700, color: "#ffffff", align: "center", ls: 2, name: "Away team" }),
      ...infoRow(H - 320, [["Calendar", "SAT 14 SEP"], ["Clock", "20:30"], ["MapPin", "NATIONAL STADIUM"]], p),
      ...pillLabel(W / 2 - 160, H - 170, "TICKETS  MVR 50", 28, p.acc, p.ink, O, 700, 1.4, 2),
      ...(H > 1400 ? sponsors(H - 120 - 150, p) : []),
    ];
  },
  result: ({ p, s, ph, H }) => {
    const [t1, t2] = s.teams; const cy = 640;
    const bg = photo(ph, 0, 0, W, H, { adjust: { contrast: 10, saturation: -30, brightness: -10 } });
    return [
      bg, rect(0, 0, W, H, lg(90, [0, alpha(p.bg, 0.55)], [0.5, alpha(p.bg, 0.85)], [1, p.bg]), { name: "Tint" }),
      rings(W / 2, cy, 980, 7, p.acc, 2, 0.12),
      ...pillLabel(W / 2 - 150, 120, "FULL TIME", 34, p.acc, p.ink, A, 400, 1.6, 4),
      T(60, 210, W - 120, s.league, 26, { font: I, weight: 700, color: p.muted, align: "center", ls: 6, name: "League" }),
      ...crest(200, cy - 20, 210, p.bg2, p.acc2, initials(t1), "#ffffff"),
      ...crest(W - 200, cy - 20, 210, p.bg2, p.acc, initials(t2), p.ink),
      fit(330, cy - 130, W - 660, `${s.score[0]}-${s.score[1]}`, 220, { font: A, color: "#ffffff", align: "center", name: "Score" }),
      fit(60, cy + 150, 300, t1, 36, { font: O, weight: 700, color: "#ffffff", align: "center", name: "Home team" }),
      fit(W - 360, cy + 150, 300, t2, 36, { font: O, weight: 700, color: "#ffffff", align: "center", name: "Away team" }),
      line(140, cy + 240, W - 140, cy + 240, alpha("#ffffff", 0.2), 2),
      T(80, cy + 280, 420, "Ali Hassan 23'\nIbrahim Zaid 51'\nAdam Rasheed 88'", 30, { font: I, color: "#e5e7eb", align: "right", lh: 1.6, name: "Home scorers" }),
      icon("Timer", W / 2 - 24, cy + 290, 48, p.acc, 2),
      T(W - 500, cy + 280, 420, "Musa Naseem 67'", 30, { font: I, color: "#e5e7eb", lh: 1.6, name: "Away scorers" }),
      rect(60, H - 230, W - 120, 130, p.acc, { cornerRadius: 22, name: "Next match bar" }),
      T(100, H - 205, 400, "NEXT MATCH", 24, { font: I, weight: 800, color: p.ink, ls: 4, name: "Next label" }),
      T(100, H - 170, 600, "vs ATOLL EAGLES · SAT 21 SEP", 38, { font: O, weight: 700, color: p.ink, name: "Next match" }),
      icon("ArrowRight", W - 160, H - 195, 60, p.ink, 2.5),
    ];
  },
  player: ({ p, s, H }) => {
    return [
      rect(0, 0, W, H, lg(160, [0, p.bg2], [1, p.bg]), { name: "Background" }),
      stripes(0, H * 0.45, W, H * 0.55, 60, 22, p.acc, -25, 0.07),
      outlineText(330, 80, 800, "10", 900, alpha(p.acc, 0.55), 5, { font: A, align: "right" }),
      ...portraitFrame(60, 210, 620, 820, "arch", p.acc2, p.bg2),
      ring(370, 520, 700, alpha(p.acc, 0.4), 3),
      ...crest(W - 140, 140, 120, p.bg2, p.acc, "CS", p.ink),
      ...pillLabel(60, 90, "PLAYER OF THE MONTH", 24, p.acc, p.ink, I, 800, 1.2, 3),
      ...[0, 1, 2, 3, 4].map((i) => star(80 + i * 46 + 470, 113, 34, 5, 0.45, p.acc, { name: "Rating star" })),
      T(60, 1000, 700, "ADAM", 70, { font: O, weight: 500, color: p.acc, ls: 10, name: "First name" }),
      fit(60, 1070, W - 120, "RASHEED", 200, { font: A, color: "#ffffff", name: "Last name" }),
      ...[["12", "GOALS"], ["8", "ASSISTS"], ["21", "MATCHES"]].flatMap(([v, l], i) => {
        const x = 720, y = 330 + i * 210;
        return [rect(x, y, 300, 180, alpha("#ffffff", 0.07), { cornerRadius: 22, stroke: { color: alpha(p.acc, 0.5), width: 2 }, name: "Stat card" }),
          T(x, y + 18, 300, v, 96, { font: A, color: p.acc, align: "center", lh: 1.1, name: "Stat value" }),
          T(x, y + 128, 300, l, 24, { font: I, weight: 700, color: p.muted, align: "center", ls: 5, name: "Stat label" })];
      }),
      T(720, 980, 300, `FORWARD · ${s.name.toUpperCase()}`, 22, { font: I, weight: 700, color: p.muted, align: "center", ls: 3, name: "Position" }),
    ];
  },
  fixtures: ({ p, s, H }) => {
    const rows = H > 1400 ? 7 : 5; const top = 380, rh = (H - top - 200) / rows;
    const teams = [["CORAL SHARKS", "LAGOON LIONS"], ["REEF RANGERS", "ATOLL EAGLES"], ["WAVE RIDERS", "ISLAND STARS"], ["OCEAN KINGS", "SUNSET UTD"], ["HARBOUR FC", "NORTH CITY"], ["CORAL SHARKS", "REEF RANGERS"], ["ATOLL EAGLES", "WAVE RIDERS"]];
    const out: DesignNode[] = [
      rect(0, 0, W, H, lg(150, [0, p.bg], [1, p.bg2]), { name: "Background" }),
      dots(W - 300, 60, 9, 6, 28, 8, p.acc, 0.35),
      ...pillLabel(60, 90, s.league, 22, p.acc, p.ink, I, 800, 1.2, 3),
      T(60, 160, W - 120, "FIXTURES", 150, { font: A, color: "#ffffff", name: "Headline" }),
      T(60, 320, W - 120, "SEPTEMBER 2026", 32, { font: O, weight: 500, color: p.acc, ls: 8, name: "Month" }),
    ];
    for (let i = 0; i < rows; i++) {
      const y = top + 30 + i * rh, h = rh - 22; const [a, b] = teams[i % teams.length];
      out.push(rect(60, y, W - 120, h, alpha("#ffffff", i % 2 ? 0.05 : 0.09), { cornerRadius: 18, name: "Fixture row" }),
        rect(60, y, 130, h, p.acc, { cornerRadius: 18, name: "Date block" }),
        T(60, y + h / 2 - 48, 130, String(14 + i * 3), 62, { font: A, color: p.ink, align: "center", lh: 1.1, name: "Day" }),
        T(60, y + h / 2 + 22, 130, "SEP", 22, { font: I, weight: 800, color: p.ink, align: "center", ls: 3, name: "Month" }),
        circle(250, y + h / 2, 64, p.acc2, { name: "Team badge" }),
        T(218, y + h / 2 - 16, 64, initials(a), 24, { font: A, color: "#ffffff", align: "center", name: "Badge initials" }),
        fit(300, y + h / 2 - 20, 250, a, 34, { font: O, weight: 700, color: "#ffffff", name: "Home team" }),
        T(W / 2 + 20, y + h / 2 - 22, 120, "20:30", 34, { font: O, weight: 700, color: p.acc, align: "center", name: "Kick-off" }),
        fit(W - 400, y + h / 2 - 20, 250, b, 34, { font: O, weight: 700, color: "#ffffff", align: "right", name: "Away team" }),
        circle(W - 110, y + h / 2, 64, p.bg2, { name: "Team badge", stroke: { color: p.acc, width: 3 } }),
        T(W - 142, y + h / 2 - 16, 64, initials(b), 24, { font: A, color: "#ffffff", align: "center", name: "Badge initials" }));
    }
    out.push(icon("MapPin", 60, H - 130, 36, p.acc), T(110, H - 128, W - 170, "All matches at the National Stadium · Free entry for kids", 28, { font: I, color: p.muted, name: "Venue note" }));
    return out;
  },
  tournament: ({ p, s, ph, H }) => {
    const k = H / 1350;
    return [
      ...photoTop(ph, 700 * k, p, 0.8),
      stripes(0, 0, W * 0.4, 380, 48, 14, p.acc, -30, 0.15),
      circle(W / 2, 330 * k, 230, p.acc, { name: "Trophy badge" }), ring(W / 2, 330 * k, 280, p.acc, 4), ring(W / 2, 330 * k, 330, alpha(p.acc, 0.4), 2),
      icon("Trophy", W / 2 - 70, 330 * k - 70, 140, p.ink, 2),
      fit(60, 500 * k, W - 120, `${s.name.toUpperCase()}\nTOURNAMENT`, 150, { font: A, color: "#ffffff", align: "center", lh: 1.0, name: "Headline" }),
      T(60, 500 * k + 310, W - 120, "2026 · REGISTRATION OPEN", 32, { font: O, weight: 500, color: p.acc, align: "center", ls: 8, name: "Subtitle" }),
      star(W - 170, 200 * k, 230, 14, 0.78, p.acc2 === "#ffffff" ? p.acc : p.acc2, { name: "Prize burst" }),
      T(W - 270, 200 * k - 52, 200, "PRIZE\nMVR 50K", 36, { font: A, color: p.acc2 === "#ffffff" ? p.ink : "#ffffff", align: "center", lh: 1.1, name: "Prize" }),
      ...[["Calendar", "1 – 15 November 2026"], ["MapPin", "Sports Complex, Malé"], ["Users", "Teams of 8 · Men, women, under-18"], ["Phone", "+960 777 0000"]].flatMap(([ic, t], i) => {
        const y = 920 * k + i * 74;
        return [circle(100, y + 24, 56, alpha(p.acc, 0.15), { name: "Icon circle" }), icon(ic as "Calendar", 82, y + 6, 36, p.acc), T(150, y + 6, 560, t, 32, { font: I, weight: 500, color: "#ffffff", name: "Detail" })];
      }),
      rect(W - 330, 900 * k, 270, 270, "#ffffff", { cornerRadius: 18, name: "QR placeholder" }),
      dots(W - 300, 930 * k, 8, 8, 27, 18, p.ink, 0.85),
      T(W - 330, 900 * k + 285, 270, "SCAN TO REGISTER", 20, { font: I, weight: 800, color: p.acc, align: "center", ls: 3, name: "QR label" }),
      ...pillLabel(W / 2 - 170, H - 130, "REGISTER NOW", 32, p.acc, p.ink, O, 700, 1.6, 3),
    ];
  },
  lineup: ({ p, H }) => {
    const px = 90, py = 330, pw = W - 180, phh = H - 330 - 420; const wl = { color: alpha("#ffffff", 0.8), width: 4 };
    const pos: [number, number, string, string][] = [[0.5, 0.92, "1", "SAMEER"], [0.15, 0.74, "2", "NAIF"], [0.38, 0.77, "4", "HAMZA"], [0.62, 0.77, "5", "IYAZ"], [0.85, 0.74, "3", "RIZWAN"], [0.25, 0.52, "8", "SHIFAN"], [0.5, 0.56, "6", "AKRAM"], [0.75, 0.52, "10", "ADAM"], [0.18, 0.26, "7", "ALI"], [0.5, 0.2, "9", "IBRAHIM"], [0.82, 0.26, "11", "MUSA"]];
    return [
      rect(0, 0, W, H, lg(160, [0, p.bg], [1, p.bg2]), { name: "Background" }),
      ...pillLabel(60, 90, "MATCH DAY 12", 22, p.acc, p.ink, I, 800, 1.2, 3),
      T(60, 150, W - 120, "STARTING XI", 130, { font: A, color: "#ffffff", name: "Headline" }),
      T(60, 290, W - 120, "vs LAGOON LIONS · 20:30", 30, { font: O, weight: 500, color: p.acc, ls: 4, name: "Opponent" }),
      rect(px, py, pw, phh, lg(90, [0, "#15803d"], [1, "#166534"]), { cornerRadius: 24, name: "Pitch" }),
      stripes(px, py, pw, phh, 120, 60, "#ffffff", 0, 0.05),
      rect(px + 30, py + 30, pw - 60, phh - 60, { type: "none" }, { stroke: wl, name: "Pitch lines" }),
      line(px + 30, py + phh / 2, px + pw - 30, py + phh / 2, wl.color, 4),
      ring(W / 2, py + phh / 2, 220, wl.color, 4),
      rect(W / 2 - 200, py + 30, 400, 170, { type: "none" }, { stroke: wl, name: "Box" }), rect(W / 2 - 200, py + phh - 200, 400, 170, { type: "none" }, { stroke: wl, name: "Box" }),
      rect(W / 2 - 90, py + 30, 180, 70, { type: "none" }, { stroke: wl, name: "Goal box" }), rect(W / 2 - 90, py + phh - 100, 180, 70, { type: "none" }, { stroke: wl, name: "Goal box" }),
      ...pos.flatMap(([fx, fy, n, name]) => {
        const cx = px + pw * fx, cy = py + phh * fy;
        return [circle(cx, cy, 86, p.acc, { name: "Player", stroke: { color: "#ffffff", width: 4 } }), T(cx - 43, cy - 26, 86, n, 44, { font: A, color: p.ink, align: "center", lh: 1.1, name: "Number" }),
          rect(cx - 80, cy + 50, 160, 40, alpha(p.bg, 0.85), { cornerRadius: 20, name: "Name tag" }), fit(cx - 76, cy + 57, 152, name, 24, { font: O, weight: 700, color: "#ffffff", align: "center", name: "Player name" })];
      }),
      T(60, H - 360, W - 120, "SUBSTITUTES", 26, { font: I, weight: 800, color: p.acc, ls: 6, name: "Subs title" }),
      T(60, H - 315, W - 120, "12 Nashid  ·  13 Saif  ·  14 Yoosuf  ·  15 Hassan  ·  16 Zayan", 32, { font: I, color: "#ffffff", lh: 1.5, name: "Subs" }),
      ...infoRow(H - 220, [["Clock", "20:30"], ["MapPin", "NATIONAL STADIUM"]], p),
    ];
  },
  run: ({ p, ph, H }) => {
    const k = H / 1350;
    const route = path("M0 80 C60 0 120 160 200 80 S340 0 400 80 S540 160 600 60", 140, 640 * k, 800, 160, 600, 160, { type: "none" }, { color: p.acc, width: 10, dash: [2, 22], cap: "round" }, "Route");
    return [
      ...photoTop(ph, 760 * k, p, 0.85),
      ...pillLabel(60, 90, "CHARITY FUN RUN", 24, p.acc, p.ink, I, 800, 1.2, 3),
      fit(60, 170, W - 120, "RUN FOR\nTHE OCEAN", 190, { font: A, color: "#ffffff", lh: 0.98, name: "Headline" }),
      T(60, 170 + 390, 760, "Every kilometre helps protect our reefs. Walk, jog or run!", 34, { font: I, color: "#e5e7eb", lh: 1.4, name: "Body text" }),
      route, circle(140, 640 * k + 80, 34, p.acc, { name: "Start" }), circle(940, 640 * k + 60, 34, "#ffffff", { name: "Finish", stroke: { color: p.acc, width: 6 } }),
      ...[["5K", 0], ["10K", 1], ["21K", 2]].flatMap(([t, i]) => {
        const cx = 220 + (i as number) * 320, cy = 930 * k;
        return [circle(cx, cy, 220, i === 1 ? p.acc : alpha("#ffffff", 0.08), { name: "Distance", stroke: { color: p.acc, width: 4 } }),
          T(cx - 110, cy - 50, 220, t as string, 86, { font: A, color: i === 1 ? p.ink : "#ffffff", align: "center", lh: 1.15, name: "Distance label" })];
      }),
      ...infoRow(H - 300, [["Calendar", "SUN 9 NOV"], ["Clock", "6:00 AM"], ["Flag", "RASFANNU BEACH"]], p),
      icon("Medal", 60, H - 145, 52, p.acc), T(130, H - 140, 560, "Every finisher gets a medal", 32, { font: I, weight: 600, color: "#ffffff", name: "Medal note" }),
      ...pillLabel(W - 360, H - 160, "SIGN UP", 30, p.acc, p.ink, O, 700, 2.4, 3),
    ];
  },
  join: ({ p, s, ph, H }) => {
    const k = H / 1350;
    const img = photo(ph, 0, 0, W, 760 * k, { adjust: { contrast: 10 } });
    const masked = group([path("M0 0H1080V640L0 760Z", 0, 0, W, 760 * k, 1080, 760, "#000000", null, "Mask"), img], "Photo (masked)", true, 0, 0, W, 760 * k);
    return [
      rect(0, 0, W, H, p.bg, { name: "Background" }),
      masked,
      path("M0 760L1080 640V672L0 792Z", 0, 0, W, 792 * k, 1080, 792, p.acc, null, "Accent slash"),
      ...pillLabel(60, 80, `${s.name.toUpperCase()} ACADEMY`, 24, p.acc, p.ink, I, 800, 1.2, 3),
      fit(60, 820 * k, W - 120, "JOIN THE TEAM", 150, { font: A, color: "#ffffff", name: "Headline" }),
      ...["Training three times a week", "Qualified, friendly coaches", "Kit and equipment included", "Tournaments every season"].flatMap((t, i) => {
        const y = 1000 * k + i * 62;
        return [circle(84, y + 20, 44, p.acc, { name: "Check" }), icon("Check", 66, y + 2, 36, p.ink, 3), T(130, y + 2, 560, t, 32, { font: I, weight: 500, color: "#ffffff", name: "Benefit" })];
      }),
      circle(W - 190, 1120 * k, 220, p.acc2 === "#ffffff" ? p.acc : p.acc2, { name: "Trial badge" }), ring(W - 190, 1120 * k, 256, p.acc2 === "#ffffff" ? p.acc : p.acc2, 3),
      T(W - 300, 1120 * k - 54, 220, "FREE\nTRIAL", 46, { font: A, color: p.acc2 === "#ffffff" ? p.ink : "#ffffff", align: "center", lh: 1.05, name: "Trial" }),
      ...pillLabel(60, H - 120, "AGES 8 – 18", 24, alpha("#ffffff", 0.12), "#ffffff", I, 700, 1.2, 2),
      icon("Phone", W - 470, H - 108, 34, p.acc), T(W - 420, H - 106, 360, "+960 777 0000", 32, { font: O, weight: 700, color: "#ffffff", name: "Phone" }),
    ];
  },
  champions: ({ p, s, H }) => {
    const ph = STOCK["trophy-gold"] ? "trophy-gold" : "trophy-classic";
    const confetti: DesignNode[] = Array.from({ length: 34 }, (_, i) => {
      const x = (i * 337) % W, y = ((i * 211) % 520) + 40; const c = [p.acc, p.acc2, "#ffffff"][i % 3];
      return rect(x, y, 14 + (i % 3) * 6, 30, c, { rotation: (i * 47) % 180, cornerRadius: 3, opacity: 0.8, name: "Confetti" });
    });
    const tro = photo(ph, W / 2 - 300, 230, 600, 600, { radius: 300, adjust: { contrast: 10, vibrance: 20 } });
    return [
      rect(0, 0, W, H, lg(90, [0, p.bg2], [1, p.bg]), { name: "Background" }),
      ellipse(W / 2 - 520, 0, 1040, 1040, { type: "radial", stops: [{ offset: 0, color: alpha(p.acc, 0.35) }, { offset: 1, color: alpha(p.acc, 0) }] }, { name: "Glow" }),
      rings(W / 2, 530, 900, 6, p.acc, 2, 0.18),
      ...confetti,
      outlineText(0, 80, W, "2026", 300, alpha(p.acc, 0.5), 4, { font: A, align: "center" }),
      ring(W / 2, 530, 640, p.acc, 6), tro,
      fit(60, 880, W - 120, "CHAMPIONS", 200, { font: A, color: "#ffffff", align: "center", name: "Headline" }),
      ...[0, 1, 2, 3, 4].map((i) => star(W / 2 - 160 + i * 80, 1110, 50, 5, 0.45, p.acc, { name: "Star" })),
      T(60, 1160, W - 120, `${s.teams[0] || "CORAL SHARKS"} · ${s.league}`, 30, { font: O, weight: 500, color: p.acc, align: "center", ls: 3, name: "Team" }),
      T(60, 1220, W - 120, "Thank you to our players, coaches and amazing fans.", 30, { font: I, color: p.muted, align: "center", name: "Thanks" }),
    ];
  },
};

const LABEL: Record<string, string> = { matchday: "Match day", result: "Final score", player: "Player spotlight", fixtures: "Fixtures", tournament: "Tournament", lineup: "Starting XI", run: "Fun run", join: "Join the team", champions: "Champions" };
const STORY = new Set(["matchday", "fixtures", "lineup", "tournament"]);

function generate(): Template[] {
  const out: Template[] = [];
  SPORTS.forEach((s, si) => {
    const photos = s.photos.filter((x) => STOCK[x]);
    s.designs.forEach((d, di) => {
      const nPal = s.id === "football" ? 3 : 2;
      for (let v = 0; v < nPal; v++) {
        const p = PALS[(si + di * 2 + v * 3) % PALS.length];
        const ph = photos[(di + v) % photos.length] ?? "stadium";
        const story = (d === "lineup") || (STORY.has(d) && v === 1);
        const H = story ? 1920 : 1350;
        out.push({
          id: `sport-${s.id}-${d}-${v}`, title: `${s.name} ${LABEL[d].toLowerCase()}`, category: "Sports", format: story ? "Story" : "Instagram post",
          tags: ["sports", s.id, s.name.toLowerCase(), d, LABEL[d].toLowerCase(), "team", "match", "club"],
          build: () => docOf(W, H, 96, "px", { type: "solid", color: p.bg }, D[d]({ p, s, ph, H })),
        });
      }
    });
  });
  return out;
}

export const SPORTS_TEMPLATES: Template[] = generate();

