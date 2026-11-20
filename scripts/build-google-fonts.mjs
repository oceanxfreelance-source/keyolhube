// Builds public/fonts/google-fonts.json from Google's public font metadata.
// Run: node scripts/build-google-fonts.mjs   (re-run occasionally to pick up new families)
import { writeFileSync } from "node:fs";

const CAT = { "Sans Serif": "sans", Serif: "serif", Display: "display", Handwriting: "script", Monospace: "mono" };
const res = await fetch("https://fonts.google.com/metadata/fonts");
if (!res.ok) throw new Error(`metadata fetch failed: ${res.status}`);
const meta = await res.json();
const rows = meta.familyMetadataList
  .filter((f) => !f.colorCapabilities?.length) // colour fonts do not render on canvas reliably
  .sort((a, b) => a.popularity - b.popularity)
  .map((f) => {
    const keys = Object.keys(f.fonts);
    const w = [...new Set(keys.filter((k) => /^\d+$/.test(k)).map(Number))].sort((a, b) => a - b);
    const i = [...new Set(keys.filter((k) => /^\d+i$/.test(k)).map((k) => Number(k.slice(0, -1))))].sort((a, b) => a - b);
    const scripts = (f.subsets ?? []).filter((s) => !["menu", "latin", "latin-ext"].includes(s));
    return [f.family, CAT[f.category] ?? "sans", w, i, scripts];
  })
  .filter((r) => r[2].length);
writeFileSync(new URL("../public/fonts/google-fonts.json", import.meta.url), JSON.stringify({ generated: new Date().toISOString().slice(0, 10), fonts: rows }));
console.log(`${rows.length} families`);
