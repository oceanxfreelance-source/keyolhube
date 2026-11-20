import { describe, expect, it } from "vitest";
import { make } from "@/lib/doc/factory";
import { IDENTITY } from "@/lib/doc/geometry";
import { booleanOp, convertToPath, dataBounds, fromAnchors, insertAnchor, toAnchors } from "@/lib/vector/paths";

const area = (data: string) => {
  // shoelace over a polygon approximation via bounds sampling is overkill; use paper directly
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const paper = require("paper/dist/paper-core");
  const s = new paper.PaperScope(); s.setup(new s.Size(1, 1));
  return Math.abs(new s.CompoundPath(data).area);
};

describe("vector", () => {
  it("converts shapes to paths keeping position and size (incl. rotation)", () => {
    const r = make.rect(100, 50, 200, 100);
    const p = convertToPath(r, IDENTITY)!;
    expect([p.x, p.y, p.width, p.height]).toEqual([100, 50, 200, 100]);
    expect(area(p.data)).toBeCloseTo(20000, 0);
    const rot = { ...make.rect(0, 0, 100, 50), rotation: 90 };
    const q = convertToPath(rot, IDENTITY)!;
    expect(q.x).toBeCloseTo(-50, 5); expect(q.width).toBeCloseTo(50, 5); expect(q.height).toBeCloseTo(100, 5);
    expect(q.rotation).toBe(0);
  });
  it("circle path has the right area", () => {
    const p = convertToPath(make.ellipse(0, 0, 100, 100), IDENTITY)!;
    expect(area(p.data)).toBeCloseTo(Math.PI * 2500, -1);
  });
  it("boolean operations", () => {
    const a = { node: make.rect(0, 0, 100, 100), parent: IDENTITY };
    const b = { node: make.rect(50, 0, 100, 100), parent: IDENTITY };
    const u = booleanOp([a, b], "unite")!, s = booleanOp([a, b], "subtract")!, i = booleanOp([a, b], "intersect")!, x = booleanOp([a, b], "exclude")!;
    expect(area(u.data)).toBeCloseTo(15000, 0); expect(u.width).toBe(150);
    expect(area(s.data)).toBeCloseTo(5000, 0); expect(s.width).toBe(50);
    expect(area(i.data)).toBeCloseTo(5000, 0); expect(i.x).toBe(50);
    expect(area(x.data)).toBeCloseTo(10000, 0);
    expect(u.fill).toEqual(a.node.fill); // bottom shape's style
  });
  it("anchors round-trip and insert a point on a segment", () => {
    const d = "M0,0L100,0L100,100Z";
    const subs = toAnchors(d);
    expect(subs[0].anchors).toHaveLength(3);
    expect(subs[0].closed).toBe(true);
    const back = fromAnchors(subs);
    expect(dataBounds(back)).toEqual({ x: 0, y: 0, width: 100, height: 100 });
    const ins = insertAnchor(subs, { x: 50, y: 1 }, 5)!;
    expect(ins.subs[0].anchors).toHaveLength(4);
    expect(ins.subs[0].anchors[ins.at[1]].p).toEqual({ x: 50, y: 0 });
    expect(insertAnchor(subs, { x: 50, y: 40 }, 5)).toBeNull();
    // curve handles survive
    const curved = toAnchors("M0,0C30,-30 70,-30 100,0");
    expect(curved[0].anchors[0].hout).toEqual({ x: 30, y: -30 });
    expect(curved[0].anchors[1].hin).toEqual({ x: -30, y: -30 });
  });
});
