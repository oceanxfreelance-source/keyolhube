// Starting sizes. Print sizes are stored at 300 DPI so exports are print-ready.
export type Preset = { id: string; name: string; group: string; width: number; height: number; dpi: number; unit: "px" | "mm" | "in"; note?: string };

const mm = (v: number, dpi = 300) => Math.round((v / 25.4) * dpi);
const inch = (v: number, dpi = 300) => Math.round(v * dpi);

export const PRESETS: Preset[] = [
  { id: "ig-post", name: "Instagram post", group: "Social media", width: 1080, height: 1350, dpi: 96, unit: "px", note: "4:5" },
  { id: "ig-square", name: "Square post", group: "Social media", width: 1080, height: 1080, dpi: 96, unit: "px" },
  { id: "story", name: "Story / Status", group: "Social media", width: 1080, height: 1920, dpi: 96, unit: "px", note: "Instagram, WhatsApp, TikTok" },
  { id: "fb-post", name: "Facebook post", group: "Social media", width: 1200, height: 630, dpi: 96, unit: "px" },
  { id: "fb-cover", name: "Facebook cover", group: "Social media", width: 1640, height: 624, dpi: 96, unit: "px" },
  { id: "yt-thumb", name: "YouTube thumbnail", group: "Social media", width: 1280, height: 720, dpi: 96, unit: "px" },
  { id: "a4", name: "A4 poster / flyer", group: "Print", width: mm(210), height: mm(297), dpi: 300, unit: "mm", note: "210 × 297 mm" },
  { id: "a3", name: "A3 poster", group: "Print", width: mm(297), height: mm(420), dpi: 300, unit: "mm", note: "297 × 420 mm" },
  { id: "a2", name: "A2 poster", group: "Print", width: mm(420), height: mm(594), dpi: 300, unit: "mm", note: "420 × 594 mm" },
  { id: "a5", name: "A5 leaflet", group: "Print", width: mm(148), height: mm(210), dpi: 300, unit: "mm", note: "148 × 210 mm" },
  { id: "card", name: "Business card", group: "Print", width: mm(90), height: mm(55), dpi: 300, unit: "mm", note: "90 × 55 mm" },
  { id: "banner-3x6", name: "Banner 3 × 6 ft", group: "Print", width: inch(72, 100), height: inch(36, 100), dpi: 100, unit: "in", note: "Large-format, 100 DPI" },
  { id: "pres", name: "Presentation 16:9", group: "Presentation", width: 1920, height: 1080, dpi: 96, unit: "px" },
];

export const toUnit = (px: number, unit: "px" | "mm" | "in", dpi: number) =>
  unit === "px" ? px : unit === "mm" ? (px / dpi) * 25.4 : px / dpi;
export const fromUnit = (v: number, unit: "px" | "mm" | "in", dpi: number) =>
  Math.round(unit === "px" ? v : unit === "mm" ? (v / 25.4) * dpi : v * dpi);
