import { describe, expect, it } from "vitest";
import { applyColourway, applyPattern, applyPlayer, buildKit, currentColourway, hasGarment, parseRoster, rosterDoc } from "@/lib/apparel/garments";
import type { DesignNode, TextNode } from "@/lib/doc/types";
import { parseDoc } from "@/lib/doc/validate";

const all = (ns: DesignNode[]): DesignNode[] => ns.flatMap((n) => (n.type === "group" ? [n, ...all(n.children)] : [n]));
const texts = (doc: ReturnType<typeof buildKit>, tag: string) => doc.pages.flatMap((p) => all(p.children)).filter((n): n is TextNode => n.type === "text" && n.tag === tag);

describe("apparel", () => {
  it("builds valid kits: football has front, back and shorts", () => {
    for (const g of ["football", "basketball", "tshirt"] as const) {
      const d = buildKit(g);
      expect(parseDoc(d).ok).toBe(true);
      expect(hasGarment(d)).toBe(true);
      expect(d.pages.map((p) => p.name)).toEqual(g === "football" ? ["Front", "Back", "Shorts"] : ["Front", "Back"]);
    }
  });
  it("colourways and patterns restyle every page", () => {
    const d = buildKit("football");
    const c = { primary: "#ff0000", secondary: "#00ff00", accent: "#0000ff" };
    applyColourway(d, c);
    expect(currentColourway(d)).toEqual(c);
    expect(texts(d, "player-number").every((t) => t.fill.type === "solid" && t.fill.color === "#0000ff")).toBe(true);
    applyPattern(d, "hoops", c);
    const pats = d.pages.flatMap((p) => all(p.children)).filter((n) => n.tag === "jersey-pattern");
    expect(pats).toHaveLength(2); // front + back shirts
    expect(pats.every((p) => p.visible && p.type === "path" && p.data.includes("H1000"))).toBe(true);
    applyPattern(d, "gradient", c);
    expect(d.pages.flatMap((p) => all(p.children)).find((n) => n.tag === "jersey-base")).toMatchObject({ fill: { type: "linear" } });
    expect(parseDoc(d).ok).toBe(true);
  });
  it("roster: names and numbers per player, one export document", () => {
    const d = buildKit("football");
    d.roster = parseRoster("Ahmed Ali, 7, M\n10 Ibrahim\nHassan\t9\tXL");
    expect(d.roster).toEqual([{ name: "Ahmed Ali", number: "7", size: "M" }, { name: "Ibrahim", number: "10" }, { name: "Hassan", number: "9", size: "XL" }]);
    const r = rosterDoc(d);
    expect(r.pages).toHaveLength(9);
    expect(r.pages[1].name).toBe("Ahmed Ali #7 (M) - Back");
    const backName = all(r.pages[1].children).find((n) => n.tag === "player-name") as TextNode;
    expect(backName.text).toBe("AHMED ALI");
    expect((all(r.pages[4].children).find((n) => n.tag === "player-number") as TextNode).text).toBe("10");
    expect(new Set(r.pages.map((p) => p.id)).size).toBe(9);
    applyPlayer(d, { name: "Zara", number: "23" });
    expect(texts(d, "player-name")[0].text).toBe("ZARA");
    expect(parseDoc(r).ok).toBe(true);
  });
});
