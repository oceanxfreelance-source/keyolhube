// "Magic layers": turn a flat design image into editable layers, entirely in the browser.
//  1. OCR (Tesseract.js, Apache-2.0) finds the text lines.
//  2. Each block becomes a text layer with an estimated colour, size, weight and alignment.
//  3. The text pixels (and optionally the person) are removed from the background and the
//     holes are filled from the surrounding pixels (see inpaint.ts).
//  4. Optionally the person is cut out onto their own layer (MediaPipe, see bgremove.ts).
// Fonts are estimated (the exact typeface cannot be recognised); every layer can be restyled.
import { inpaint } from "./inpaint";

export type MagicText = {
  text: string; x: number; y: number; width: number; size: number; lineHeight: number; letterSpacing: number;
  color: string; weight: number; font: string; align: "left" | "center" | "right"; rtl: boolean;
};
export type MagicResult = { width: number; height: number; background: Blob; person: Blob | null; personNote: string | null; texts: MagicText[] };
export type MagicOptions = { dhivehi: boolean; person: boolean; onStep?: (label: string, pct?: number) => void };

const MAX_WORK = 2400;
const THAANA = /[ހ-޿]/;

type Box = { x0: number; y0: number; x1: number; y1: number };
type Line = { text: string; bbox: Box; conf: number; ink?: number[] };

/** Run magic layers on an image (already cropped to what the user sees). */
export async function magicLayers(src: CanvasImageSource & { width: number; height: number }, opts: MagicOptions): Promise<MagicResult> {
  const step = opts.onStep ?? (() => {});
  const s = Math.min(1, MAX_WORK / Math.max(src.width, src.height));
  const W = Math.max(1, Math.round(src.width * s)), H = Math.max(1, Math.round(src.height * s));
  const cv = document.createElement("canvas");
  cv.width = W; cv.height = H;
  const ctx = cv.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(src, 0, 0, W, H);
  const img = ctx.getImageData(0, 0, W, H);

  // ---- 1. OCR: sparse-text mode (posters have scattered text), at full and reduced size ----
  step("Loading the text reader (first time only)…", 0);
  const { createWorker, PSM } = await import("tesseract.js");
  let pass = 0;
  const worker = await createWorker(opts.dhivehi ? ["eng", "div"] : "eng", 1, {
    logger: (m: { status: string; progress: number }) => { if (m.status === "recognizing text") step("Reading the text…", Math.round(((pass + m.progress) / 2) * 100)); },
  });
  let found: Line[] = [];
  try {
    await worker.setParameters({ tessedit_pageseg_mode: PSM.SPARSE_TEXT });
    // small images are read at double size: OCR needs letters about 20 px tall or more
    const up = Math.max(W, H) < 1400 ? 2 : 1;
    let mainSrc: HTMLCanvasElement = cv;
    if (up > 1) { mainSrc = document.createElement("canvas"); mainSrc.width = W * up; mainSrc.height = H * up; const uctx = mainSrc.getContext("2d")!; uctx.imageSmoothingQuality = "high"; uctx.drawImage(cv, 0, 0, mainSrc.width, mainSrc.height); }
    const full = readLines((await worker.recognize(mainSrc, {}, { blocks: true })).data as unknown as OcrData, 1 / up);
    pass = 1;
    let small: Line[] = [];
    if (Math.max(W, H) > 700) {
      const k = 0.4, sc = document.createElement("canvas");
      sc.width = Math.round(W * k); sc.height = Math.round(H * k);
      const sctx = sc.getContext("2d")!; sctx.imageSmoothingQuality = "high"; sctx.drawImage(cv, 0, 0, sc.width, sc.height);
      small = readLines((await worker.recognize(sc, {}, { blocks: true })).data as unknown as OcrData, 1 / k);
    }
    found = mergeLines(full, small);
  } finally {
    await worker.terminate();
  }
  found = found.map((l) => { const bbox = tighten(img, l.bbox); return { ...l, bbox, ink: lineStyle(img, bbox).ink }; }).filter((l) => l.bbox.y1 - l.bbox.y0 >= 5);
  const lines = groupLines(found);

  // ---- 2. text layers + text mask ----
  step("Matching colours and sizes…");
  const mask = new Uint8Array(W * H);
  const texts: MagicText[] = [];
  for (const group of lines) {
    const styles = group.map((l) => lineStyle(img, l.bbox));
    for (const l of group) markText(img, mask, l.bbox, styles[group.indexOf(l)]);
    texts.push(await textLayer(group, styles, W));
  }

  // ---- 3. person ----
  let person: Blob | null = null, personNote: string | null = null;
  if (opts.person) {
    step("Finding the person…");
    try {
      const { removeBackground } = await import("./bgremove");
      const el = await canvasToImage(cv);
      const r = await removeBackground(el);
      person = r.blob;
      const pim = await blobToImage(r.blob);
      const pc = document.createElement("canvas"); pc.width = W; pc.height = H;
      const pctx = pc.getContext("2d")!; pctx.drawImage(pim, 0, 0, W, H);
      const a = pctx.getImageData(0, 0, W, H).data;
      for (let i = 0; i < W * H; i++) if (a[i * 4 + 3] > 100) mask[i] = 255;
    } catch (e) {
      personNote = (e as Error).message;
    }
  }

  // ---- 4. clean background ----
  step("Removing the text from the background…");
  dilate(mask, W, H, Math.max(2, Math.round(Math.min(W, H) / 350)));
  await new Promise((r) => setTimeout(r, 0));
  const filled = inpaint({ data: img.data, width: W, height: H }, mask);
  img.data.set(filled.data);
  ctx.putImageData(img, 0, 0);
  const background = await new Promise<Blob>((res, rej) => cv.toBlob((b) => (b ? res(b) : rej(new Error("Could not create the image"))), "image/jpeg", 0.93));
  return { width: W, height: H, background, person, personNote, texts };
}

// ---------------- OCR structure ----------------
type OcrWord = { text: string; confidence: number; bbox: Box };
type OcrLine = { text: string; confidence: number; bbox: Box; words: OcrWord[] };
type OcrData = { blocks: { paragraphs: { lines: OcrLine[] }[] }[] | null };

function readLines(d: OcrData, scale: number): Line[] {
  const out: Line[] = [];
  for (const b of d.blocks ?? []) for (const p of b.paragraphs) for (const l of p.lines) {
    // drop low-confidence words and icon misreads like "BE]" or "©)"
    const words = l.words.filter((w) => w.confidence >= 50 && /[\p{L}\p{N}]/u.test(w.text) && !(/[\[\]{}|©®<>]/.test(w.text) && w.text.length <= 4));
    const text = words.map((w) => w.text).join(" ").trim();
    const plain = text.replace(/\s/g, "");
    if (!words.length || l.confidence < 55 || !/[\p{L}\p{N}]{2}/u.test(plain)) continue;
    if (l.confidence < 60) continue;
    const alnum = plain.match(/[\p{L}\p{N}]/gu)?.length ?? 0;
    if (alnum <= (/^[\d:.,/%$-]+$/.test(plain) ? 2 : 4) && l.confidence < 82) continue; // stray fragments (half-hidden words, ornaments)
    const bbox = { x0: Math.min(...words.map((w) => w.bbox.x0)), y0: Math.min(...words.map((w) => w.bbox.y0)), x1: Math.max(...words.map((w) => w.bbox.x1)), y1: Math.max(...words.map((w) => w.bbox.y1)) };
    out.push({ text, conf: l.confidence, bbox: { x0: Math.round(bbox.x0 * scale), y0: Math.round(bbox.y0 * scale), x1: Math.round(bbox.x1 * scale), y1: Math.round(bbox.y1 * scale) } });
  }
  return out;
}
const area = (b: Box) => Math.max(0, b.x1 - b.x0) * Math.max(0, b.y1 - b.y0);
const inter = (a: Box, b: Box) => area({ x0: Math.max(a.x0, b.x0), y0: Math.max(a.y0, b.y0), x1: Math.min(a.x1, b.x1), y1: Math.min(a.y1, b.y1) });
/** Full-size lines win; the reduced pass adds large lettering the full pass missed. */
function mergeLines(full: Line[], small: Line[]): Line[] {
  const out = [...full];
  for (const s of small) {
    const hs = s.bbox.y1 - s.bbox.y0;
    const overl = out.filter((f) => inter(f.bbox, s.bbox) > 0.3 * Math.min(area(f.bbox), area(s.bbox)));
    if (!overl.length) { out.push(s); continue; }
    // replace fragments (e.g. single letters of a huge headline) by the reduced-pass line
    if (overl.every((f) => f.text.replace(/\s/g, "").length <= Math.max(2, s.text.length / 3) || (f.bbox.y1 - f.bbox.y0) < hs * 0.6 && f.text.length < s.text.length)) {
      for (const f of overl) out.splice(out.indexOf(f), 1);
      out.push(s);
    }
  }
  return out;
}
/** Lines of the same size that sit one under another, aligned, form one text block. */
function groupLines(ls: Line[]): Line[][] {
  const sorted = [...ls].sort((a, b) => a.bbox.y0 - b.bbox.y0);
  const groups: Line[][] = [];
  for (const l of sorted) {
    const h = l.bbox.y1 - l.bbox.y0;
    const g = groups.find((gr) => {
      const p = gr[gr.length - 1], hp = p.bbox.y1 - p.bbox.y0;
      if (Math.abs(h - hp) / Math.max(h, hp) > 0.3) return false;
      if (l.ink && p.ink && Math.hypot(l.ink[0] - p.ink[0], l.ink[1] - p.ink[1], l.ink[2] - p.ink[2]) > 60) return false;
      const gap = l.bbox.y0 - p.bbox.y1;
      if (gap < -h * 0.3 || gap > Math.max(h, hp) * 1.0) return false;
      const tol = Math.max(h, hp) * 0.8;
      const lAl = Math.abs(l.bbox.x0 - p.bbox.x0) < tol, cAl = Math.abs((l.bbox.x0 + l.bbox.x1) / 2 - (p.bbox.x0 + p.bbox.x1) / 2) < tol, rAl = Math.abs(l.bbox.x1 - p.bbox.x1) < tol;
      return lAl || cAl || rAl;
    });
    if (g) g.push(l); else groups.push([l]);
  }
  return groups;
}
/** Shrink a box vertically to the rows that really hold the text (drops ornaments above/below). */
function tighten(img: ImageData, b: Box): Box {
  const st = lineStyle(img, b);
  const { data: d, width: W } = img;
  const rows: number[] = [];
  for (let y = b.y0; y < b.y1; y++) { let c = 0; for (let x = b.x0; x < b.x1; x++) if (dist(d, (y * W + x) * 4, st.bg) > st.thr) c++; rows.push(c); }
  const mx = Math.max(0, ...rows); if (!mx) return b;
  const t = Math.max(0.5, mx * 0.03), maxGap = Math.max(1, Math.round(rows.length * 0.04));
  // runs of inked rows (small gaps allowed); the heaviest run is the text, others are ornaments
  let best = { a: 0, z: -1, sum: 0 }, cur = { a: -1, z: -1, sum: 0 }, gap = 0;
  rows.forEach((c, i) => {
    if (c > t) { if (cur.a < 0) cur = { a: i, z: i, sum: 0 }; cur.z = i; cur.sum += c; gap = 0; }
    else if (cur.a >= 0 && ++gap > maxGap) { if (cur.sum > best.sum) best = cur; cur = { a: -1, z: -1, sum: 0 }; gap = 0; }
  });
  if (cur.a >= 0 && cur.sum > best.sum) best = cur;
  if (best.z < 0) return b;
  const top = best.a, bot = best.z;
  return { x0: b.x0, x1: b.x1, y0: b.y0 + top, y1: b.y0 + bot + 1 };
}

// ---------------- colour ----------------
type Style = { bg: number[]; ink: number[]; inkRatio: number; thr: number };
const dist = (d: Uint8ClampedArray, i: number, c: number[]) => Math.hypot(d[i] - c[0], d[i + 1] - c[1], d[i + 2] - c[2]);
function median(v: number[]) { if (!v.length) return 0; const s = [...v].sort((a, b) => a - b); return s[s.length >> 1]; }
function lineStyle(img: ImageData, b: Box): Style {
  const { data: d, width: W, height: H } = img;
  const h = b.y1 - b.y0, pad = Math.max(2, Math.round(h * 0.18));
  const R: number[] = [], G: number[] = [], B: number[] = [];
  const ring = (x: number, y: number) => { if (x < 0 || y < 0 || x >= W || y >= H) return; const i = (y * W + x) * 4; R.push(d[i]); G.push(d[i + 1]); B.push(d[i + 2]); };
  for (let x = b.x0 - pad; x <= b.x1 + pad; x += 2) { ring(x, b.y0 - pad); ring(x, b.y1 + pad); }
  for (let y = b.y0 - pad; y <= b.y1 + pad; y += 2) { ring(b.x0 - pad, y); ring(b.x1 + pad, y); }
  const bg = [median(R), median(G), median(B)];
  // distances inside the box; the text is the far cluster
  const ds: number[] = [];
  for (let y = b.y0; y < b.y1; y++) for (let x = b.x0; x < b.x1; x++) { const i = (y * W + x) * 4; ds.push(dist(d, i, bg)); }
  const far = Math.max(1, ds.reduce((m, v) => Math.max(m, v), 0));
  const thr = Math.max(38, far * 0.45);
  const IR: number[] = [], IG: number[] = [], IB: number[] = [];
  let n = 0, k = 0;
  for (let y = b.y0; y < b.y1; y++) for (let x = b.x0; x < b.x1; x++, k++) {
    if (ds[k] > Math.max(thr, far * 0.7)) { const i = (y * W + x) * 4; IR.push(d[i]); IG.push(d[i + 1]); IB.push(d[i + 2]); }
    if (ds[k] > thr) n++;
  }
  return { bg, ink: [median(IR), median(IG), median(IB)], inkRatio: n / Math.max(1, ds.length), thr };
}
function markText(img: ImageData, mask: Uint8Array, b: Box, st: Style) {
  const { data: d, width: W, height: H } = img;
  const h = b.y1 - b.y0, pad = Math.round(h * 0.12);
  for (let y = Math.max(0, b.y0 - pad); y < Math.min(H, b.y1 + pad); y++)
    for (let x = Math.max(0, b.x0 - pad); x < Math.min(W, b.x1 + pad); x++) {
      const i = y * W + x;
      if (dist(d, i * 4, st.bg) > st.thr * 0.45) mask[i] = 255;
    }
}
function dilate(mask: Uint8Array, W: number, H: number, r: number) {
  const tmp = new Uint8Array(mask.length);
  for (let y = 0; y < H; y++) { let run = -1e9; for (let x = 0; x < W; x++) { if (mask[y * W + x]) run = x; if (x - run <= r) tmp[y * W + x] = 255; } run = 1e9; for (let x = W - 1; x >= 0; x--) { if (mask[y * W + x]) run = x; if (run - x <= r) tmp[y * W + x] = 255; } }
  for (let x = 0; x < W; x++) { let run = -1e9; for (let y = 0; y < H; y++) { if (tmp[y * W + x]) run = y; if (y - run <= r) mask[y * W + x] = 255; } run = 1e9; for (let y = H - 1; y >= 0; y--) { if (tmp[y * W + x]) run = y; if (run - y <= r) mask[y * W + x] = 255; } }
}
const hex = (c: number[]) => "#" + c.map((v) => Math.round(v).toString(16).padStart(2, "0")).join("");

// ---------------- text layer ----------------
let measureCtx: CanvasRenderingContext2D | null = null;
function measure(font: string, weight: number, text: string) {
  measureCtx ??= document.createElement("canvas").getContext("2d")!;
  measureCtx.font = `${weight} 100px "${font}"`;
  return measureCtx.measureText(text).width / 100;
}
async function textLayer(group: Line[], styles: Style[], W: number): Promise<MagicText> {
  const rtl = group.some((l) => THAANA.test(l.text));
  const hs = group.map((l) => l.bbox.y1 - l.bbox.y0);
  const h = median(hs);
  const ink = styles.map((s) => s.inkRatio);
  const caps = group.every((l) => l.text === l.text.toUpperCase());
  const inkR = median(ink);
  const weight = inkR > 0.42 ? 800 : inkR > 0.32 ? 700 : inkR > 0.24 ? 600 : 400;
  // Typeface: the candidate whose natural width at the measured letter height best matches the
  // original (narrower is acceptable: the gap becomes letter spacing).
  const first = group[0], bw0 = first.bbox.x1 - first.bbox.x0;
  const ratio0 = !/[a-z]/.test(first.text) ? 0.73 : /[gjpqy]/.test(first.text) ? 0.97 : 0.77;
  const sizeH0 = hs[0] / ratio0;
  const cands = rtl ? ["Noto Sans Thaana"] : caps ? ["Montserrat", "Inter", "Oswald", "Bebas Neue"] : ["Inter", "Oswald"];
  const wOf = (f: string) => (f === "Bebas Neue" ? 400 : f === "Oswald" ? Math.min(700, Math.max(400, weight)) : weight);
  let font = cands[0], bestScore = Infinity;
  for (const f of cands) {
    try { await document.fonts.load(`${wOf(f)} 100px "${f}"`, first.text); } catch { /* fallback */ }
    const nat = measure(f, wOf(f), first.text) * sizeH0;
    const score = nat >= bw0 ? (nat - bw0) / bw0 : ((bw0 - nat) / bw0) * 0.7;
    if (score < bestScore) { bestScore = score; font = f; }
  }
  const fw = wOf(font);
  // Size from the letter height (cap height for capitals, ascender to descender otherwise),
  // then letter spacing from the width; if the estimated font is too wide, shrink to fit.
  const fits = group.map((l, i) => {
    const t = l.text, bw = l.bbox.x1 - l.bbox.x0;
    const ratio = !/[a-z]/.test(t) ? (/[,;Qj]/.test(t) ? 0.86 : 0.73) : /[gjpqy]/.test(t) ? 0.97 : 0.77;
    let size = hs[i] / ratio;
    const m = measure(font, fw, t);
    // sentences in mixed case are rarely letter-spaced: their width is the better guide
    if (/[a-z]/.test(t) && t.length > 10) return { size: Math.min(Math.max(bw / Math.max(0.01, m), hs[i] * 0.9), hs[i] * 1.5), ls: 0 };
    if (m * size > bw * 1.03) size = bw / Math.max(0.01, m);
    const ls = Math.max(0, Math.min(size * 0.6, (bw - m * size) / Math.max(1, t.length)));
    return { size, ls: ls < size * 0.02 ? 0 : ls };
  });
  const size = Math.max(6, Math.round(median(fits.map((f) => f.size))));
  const letterSpacing = Math.round(median(fits.map((f) => f.ls)) * 10) / 10;
  const lineHeight = group.length > 1 ? Math.max(0.9, Math.min(2, median(group.slice(1).map((l, i) => l.bbox.y0 - group[i].bbox.y0)) / size)) : 1.2;
  const lefts = group.map((l) => l.bbox.x0), rights = group.map((l) => l.bbox.x1), mids = group.map((l) => (l.bbox.x0 + l.bbox.x1) / 2);
  const spread = (v: number[]) => Math.max(...v) - Math.min(...v);
  let align: MagicText["align"];
  if (group.length > 1) {
    const sl = spread(lefts), sr = spread(rights), sm = spread(mids);
    align = sm < sl && sm < sr ? "center" : sr < sl ? "right" : "left";
  } else align = rtl ? "right" : Math.abs(mids[0] - W / 2) < W * 0.03 ? "center" : "left";
  const maxW = Math.max(...group.map((l) => l.bbox.x1 - l.bbox.x0));
  const width = Math.min(W, maxW * 1.08 + size * 0.4);
  const x = align === "left" ? Math.min(...lefts) - size * 0.04 : align === "right" ? Math.max(...rights) - width + size * 0.04 : median(mids) - width / 2;
  const capsOnly = !/[a-z]/.test(group[0].text);
  const capTop = size * ((lineHeight - 1) / 2 + (capsOnly ? 0.24 : 0.2)); // top of the line box above the visible glyphs
  return {
    text: group.map((l) => l.text).join("\n"), x: Math.max(0, x), y: Math.max(0, group[0].bbox.y0 - capTop), width,
    size, lineHeight, letterSpacing, color: hex(styles[0].ink), weight: fw, font, align, rtl,
  };
}

// ---------------- helpers ----------------
function canvasToImage(cv: HTMLCanvasElement): Promise<HTMLImageElement> {
  return new Promise((res, rej) => cv.toBlob((b) => (b ? blobToImage(b).then(res, rej) : rej(new Error("Could not read the image"))), "image/png"));
}
function blobToImage(b: Blob): Promise<HTMLImageElement> {
  return new Promise((res, rej) => { const u = URL.createObjectURL(b); const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error("Could not read the image")); i.src = u; });
}
