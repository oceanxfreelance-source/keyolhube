// Fonts: a built-in set (self-hosted, always available), the Google Fonts library (loaded on
// demand from fonts.googleapis.com) and fonts the user uploads. Designs list the non-built-in
// fonts they use (doc.fonts) so they render identically on any device and in exports.
import type { DesignDoc, FontRef } from "./doc/types";

export type FontDef = { family: string; weights: number[]; italics: number[]; category: string; source: "builtin" | "google" | "upload"; scripts?: string[] };

const b = (family: string, weights: number[], italics: number[], category: string): FontDef => ({ family, weights, italics, category, source: "builtin" });
export const BUILTIN: FontDef[] = [
  b("Inter", [400, 500, 600, 700, 800], [], "sans"),
  b("Noto Sans Thaana", [400, 500, 600, 700, 800], [], "dhivehi"),
  b("Poppins", [400, 500, 600, 700, 800], [400, 700], "sans"),
  b("Montserrat", [400, 500, 600, 700, 800], [400, 700], "sans"),
  b("Roboto", [400, 500, 700], [400, 700], "sans"),
  b("Oswald", [400, 500, 600, 700], [], "display"),
  b("Bebas Neue", [400], [], "display"),
  b("Playfair Display", [400, 500, 600, 700, 800], [400, 700], "serif"),
  b("Lora", [400, 500, 600, 700], [400, 700], "serif"),
  b("Dancing Script", [400, 500, 600, 700], [], "script"),
];
/** Back-compat for code that lists the built-in fonts. */
export const FONTS = BUILTIN;

// Fonts known in this browser session (built-in + any Google/uploaded font registered so far).
const registry = new Map<string, FontDef>(BUILTIN.map((f) => [f.family, f]));
const loading = new Map<string, Promise<void>>();

export function fontDef(family: string): FontDef {
  return registry.get(family) ?? { family, weights: [400], italics: [], category: "sans", source: "google" };
}
export function hasItalic(family: string, weight: number): boolean {
  return fontDef(family).italics.includes(nearestWeight(family, weight));
}

/** Nearest available weight, so a design never asks for a weight the font does not have. */
export function nearestWeight(family: string, w: number): number {
  const ws = fontDef(family).weights;
  return ws.reduce((best, x) => (Math.abs(x - w) < Math.abs(best - w) ? x : best), ws[0] ?? 400);
}

/**
 * CSS font stack for canvas text. Thaana always falls back to Noto Sans Thaana, so a Latin font
 * with mixed Dhivehi text still shows correct Thaana glyphs instead of boxes.
 */
export function fontStack(family: string): string {
  const q = `"${family.replace(/"/g, "")}"`;
  return family === "Noto Sans Thaana" ? `${q}, "Inter"` : `${q}, "Noto Sans Thaana"`;
}

// ---------- Google Fonts catalogue ----------
export type GoogleFont = { family: string; category: string; weights: number[]; italics: number[]; scripts: string[] };
let catalogue: Promise<GoogleFont[]> | null = null;
export function googleCatalogue(): Promise<GoogleFont[]> {
  catalogue ??= fetch("/fonts/google-fonts.json").then((r) => r.json()).then((d: { fonts: [string, string, number[], number[], string[]][] }) =>
    d.fonts.map(([family, category, weights, italics, scripts]) => ({ family, category, weights, italics, scripts })));
  return catalogue;
}

export function googleCssUrl(f: { family: string; weights: number[]; italics: number[] }): string {
  const tuples = [...f.weights.map((w) => `0,${w}`), ...f.italics.map((w) => `1,${w}`)];
  const fam = encodeURIComponent(f.family).replace(/%20/g, "+");
  return f.italics.length
    ? `https://fonts.googleapis.com/css2?family=${fam}:ital,wght@${tuples.join(";")}&display=block`
    : `https://fonts.googleapis.com/css2?family=${fam}:wght@${f.weights.join(";")}&display=block`;
}

/** Make a font available (stylesheet / FontFace) and register its weights. Safe to call often. */
export function registerFont(ref: FontRef): Promise<void> {
  const key = ref.source === "google" ? `g:${ref.family}` : `u:${ref.assetId}`;
  if (registry.get(ref.family)?.source === "builtin") return Promise.resolve();
  let p = loading.get(key);
  if (p) return p;
  if (ref.source === "google") {
    registry.set(ref.family, { family: ref.family, weights: ref.weights, italics: ref.italics, category: "google", source: "google" });
    p = new Promise<void>((resolve, reject) => {
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = googleCssUrl(ref);
      link.crossOrigin = "anonymous";
      link.onload = () => resolve();
      link.onerror = () => reject(new Error(`Could not load the font "${ref.family}" (offline?)`));
      document.head.appendChild(link);
    });
  } else {
    const prev = registry.get(ref.family);
    const weights = [...new Set([...(prev?.source === "upload" ? prev.weights : []), ref.weight])].sort((a, c) => a - c);
    const italics = ref.italic ? [...new Set([...(prev?.italics ?? []), ref.weight])] : prev?.italics ?? [];
    registry.set(ref.family, { family: ref.family, weights, italics, category: "upload", source: "upload" });
    const face = new FontFace(ref.family, `url(/api/assets/${ref.assetId})`, { weight: String(ref.weight), style: ref.italic ? "italic" : "normal" });
    p = face.load().then((f) => { document.fonts.add(f); });
  }
  p = p.catch((e) => { loading.delete(key); throw e; });
  loading.set(key, p);
  return p;
}

/** Register every font a design lists (call before rendering or exporting it). */
export async function loadDocFonts(doc: Pick<DesignDoc, "fonts">): Promise<string[]> {
  const failed: string[] = [];
  await Promise.all((doc.fonts ?? []).map((f) => registerFont(f).catch(() => { failed.push(f.family); })));
  return failed;
}

/** Wait until every font a page uses is loaded, before rendering or exporting. */
export async function ensureFonts(specs: { family: string; weight: number; italic: boolean }[]): Promise<void> {
  if (typeof document === "undefined" || !document.fonts) return;
  const uniq = new Map(specs.map((s) => [`${s.family}|${s.weight}|${s.italic}`, s]));
  await Promise.all(
    [...uniq.values()].flatMap((s) => [
      document.fonts.load(`${s.italic ? "italic " : ""}${s.weight} 32px "${s.family}"`, "Aa"),
      document.fonts.load(`${s.weight} 32px "Noto Sans Thaana"`, "ދިވެހި"),
    ]).map((p) => p.catch(() => [])),
  );
}
