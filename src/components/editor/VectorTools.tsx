"use client";
// Pen tool (draw Bézier paths) and point editing (move anchors/handles, add/remove points).
import type Konva from "konva";
import { useEffect, useMemo, useRef, useState } from "react";
import { Circle, Group, Line, Path, Rect } from "react-konva";
import { apply, invert, localMatrix, locate, mul, type Mat } from "@/lib/doc/geometry";
import type { Page, PathNode } from "@/lib/doc/types";
import { dataBounds, fromAnchors, insertAnchor, nodeFromItemData, toAnchors, translateData, type Anchor, type SubPath, type Vec } from "@/lib/vector/paths";
import { activePage, useEd, useEditorCtx, useUi } from "./context";

const ACCENT = "#5b4cf0";

// ---------- pen ----------
export type PenState = { anchors: Anchor[]; dragging: boolean; cursor: Vec | null };

export function usePen() {
  const { store, ui } = useEditorCtx();
  const [pen, setPen] = useState<PenState>({ anchors: [], dragging: false, cursor: null });
  const zoom = useUi((s) => s.zoom);

  const penRef = useRef(pen);
  penRef.current = pen;
  const finish = (closed: boolean) => {
    const p = penRef.current;
    if (p.anchors.length >= 2) {
      const data = fromAnchors([{ closed, anchors: p.anchors }]);
      const s = store.getState();
      const n = nodeFromItemData(data, closed ? { type: "solid", color: "#c7d2fe" } : { type: "none" }, { color: "#111827", width: Math.max(2, Math.round(s.doc.width / 400)) }, "Pen path");
      if (n) {
        s.changePage("Draw path", (pg) => { pg.children.push(n); });
        s.select([n.id]);
      }
    }
    setPen({ anchors: [], dragging: false, cursor: null });
    ui.getState().set({ tool: "select" });
  };

  useEffect(() => {
    if (ui.getState().tool !== "pen") return;
    const key = (e: KeyboardEvent) => {
      if (e.key === "Enter") { e.preventDefault(); finish(false); }
      if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); finish(false); }
      if (e.key === "Backspace" || e.key === "Delete") { e.preventDefault(); e.stopPropagation(); setPen((p) => ({ ...p, anchors: p.anchors.slice(0, -1) })); }
    };
    window.addEventListener("keydown", key, true);
    return () => window.removeEventListener("keydown", key, true);
  });

  const handlers = {
    down(pt: Vec) {
      const first = pen.anchors[0];
      if (first && pen.anchors.length >= 2 && Math.hypot(pt.x - first.p.x, pt.y - first.p.y) < 8 / zoom) { finish(true); return; }
      setPen((p) => ({ ...p, anchors: [...p.anchors, { p: pt, hin: { x: 0, y: 0 }, hout: { x: 0, y: 0 } }], dragging: true }));
    },
    move(pt: Vec) {
      setPen((p) => {
        if (!p.dragging) return { ...p, cursor: pt };
        const a = p.anchors[p.anchors.length - 1];
        const hout = { x: pt.x - a.p.x, y: pt.y - a.p.y };
        const last: Anchor = { p: a.p, hout, hin: { x: -hout.x, y: -hout.y } }; // smooth point
        return { ...p, cursor: pt, anchors: [...p.anchors.slice(0, -1), last] };
      });
    },
    up() { setPen((p) => ({ ...p, dragging: false })); },
    dbl() {
      // Konva reports any two quick clicks as a double-click, even far apart. Only finish when the
      // last two clicks were on the same spot (the duplicate anchor from that click is dropped).
      const as = penRef.current.anchors;
      if (as.length < 2) return;
      const a = as[as.length - 1].p, b = as[as.length - 2].p;
      if (Math.hypot(a.x - b.x, a.y - b.y) > 6 / zoom) return;
      penRef.current = { ...penRef.current, anchors: as.slice(0, -1) };
      finish(false);
    },
  };
  return { pen, handlers, finish };
}

export function PenPreview({ pen }: { pen: PenState }) {
  const zoom = useUi((s) => s.zoom);
  if (!pen.anchors.length) return null;
  const data = fromAnchors([{ closed: false, anchors: pen.anchors }]);
  const last = pen.anchors[pen.anchors.length - 1];
  return (
    <Group listening={false}>
      <Path data={data} stroke={ACCENT} strokeWidth={2 / zoom} />
      {pen.cursor && !pen.dragging && <Line points={[last.p.x, last.p.y, pen.cursor.x, pen.cursor.y]} stroke={ACCENT} strokeWidth={1 / zoom} dash={[4 / zoom, 4 / zoom]} />}
      {pen.anchors.map((a, i) => (
        <Group key={i}>
          {a.hout.x !== 0 || a.hout.y !== 0 ? <Line points={[a.p.x + a.hin.x, a.p.y + a.hin.y, a.p.x, a.p.y, a.p.x + a.hout.x, a.p.y + a.hout.y]} stroke={ACCENT} strokeWidth={1 / zoom} /> : null}
          <Rect x={a.p.x - 4 / zoom} y={a.p.y - 4 / zoom} width={8 / zoom} height={8 / zoom} fill={i === 0 ? ACCENT : "#fff"} stroke={ACCENT} strokeWidth={1.5 / zoom} />
        </Group>
      ))}
    </Group>
  );
}

// ---------- point editing ----------
/** Full transform from the path's source coordinates to page coordinates. */
function pathMatrix(parent: Mat, n: PathNode): Mat {
  return mul(mul(parent, localMatrix(n)), [n.width / n.sourceWidth, 0, 0, n.height / n.sourceHeight, 0, 0]);
}

export function PointEditor({ pathId }: { pathId: string }) {
  const { store, ui } = useEditorCtx();
  const page = useEd(activePage);
  const zoom = useUi((s) => s.zoom);
  const [sel, setSel] = useState<[number, number] | null>(null);
  const loc = locate(page, pathId);
  const node = loc?.node.type === "path" ? (loc.node as PathNode) : null;
  const subs = useMemo(() => (node ? toAnchors(node.data) : []), [node]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.stopPropagation(); ui.getState().set({ editingPathId: null }); }
      if ((e.key === "Delete" || e.key === "Backspace") && sel && node) {
        e.preventDefault(); e.stopPropagation();
        const next = subs.map((s, i) => (i === sel[0] ? { ...s, anchors: s.anchors.filter((_, j) => j !== sel[1]) } : s)).filter((s) => s.anchors.length >= 2);
        if (next.length) commit(next, "Delete point", false); else store.getState().changePage("Delete path", (p) => { const l = locate(p as Page, node.id); if (l) l.list.splice(l.index, 1); });
        setSel(null);
      }
    };
    window.addEventListener("keydown", key, true);
    return () => window.removeEventListener("keydown", key, true);
  });
  if (!node || !loc) return null;
  const M = pathMatrix(loc.parentMatrix, node), inv = invert(M);
  const toPage = (v: Vec): Vec => { const [x, y] = apply(M, v.x, v.y); return { x, y }; };
  const toSrc = (v: Vec): Vec => { const [x, y] = apply(inv, v.x, v.y); return { x, y }; };

  function commit(next: SubPath[], label: string, merge: boolean) {
    store.getState().changePage(label, (p) => {
      const n = locate(p as Page, pathId)?.node;
      if (n?.type === "path") n.data = fromAnchors(next);
    }, merge ? { merge: `points:${pathId}` } : undefined);
  }
  /** After an edit, re-fit the element box to the new outline (keeps x/y/size meaningful). */
  function normalise() {
    store.getState().changePage("Edit points", (p) => {
      const l = locate(p as Page, pathId);
      const n = l?.node;
      if (n?.type !== "path") return;
      const b = dataBounds(n.data);
      if (b.width <= 0 && b.height <= 0) return;
      const sx = n.width / n.sourceWidth, sy = n.height / n.sourceHeight;
      // new origin in parent coords = old transform applied to the bounds' top-left
      const [ox, oy] = apply(mul(localMatrix(n), [sx, 0, 0, sy, 0, 0]), b.x, b.y);
      n.data = translateData(n.data, -b.x, -b.y);
      n.x = ox; n.y = oy;
      n.sourceWidth = Math.max(0.01, b.width); n.sourceHeight = Math.max(0.01, b.height);
      n.width = Math.max(0.01, b.width * sx); n.height = Math.max(0.01, b.height * sy);
    }, { merge: `points:${pathId}` });
  }

  const drag = (si: number, ai: number, part: "p" | "hin" | "hout") => (e: Konva.KonvaEventObject<DragEvent>) => {
    const src = toSrc({ x: e.target.x(), y: e.target.y() });
    const next = subs.map((s) => ({ closed: s.closed, anchors: s.anchors.map((a) => ({ p: { ...a.p }, hin: { ...a.hin }, hout: { ...a.hout } })) }));
    const a = next[si].anchors[ai];
    if (part === "p") { a.p = src; }
    else {
      const h = { x: src.x - a.p.x, y: src.y - a.p.y };
      a[part] = h;
      if (!e.evt.altKey) { // keep smooth: mirror the other handle's direction, keep its length
        const other = part === "hin" ? "hout" : "hin";
        const len = Math.hypot(a[other].x, a[other].y) || Math.hypot(h.x, h.y);
        const d = Math.hypot(h.x, h.y) || 1;
        a[other] = { x: (-h.x / d) * len, y: (-h.y / d) * len };
      }
    }
    commit(next, "Edit points", true);
  };

  const outline = node.data;
  const s = 1 / zoom;
  return (
    <Group>
      {/* click the outline to add a point */}
      <Path data={outline} {...matrixProps(M)} stroke={ACCENT} strokeWidth={0.01} opacity={0} fillEnabled={false} hitStrokeWidth={12 / zoom / Math.max(1e-6, Math.hypot(M[0], M[1]))} name="path-hit"
        onClick={(e) => {
          const rp = e.target.getStage()!.findOne(".page-content")!.getRelativePointerPosition()!;
          const r = insertAnchor(subs, toSrc(rp), 12 / zoom / Math.max(1e-6, Math.hypot(M[0], M[1])));
          if (r) { commit(r.subs, "Add point", false); setSel(r.at); }
        }} />
      <Path data={outline} {...matrixProps(M)} stroke={ACCENT} strokeWidth={1.5 * s} strokeScaleEnabled={false} listening={false} />
      {subs.map((sp, si) => sp.anchors.map((a, ai) => {
        const P = toPage(a.p), Hin = toPage({ x: a.p.x + a.hin.x, y: a.p.y + a.hin.y }), Hout = toPage({ x: a.p.x + a.hout.x, y: a.p.y + a.hout.y });
        const isSel = sel?.[0] === si && sel?.[1] === ai;
        const hasIn = a.hin.x || a.hin.y, hasOut = a.hout.x || a.hout.y;
        return (
          <Group key={`${si}-${ai}`}>
            {hasIn ? <Line points={[Hin.x, Hin.y, P.x, P.y]} stroke={ACCENT} strokeWidth={s} listening={false} /> : null}
            {hasOut ? <Line points={[P.x, P.y, Hout.x, Hout.y]} stroke={ACCENT} strokeWidth={s} listening={false} /> : null}
            {hasIn ? <Circle x={Hin.x} y={Hin.y} radius={4 * s} fill="#fff" stroke={ACCENT} strokeWidth={1.5 * s} draggable onDragMove={drag(si, ai, "hin")} onDragEnd={normalise} name="handle" /> : null}
            {hasOut ? <Circle x={Hout.x} y={Hout.y} radius={4 * s} fill="#fff" stroke={ACCENT} strokeWidth={1.5 * s} draggable onDragMove={drag(si, ai, "hout")} onDragEnd={normalise} name="handle" /> : null}
            <Rect x={P.x} y={P.y} offsetX={5 * s} offsetY={5 * s} width={10 * s} height={10 * s} fill={isSel ? ACCENT : "#fff"} stroke={ACCENT} strokeWidth={1.5 * s} draggable name="anchor"
              onMouseDown={() => setSel([si, ai])} onTap={() => setSel([si, ai])}
              onDragMove={drag(si, ai, "p")} onDragEnd={normalise}
              onDblClick={() => {
                // toggle corner <-> smooth
                const next = subs.map((x) => ({ closed: x.closed, anchors: x.anchors.map((y) => ({ ...y })) }));
                const an = next[si].anchors[ai];
                if (an.hin.x || an.hin.y || an.hout.x || an.hout.y) { an.hin = { x: 0, y: 0 }; an.hout = { x: 0, y: 0 }; }
                else {
                  const prev = next[si].anchors[(ai - 1 + next[si].anchors.length) % next[si].anchors.length].p, nxt = next[si].anchors[(ai + 1) % next[si].anchors.length].p;
                  const dx = (nxt.x - prev.x) / 6, dy = (nxt.y - prev.y) / 6;
                  an.hin = { x: -dx, y: -dy }; an.hout = { x: dx, y: dy };
                }
                commit(next, "Toggle smooth point", false);
              }} />
          </Group>
        );
      }))}
    </Group>
  );
}

function matrixProps(m: Mat) {
  // decompose a (rotation+scale) matrix into Konva attrs
  const sx = Math.hypot(m[0], m[1]), rot = Math.atan2(m[1], m[0]);
  const sy = (m[0] * m[3] - m[1] * m[2]) / (sx || 1);
  return { x: m[4], y: m[5], rotation: (rot * 180) / Math.PI, scaleX: sx, scaleY: sy };
}
