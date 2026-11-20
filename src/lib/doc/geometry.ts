import type { DesignNode, Page } from "./types";

/** 2D affine matrix [a, b, c, d, e, f] mapping (x, y) -> (a x + c y + e, b x + d y + f). */
export type Mat = [number, number, number, number, number, number];
export const IDENTITY: Mat = [1, 0, 0, 1, 0, 0];

export function mul(m: Mat, n: Mat): Mat {
  return [
    m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1],
    m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3],
    m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5],
  ];
}
export function apply(m: Mat, x: number, y: number): [number, number] {
  return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
}
export function invert(m: Mat): Mat {
  const det = m[0] * m[3] - m[1] * m[2];
  return [m[3] / det, -m[1] / det, -m[2] / det, m[0] / det, (m[2] * m[5] - m[3] * m[4]) / det, (m[1] * m[4] - m[0] * m[5]) / det];
}
/** Node's own transform: translate to (x, y) then rotate around that point (Konva convention). */
export function localMatrix(n: Pick<DesignNode, "x" | "y" | "rotation">): Mat {
  const r = (n.rotation * Math.PI) / 180, c = Math.cos(r), s = Math.sin(r);
  return [c, s, -s, c, n.x, n.y];
}

export type Box = { x: number; y: number; width: number; height: number };

/** Content box of a node in its own coordinates (lines and groups are computed from contents). */
export function ownBox(n: DesignNode): Box {
  if (n.type === "line") {
    const xs = n.points.filter((_, i) => i % 2 === 0), ys = n.points.filter((_, i) => i % 2 === 1);
    const pad = n.stroke.width / 2;
    return { x: Math.min(...xs) - pad, y: Math.min(...ys) - pad, width: Math.max(...xs) - Math.min(...xs) + 2 * pad, height: Math.max(...ys) - Math.min(...ys) + 2 * pad };
  }
  if (n.type === "group") {
    const boxes = n.children.map((c) => boundsIn(c, IDENTITY));
    return boxes.length ? union(boxes) : { x: 0, y: 0, width: 0, height: 0 };
  }
  return { x: 0, y: 0, width: n.width, height: n.height };
}

/** Axis-aligned bounds of a node after applying `parent` (the transform of its parent). */
export function boundsIn(n: DesignNode, parent: Mat): Box {
  const m = mul(parent, localMatrix(n));
  const b = ownBox(n);
  const pts = [apply(m, b.x, b.y), apply(m, b.x + b.width, b.y), apply(m, b.x, b.y + b.height), apply(m, b.x + b.width, b.y + b.height)];
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
  return { x: Math.min(...xs), y: Math.min(...ys), width: Math.max(...xs) - Math.min(...xs), height: Math.max(...ys) - Math.min(...ys) };
}

export function union(boxes: Box[]): Box {
  const x1 = Math.min(...boxes.map((b) => b.x)), y1 = Math.min(...boxes.map((b) => b.y));
  const x2 = Math.max(...boxes.map((b) => b.x + b.width)), y2 = Math.max(...boxes.map((b) => b.y + b.height));
  return { x: x1, y: y1, width: x2 - x1, height: y2 - y1 };
}

export type Located = { node: DesignNode; list: DesignNode[]; index: number; parentMatrix: Mat; parentId: string | null };

/** Find a node anywhere in the page tree, with the list it lives in and its parent's transform. */
export function locate(page: Page, id: string): Located | null {
  const walk = (list: DesignNode[], m: Mat, parentId: string | null): Located | null => {
    for (let i = 0; i < list.length; i++) {
      const n = list[i];
      if (n.id === id) return { node: n, list, index: i, parentMatrix: m, parentId };
      if (n.type === "group") {
        const hit = walk(n.children, mul(m, localMatrix(n)), n.id);
        if (hit) return hit;
      }
    }
    return null;
  };
  return walk(page.children, IDENTITY, null);
}

export function pageBounds(page: Page, id: string): Box | null {
  const l = locate(page, id);
  return l ? boundsIn(l.node, l.parentMatrix) : null;
}

/** Every node in paint order (depth first), with its page-space bounds. */
export function flatten(page: Page): { node: DesignNode; box: Box; depth: number }[] {
  const out: { node: DesignNode; box: Box; depth: number }[] = [];
  const walk = (list: DesignNode[], m: Mat, depth: number) => {
    for (const n of list) {
      out.push({ node: n, box: boundsIn(n, m), depth });
      if (n.type === "group") walk(n.children, mul(m, localMatrix(n)), depth + 1);
    }
  };
  walk(page.children, IDENTITY, 0);
  return out;
}
