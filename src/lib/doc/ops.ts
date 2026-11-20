// Pure document operations. They mutate a draft (used inside immer) and never touch the UI.
import { newId } from "./factory";
import { apply, boundsIn, invert, localMatrix, locate, mul, union, type Box } from "./geometry";
import type { DesignNode, GroupNode, Page } from "./types";

export function cloneWithNewIds<T extends DesignNode>(n: T): T {
  // JSON round-trip (not structuredClone): works on immer drafts, and nodes are plain JSON.
  const c = JSON.parse(JSON.stringify(n)) as T;
  const renew = (x: DesignNode) => {
    x.id = newId();
    if (x.type === "group") x.children.forEach(renew);
  };
  renew(c);
  return c;
}

export function removeNodes(page: Page, ids: string[]): void {
  for (const id of ids) {
    const l = locate(page, id);
    if (l) l.list.splice(l.index, 1);
  }
}

/** Insert nodes at the top of the page, or right above `afterId` in its list. */
export function insertNodes(page: Page, nodes: DesignNode[], afterId?: string): void {
  const l = afterId ? locate(page, afterId) : null;
  if (l) l.list.splice(l.index + 1, 0, ...nodes);
  else page.children.push(...nodes);
}

export type ZMove = "forward" | "backward" | "front" | "back";
export function reorder(page: Page, ids: string[], move: ZMove): void {
  // Group the ids by the list they live in, then move within each list keeping relative order.
  const byList = new Map<DesignNode[], number[]>();
  for (const id of ids) {
    const l = locate(page, id);
    if (!l) continue;
    byList.set(l.list, [...(byList.get(l.list) ?? []), l.index]);
  }
  for (const [list, idxs] of byList) {
    idxs.sort((a, b) => a - b);
    const picked = idxs.map((i) => list[i]);
    if (move === "front" || move === "back") {
      for (let k = idxs.length - 1; k >= 0; k--) list.splice(idxs[k], 1);
      if (move === "front") list.push(...picked);
      else list.unshift(...picked);
    } else if (move === "forward") {
      for (let k = idxs.length - 1; k >= 0; k--) {
        const i = idxs[k];
        if (i < list.length - 1 && !picked.includes(list[i + 1])) [list[i], list[i + 1]] = [list[i + 1], list[i]];
      }
    } else {
      for (const i of idxs) {
        if (i > 0 && !picked.includes(list[i - 1])) [list[i], list[i - 1]] = [list[i - 1], list[i]];
      }
    }
  }
}

/** Group sibling nodes. Returns the new group id, or null if they are not siblings. */
export function groupNodes(page: Page, ids: string[]): string | null {
  const locs = ids.map((id) => locate(page, id)).filter((l): l is NonNullable<typeof l> => !!l);
  if (locs.length < 2 || locs.some((l) => l.list !== locs[0].list)) return null;
  const list = locs[0].list;
  locs.sort((a, b) => a.index - b.index);
  // Bounds in the parent's coordinate space (identity relative to that list).
  const box = union(locs.map((l) => boundsIn(l.node, [1, 0, 0, 1, 0, 0])));
  const children = locs.map((l) => ({ ...l.node, x: l.node.x - box.x, y: l.node.y - box.y }) as DesignNode);
  const group: GroupNode = {
    id: newId(), name: "Group", type: "group", x: box.x, y: box.y, width: box.width, height: box.height,
    rotation: 0, opacity: 1, visible: true, locked: false, blendMode: "source-over", shadow: null, children,
  };
  const topIndex = locs[locs.length - 1].index;
  list.splice(topIndex + 1, 0, group);
  for (let k = locs.length - 1; k >= 0; k--) list.splice(locs[k].index, 1);
  return group.id;
}

/** Replace a group with its children, keeping their on-page position, rotation and opacity. */
export function ungroup(page: Page, groupId: string): string[] {
  const l = locate(page, groupId);
  if (!l || l.node.type !== "group") return [];
  const g = l.node;
  const gm = localMatrix(g);
  const kids = g.children.map((c) => {
    const [x, y] = apply(gm, c.x, c.y);
    return { ...c, x, y, rotation: normAngle(c.rotation + g.rotation), opacity: c.opacity * g.opacity } as DesignNode;
  });
  l.list.splice(l.index, 1, ...kids);
  return kids.map((k) => k.id);
}

export function duplicateNodes(page: Page, ids: string[], offset = 20): string[] {
  const out: string[] = [];
  for (const id of ids) {
    const l = locate(page, id);
    if (!l) continue;
    const c = cloneWithNewIds(l.node);
    c.x += offset;
    c.y += offset;
    l.list.splice(l.index + 1, 0, c);
    out.push(c.id);
  }
  return out;
}

/** Move a node by (dx, dy) in page space, whatever groups it is inside. */
export function translateInPage(page: Page, id: string, dx: number, dy: number): void {
  const l = locate(page, id);
  if (!l) return;
  const inv = invert(l.parentMatrix);
  const [ox, oy] = apply(inv, 0, 0), [px, py] = apply(inv, dx, dy);
  l.node.x += px - ox;
  l.node.y += py - oy;
}

export type Align = "left" | "hcenter" | "right" | "top" | "vcenter" | "bottom";
export function alignNodes(page: Page, ids: string[], how: Align, pageSize: { width: number; height: number }): void {
  const boxes = ids.map((id) => {
    const l = locate(page, id)!;
    return { id, box: boundsIn(l.node, l.parentMatrix) };
  });
  if (!boxes.length) return;
  const ref: Box = boxes.length === 1 ? { x: 0, y: 0, ...pageSize } : union(boxes.map((b) => b.box));
  for (const { id, box } of boxes) {
    let dx = 0, dy = 0;
    if (how === "left") dx = ref.x - box.x;
    if (how === "hcenter") dx = ref.x + ref.width / 2 - (box.x + box.width / 2);
    if (how === "right") dx = ref.x + ref.width - (box.x + box.width);
    if (how === "top") dy = ref.y - box.y;
    if (how === "vcenter") dy = ref.y + ref.height / 2 - (box.y + box.height / 2);
    if (how === "bottom") dy = ref.y + ref.height - (box.y + box.height);
    translateInPage(page, id, dx, dy);
  }
}

/** Equal gaps between 3+ nodes along an axis (outermost nodes stay put). */
export function distributeNodes(page: Page, ids: string[], axis: "x" | "y"): void {
  const items = ids.map((id) => {
    const l = locate(page, id)!;
    return { id, box: boundsIn(l.node, l.parentMatrix) };
  });
  if (items.length < 3) return;
  const pos = (b: Box) => (axis === "x" ? b.x : b.y), size = (b: Box) => (axis === "x" ? b.width : b.height);
  items.sort((a, b) => pos(a.box) - pos(b.box));
  const first = items[0].box, last = items[items.length - 1].box;
  const span = pos(last) + size(last) - pos(first);
  const gap = (span - items.reduce((s, i) => s + size(i.box), 0)) / (items.length - 1);
  let cursor = pos(first) + size(first) + gap;
  for (const it of items.slice(1, -1)) {
    const d = cursor - pos(it.box);
    translateInPage(page, it.id, axis === "x" ? d : 0, axis === "y" ? d : 0);
    cursor += size(it.box) + gap;
  }
}

/**
 * Bake a resize (scale factors from the transform handles) into real sizes, so documents never
 * carry hidden scale. Text keeps its font size when only the width changed.
 */
export function bakeScale(n: DesignNode, sx: number, sy: number, widthOnly = false): void {
  // Proportional resize scales the styling too (borders, corners, spacing, shadows).
  if (!widthOnly && Math.abs(sx - sy) < 1e-6 && Math.abs(sx - 1) > 1e-6) scaleStyle(n, Math.abs(sx));
  if (n.type === "text") {
    n.width = Math.max(10, n.width * sx);
    if (!widthOnly) {
      n.fontSize = Math.max(1, Math.round(n.fontSize * sy * 100) / 100);
      n.height = n.height * sy;
    }
    return;
  }
  if (n.type === "line") {
    n.points = n.points.map((v, i) => (i % 2 === 0 ? v * sx : v * sy));
    n.width = Math.abs(n.width * sx);
    return;
  }
  n.width = Math.max(1, Math.abs(n.width * sx));
  n.height = Math.max(1, Math.abs(n.height * sy));
  if (n.type === "group") {
    for (const c of n.children) {
      c.x *= sx;
      c.y *= sy;
      bakeScale(c, sx, sy);
    }
  }
}

function normAngle(a: number): number {
  const r = ((a % 360) + 360) % 360;
  return Math.round(r * 1000) / 1000;
}

export { mul };

/** Clip the selected siblings to the bottom-most one (it becomes the mask shape). */
export function makeMask(page: Page, ids: string[]): string | null {
  const gid = groupNodes(page, ids);
  if (!gid) return null;
  const l = locate(page, gid);
  if (l && l.node.type === "group") { l.node.mask = true; l.node.name = "Mask group"; }
  return gid;
}

export function releaseMask(page: Page, groupId: string): string[] {
  const l = locate(page, groupId);
  if (!l || l.node.type !== "group") return [];
  l.node.mask = false;
  return ungroup(page, groupId);
}

function scaleStyle(n: DesignNode, k: number) {
  const r = (v: number) => Math.round(v * k * 100) / 100;
  if ("stroke" in n && n.stroke) { n.stroke.width = r(n.stroke.width); if (n.stroke.dash) n.stroke.dash = n.stroke.dash.map(r); }
  if ("cornerRadius" in n) n.cornerRadius = r(n.cornerRadius);
  if (n.type === "text") n.letterSpacing = r(n.letterSpacing);
  if (n.shadow) n.shadow = { ...n.shadow, blur: r(n.shadow.blur), offsetX: r(n.shadow.offsetX), offsetY: r(n.shadow.offsetY) };
}
