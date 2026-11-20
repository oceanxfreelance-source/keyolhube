import { describe, expect, it } from "vitest";
import { detectDirection, make, newDoc } from "@/lib/doc/factory";
import { boundsIn, IDENTITY, locate, pageBounds } from "@/lib/doc/geometry";
import { alignNodes, bakeScale, distributeNodes, duplicateNodes, groupNodes, reorder, removeNodes, ungroup } from "@/lib/doc/ops";
import { snapBox } from "@/lib/doc/snap";
import { createEditorStore } from "@/lib/editor/store";

const close = (a: number, b: number) => expect(Math.abs(a - b)).toBeLessThan(1e-6);

describe("geometry", () => {
  it("rotated bounds", () => {
    const r = make.rect(100, 100, 100, 50);
    r.rotation = 90; // rotates around (100,100): occupies x 50..100, y 100..200
    const b = boundsIn(r, IDENTITY);
    close(b.x, 50); close(b.y, 100); close(b.width, 50); close(b.height, 100);
  });
});

describe("group / ungroup", () => {
  it("keeps on-page positions through group, move, rotate and ungroup", () => {
    const doc = newDoc(1000, 1000);
    const p = doc.pages[0];
    const a = make.rect(100, 100, 50, 50), b = make.ellipse(300, 200, 100, 40);
    p.children.push(a, b);
    const before = [pageBounds(p, a.id)!, pageBounds(p, b.id)!];
    const gid = groupNodes(p, [a.id, b.id])!;
    expect(p.children).toHaveLength(1);
    const g = locate(p, gid)!.node;
    expect([g.x, g.y, g.width, g.height]).toEqual([100, 100, 300, 140]);
    // bounds of children unchanged after grouping
    close(pageBounds(p, a.id)!.x, before[0].x); close(pageBounds(p, b.id)!.y, before[1].y);
    // rotate the group 90 deg, then ungroup: children must stay where the rotation put them
    g.rotation = 90;
    const rotated = pageBounds(p, b.id)!;
    const ids = ungroup(p, gid);
    expect(ids).toHaveLength(2);
    const after = pageBounds(p, b.id)!;
    close(after.x, rotated.x); close(after.y, rotated.y); close(after.width, rotated.width);
    expect(locate(p, b.id)!.node.rotation).toBe(90);
  });

  it("refuses to group nodes from different parents", () => {
    const doc = newDoc(500, 500);
    const p = doc.pages[0];
    const a = make.rect(0, 0, 10, 10), b = make.rect(20, 0, 10, 10), c = make.rect(40, 0, 10, 10);
    p.children.push(a, b, c);
    groupNodes(p, [a.id, b.id]);
    expect(groupNodes(p, [a.id, c.id])).toBeNull();
  });
});

describe("order, duplicate, delete", () => {
  it("reorders within a list", () => {
    const p = newDoc(100, 100).pages[0];
    const [a, b, c] = [make.rect(0, 0, 1, 1), make.rect(0, 0, 1, 1), make.rect(0, 0, 1, 1)];
    p.children.push(a, b, c);
    reorder(p, [a.id], "front");
    expect(p.children.map((n) => n.id)).toEqual([b.id, c.id, a.id]);
    reorder(p, [a.id], "backward");
    expect(p.children.map((n) => n.id)).toEqual([b.id, a.id, c.id]);
    reorder(p, [c.id], "back");
    expect(p.children.map((n) => n.id)).toEqual([c.id, b.id, a.id]);
  });
  it("duplicates with new ids (deep) and deletes", () => {
    const p = newDoc(100, 100).pages[0];
    const a = make.rect(0, 0, 5, 5), b = make.rect(10, 0, 5, 5);
    p.children.push(a, b);
    const gid = groupNodes(p, [a.id, b.id])!;
    const [copy] = duplicateNodes(p, [gid]);
    const c = locate(p, copy)!.node;
    expect(c.type).toBe("group");
    if (c.type === "group") expect(c.children.map((x) => x.id)).not.toContain(a.id);
    expect(c.x).toBe(20);
    removeNodes(p, [gid]);
    expect(p.children.map((n) => n.id)).toEqual([copy]);
  });
});

describe("align and distribute", () => {
  it("aligns a single node to the page and several to their selection", () => {
    const p = newDoc(1000, 800).pages[0];
    const a = make.rect(10, 10, 100, 100), b = make.rect(400, 300, 50, 50), c = make.rect(700, 50, 20, 20);
    p.children.push(a, b, c);
    alignNodes(p, [a.id], "hcenter", { width: 1000, height: 800 });
    expect(a.x).toBe(450);
    alignNodes(p, [a.id, b.id], "bottom", { width: 1000, height: 800 });
    expect(a.y + a.height).toBe(350); expect(b.y + b.height).toBe(350);
    distributeNodes(p, [a.id, b.id, c.id], "x");
    const sorted = [a, b, c].sort((m, n) => m.x - n.x);
    const gap1 = sorted[1].x - (sorted[0].x + sorted[0].width), gap2 = sorted[2].x - (sorted[1].x + sorted[1].width);
    close(gap1, gap2);
    expect(sorted[0].id).toBe(b.id); // outermost nodes do not move
    expect(b.x).toBe(400); expect(c.x).toBe(700);
  });
  it("moves a node inside a rotated group in page space", () => {
    const p = newDoc(1000, 1000).pages[0];
    const a = make.rect(100, 100, 50, 50), b = make.rect(200, 100, 50, 50);
    p.children.push(a, b);
    const gid = groupNodes(p, [a.id, b.id])!;
    locate(p, gid)!.node.rotation = 90;
    alignNodes(p, [a.id], "left", { width: 1000, height: 1000 });
    close(pageBounds(p, a.id)!.x, 0);
  });
});

describe("scale baking", () => {
  it("text corner-resize scales font, width-only keeps font", () => {
    const t = make.text(0, 0, "Hello", 40, 300);
    bakeScale(t, 2, 2);
    expect(t.fontSize).toBe(80); expect(t.width).toBe(600);
    bakeScale(t, 0.5, 1, true);
    expect(t.fontSize).toBe(80); expect(t.width).toBe(300);
  });
  it("groups scale children", () => {
    const p = newDoc(100, 100).pages[0];
    const a = make.rect(0, 0, 10, 10), b = make.rect(20, 0, 10, 10);
    p.children.push(a, b);
    const g = locate(p, groupNodes(p, [a.id, b.id])!)!.node;
    bakeScale(g, 2, 3);
    if (g.type !== "group") throw new Error();
    expect(g.children[1].x).toBe(40); expect(g.children[1].width).toBe(20); expect(g.children[1].height).toBe(30);
  });
});

describe("snapping", () => {
  it("snaps edges and centres within threshold", () => {
    const page = { x: 0, y: 0, width: 1000, height: 1000 };
    const r = snapBox({ x: 447, y: 10, width: 100, height: 100 }, [page], 6);
    expect(r.dx).toBe(3); // centre 497 -> 500
    expect(r.guides.some((g) => g.axis === "x" && g.pos === 500)).toBe(true);
    const none = snapBox({ x: 420, y: 420, width: 50, height: 50 }, [page], 6);
    expect(none.dx).toBe(0); expect(none.dy).toBe(0);
  });
});

describe("text direction", () => {
  it("detects Dhivehi (Thaana) and English by the first strong character", () => {
    expect(detectDirection("ދިވެހި ރާއްޖެ")).toBe("rtl");
    expect(detectDirection("Maldives ދިވެހި")).toBe("ltr");
    expect(detectDirection("2026 ދިވެހި")).toBe("rtl");
    expect(detectDirection("123")).toBe("ltr");
  });
});

describe("history", () => {
  it("undo/redo, merge of rapid changes, redo cleared by new change", () => {
    const doc = newDoc(500, 500);
    const s = createEditorStore(doc);
    const r = make.rect(0, 0, 10, 10);
    s.getState().changePage("Add", (p) => { p.children.push(r); });
    s.getState().changePage("Opacity", (p) => { p.children[0].opacity = 0.8; }, { merge: "op" });
    s.getState().changePage("Opacity", (p) => { p.children[0].opacity = 0.5; }, { merge: "op" });
    expect(s.getState().past).toHaveLength(2);
    s.getState().undo();
    expect(s.getState().page().children[0].opacity).toBe(1);
    s.getState().redo();
    expect(s.getState().page().children[0].opacity).toBe(0.5);
    s.getState().select([r.id]);
    s.getState().undo(); s.getState().undo();
    expect(s.getState().page().children).toHaveLength(0);
    expect(s.getState().selection).toEqual([]); // selection pruned
    s.getState().redo();
    s.getState().changePage("Move", (p) => { p.children[0].x = 99; });
    expect(s.getState().future).toHaveLength(0);
    expect(s.getState().revision).toBe(9);
    // original object untouched (immutability)
    expect(doc.pages[0].children).toHaveLength(0);
  });
});

describe("pages", () => {
  it("deleting the active page moves to a neighbour (and undo restores it)", async () => {
    const { newPage } = await import("@/lib/doc/factory");
    const doc = newDoc(100, 100);
    doc.pages.push(newPage("Page 2"), newPage("Page 3"));
    const s = createEditorStore(doc);
    const [p1, p2, p3] = doc.pages.map((p) => p.id);
    s.getState().setPage(p3);
    s.getState().change("Delete page", (d) => { d.pages.splice(2, 1); });
    expect(s.getState().pageId).toBe(p2);
    s.getState().setPage(p1);
    s.getState().change("Delete page", (d) => { d.pages.splice(0, 1); });
    expect(s.getState().pageId).toBe(p2);
    s.getState().undo();
    expect(s.getState().doc.pages.map((p) => p.id)).toEqual([p1, p2]);
  });
});
