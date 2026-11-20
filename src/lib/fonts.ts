// Fonts available in the editor. All are open-licensed (SIL OFL / Apache) and self-hosted via
// @fontsource, so designs render the same on every device and in exports.
export type FontDef = { family: string; weights: number[]; italic: boolean; script: "latin" | "thaana"; category: string };

export const FONTS: FontDef[] = [
  { family: "Inter", weights: [400, 500, 600, 700, 800], italic: false, script: "latin", category: "Sans" },
  { family: "Noto Sans Thaana", weights: [400, 500, 600, 700, 800], italic: false, script: "thaana", category: "Dhivehi" },
  { family: "Poppins", weights: [400, 500, 600, 700, 800], italic: true, script: "latin", category: "Sans" },
  { family: "Montserrat", weights: [400, 500, 600, 700, 800], italic: true, script: "latin", category: "Sans" },
  { family: "Roboto", weights: [400, 500, 700], italic: true, script: "latin", category: "Sans" },
  { family: "Oswald", weights: [400, 500, 600, 700], italic: false, script: "latin", category: "Display" },
  { family: "Bebas Neue", weights: [400], italic: false, script: "latin", category: "Display" },
  { family: "Playfair Display", weights: [400, 500, 600, 700, 800], italic: true, script: "latin", category: "Serif" },
  { family: "Lora", weights: [400, 500, 600, 700], italic: true, script: "latin", category: "Serif" },
  { family: "Dancing Script", weights: [400, 500, 600, 700], italic: false, script: "latin", category: "Script" },
];

export const fontDef = (family: string) => FONTS.find((f) => f.family === family) ?? FONTS[0];

/** Nearest available weight, so a design never asks for a weight the font does not have. */
export function nearestWeight(family: string, w: number): number {
  const ws = fontDef(family).weights;
  return ws.reduce((best, x) => (Math.abs(x - w) < Math.abs(best - w) ? x : best), ws[0]);
}

/**
 * CSS font stack for canvas text. Thaana characters always fall back to Noto Sans Thaana, so a
 * Latin font with mixed Dhivehi text still shows correct Thaana glyphs instead of boxes.
 */
export function fontStack(family: string): string {
  return family === "Noto Sans Thaana" ? `"Noto Sans Thaana", "Inter"` : `"${family}", "Noto Sans Thaana"`;
}

/** Wait until every font a page uses is loaded, before rendering or exporting. */
export async function ensureFonts(specs: { family: string; weight: number; italic: boolean }[]): Promise<void> {
  if (typeof document === "undefined" || !document.fonts) return;
  const uniq = new Map(specs.map((s) => [`${s.family}|${s.weight}|${s.italic}`, s]));
  await Promise.all(
    [...uniq.values()].flatMap((s) => [
      document.fonts.load(`${s.italic ? "italic " : ""}${s.weight} 32px "${s.family}"`, "Aa"),
      document.fonts.load(`${s.weight} 32px "Noto Sans Thaana"`, "ދިވެހި"),
    ]),
  );
}
