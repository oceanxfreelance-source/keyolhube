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
