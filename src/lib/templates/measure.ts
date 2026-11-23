import { CHARS, WIDTHS } from "./metrics";

// ---------------- text measurement (real font metrics) ----------------
const tables = new Map<string, Map<string, number>>();
function table(font: string, weight: number) {
  const key = `${font}|${weight}`;
  let t = tables.get(key);
  if (!t) {
    const keys = Object.keys(WIDTHS).filter((k) => k.startsWith(font + "|"));
    const best = keys.sort((a, b) => Math.abs(+a.split("|")[1] - weight) - Math.abs(+b.split("|")[1] - weight))[0] ?? "Inter|400";
    const ws = WIDTHS[best].split(",").map(Number);
    t = new Map([...CHARS].map((c, i) => [c, ws[i]]));
    tables.set(key, t);
  }
  return t;
}
/** Width of one line of text in pixels. */
export function textW(font: string, weight: number, text: string, size: number, ls = 0) {
  const t = table(font, weight); let w = 0;
  for (const ch of text) w += t.get(ch) ?? t.get("M")!;
  return (w * size) / 100 + ls * text.length;
}
/** Number of lines after word wrapping. */
export function wrapLines(font: string, weight: number, text: string, size: number, width: number) {
  let n = 0;
  for (const para of text.split("\n")) {
    let line = ""; n++;
    for (const word of para.split(" ")) {
      const next = line ? `${line} ${word}` : word;
      if (line && textW(font, weight, next, size) > width) { n++; line = word; } else line = next;
    }
  }
  return n;
}


/** Largest font size (up to max) at which every line fits in the width. */
export function fitSize(font: string, weight: number, text: string, width: number, max: number, lsPerSize = 0) {
  const widest = Math.max(...text.split("\n").map((l) => textW(font, weight, l, 100) + lsPerSize * 100 * l.length));
  return Math.floor(Math.min(max, (width * 0.96 * 100) / widest));
}
