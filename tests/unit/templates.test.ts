import { describe, expect, it } from "vitest";
import { parseDoc } from "@/lib/doc/validate";
import { BUILTIN_TEMPLATES } from "@/lib/templates/builtin";

describe("templates", () => {
  it("every built-in template builds a valid document", () => {
    expect(BUILTIN_TEMPLATES.length).toBeGreaterThanOrEqual(20);
    for (const t of BUILTIN_TEMPLATES) {
      const r = parseDoc(t.build());
      expect(r.ok, `${t.id}: ${r.ok ? "" : r.error}`).toBe(true);
    }
    expect(new Set(BUILTIN_TEMPLATES.map((t) => t.id)).size).toBe(BUILTIN_TEMPLATES.length);
  });
});

describe("generated templates", () => {
  it("hundreds of templates, with text inside the page and real photos", async () => {
    const { GENERATED_TEMPLATES } = await import("@/lib/templates/generated");
    const { STOCK } = await import("@/lib/templates/stock");
    const { templateTextCollides } = await import("@/lib/templates/generated");
    expect(GENERATED_TEMPLATES.length).toBeGreaterThanOrEqual(400);
    for (const t of GENERATED_TEMPLATES) {
      const d = t.build();
      for (const n of d.pages[0].children) {
        if (n.type === "text") {
          expect(n.x, `${t.id} ${n.name}`).toBeGreaterThanOrEqual(0);
          expect(n.x + n.width, `${t.id} ${n.name}`).toBeLessThanOrEqual(d.width + 1);
          expect(n.y, `${t.id} ${n.name}`).toBeGreaterThanOrEqual(0);
          expect(n.y + n.fontSize, `${t.id} ${n.name}`).toBeLessThanOrEqual(d.height);
          expect(n.fontSize, `${t.id} ${n.name}`).toBeGreaterThan(8);
        }
        if (n.type === "image") expect(STOCK[n.assetId.replace(/^stock-/, "")], `${t.id} photo`).toBeTruthy();
      }
      expect(templateTextCollides(d.pages[0].children), `${t.id} text overlaps`).toBe(false);
    }
  });
});
