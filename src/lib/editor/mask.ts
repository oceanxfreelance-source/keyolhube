// Clipping masks: a group with `mask: true` clips its content to its first child's outline.
import { localMatrix } from "../doc/geometry";
import type { DesignNode, GroupNode } from "../doc/types";
import { localPathData } from "../vector/paths";

/** Path2D of the mask shape in the group's coordinates, or null if the group is not a mask. */
export function maskPath(g: GroupNode): Path2D | null {
  if (!g.mask || !g.children.length) return null;
  const shape = g.children[0];
  const d = maskData(shape);
  if (!d) return null;
  const m = localMatrix(shape);
  const p = new Path2D();
  p.addPath(new Path2D(d), new DOMMatrix([m[0], m[1], m[2], m[3], m[4], m[5]]));
  return p;
}

export function maskData(shape: DesignNode): string | null {
  if (shape.type === "image" || shape.type === "text" || shape.type === "group") {
    // non-vector masks use their box (images/text/groups)
    return `M0,0H${shape.width}V${shape.height}H0Z`;
  }
  return localPathData(shape);
}

/** Konva clipFunc for a mask group (draws nothing when it is not a mask). */
export function maskClipFunc(g: GroupNode) {
  const p = maskPath(g);
  return p ? () => [p] as unknown as void : undefined;
}
