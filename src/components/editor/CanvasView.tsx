"use client";
import Konva from "konva";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Arrow, Ellipse, Group, Image as KImage, Layer, Line, Path, Rect, Stage, Text, Transformer } from "react-konva";
import { resolvedDirection } from "@/lib/doc/factory";
import { flatten, locate, type Box } from "@/lib/doc/geometry";
import { bakeScale } from "@/lib/doc/ops";
import { snapBox, type Guide } from "@/lib/doc/snap";
import type { DesignNode, ShapeNode, TextNode } from "@/lib/doc/types";
import { fontStack, nearestWeight } from "@/lib/fonts";
import { fillProps, loadImage, primitive } from "@/lib/editor/render";
import { activePage, fitText, useEd, useEditorCtx, useUi } from "./context";
import { Rulers } from "./Rulers";
import { useImageDrop } from "./useUploads";

Konva.pixelRatio = typeof window !== "undefined" ? Math.min(2, window.devicePixelRatio || 1) : 1;
const PRIM = { Rect, Ellipse, Line, Arrow, Path, Text, Image: KImage } as const;
const ZMIN = 0.02, ZMAX = 16;
const RULER = 20;

export function CanvasView() {
  const { store, ui } = useEditorCtx();
  const doc = useEd((s) => s.doc);
  const page = useEd(activePage);
  const selection = useEd((s) => s.selection);
  const { zoom, panX, panY, tool, showGrid, gridSize, editingTextId, fitRequest, showRulers, pro } = useUi((s) => s);
  const wrapRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<Konva.Stage>(null);
  const contentRef = useRef<Konva.Group>(null);
  const trRef = useRef<Konva.Transformer>(null);
  const [size, setSize] = useState({ w: 800, h: 600 });
  const [guides, setGuides] = useState<Guide[]>([]);
  const [marquee, setMarquee] = useState<Box | null>(null);
  const [hover, setHover] = useState<Box | null>(null);
  const [spaceDown, setSpaceDown] = useState(false);
  const pan = useRef<{ x: number; y: number; px: number; py: number } | null>(null);
  const marqueeStart = useRef<{ x: number; y: number; add: boolean } | null>(null);
  const pinch = useRef<{ dist: number; zoom: number; cx: number; cy: number; px: number; py: number } | null>(null);
  const rulers = showRulers && pro;

  // ---- size & fit ----
  useLayoutEffect(() => {
    const el = wrapRef.current!;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    setSize({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);
  const fit = useCallback(() => {
    const pad = size.w < 640 ? 24 : 64;
    const z = Math.min((size.w - pad * 2) / doc.width, (size.h - pad * 2) / doc.height);
    const zz = Math.max(ZMIN, Math.min(ZMAX, z));
    ui.getState().set({ zoom: zz, panX: (size.w - doc.width * zz) / 2, panY: (size.h - doc.height * zz) / 2 });
  }, [size.w, size.h, doc.width, doc.height, ui]);
  useEffect(() => { fit(); }, [fitRequest, doc.width, doc.height, size.w > 0 && size.h > 0]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { ui.getState().set({ stage: stageRef.current }); return () => ui.getState().set({ stage: null }); }, [ui]);

  // ---- zoom helper keeping a screen point fixed ----
  const zoomAt = useCallback((nz: number, sx: number, sy: number) => {
    const s = ui.getState();
    const z = Math.max(ZMIN, Math.min(ZMAX, nz));
    const wx = (sx - s.panX) / s.zoom, wy = (sy - s.panY) / s.zoom;
    s.set({ zoom: z, panX: sx - wx * z, panY: sy - wy * z });
  }, [ui]);

  // ---- space bar = temporary hand tool ----
  useEffect(() => {
    const isField = (t: EventTarget | null) => t instanceof HTMLElement && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));
    const down = (e: KeyboardEvent) => { if (e.code === "Space" && !isField(e.target)) { setSpaceDown(true); e.preventDefault(); } };
    const up = (e: KeyboardEvent) => { if (e.code === "Space") setSpaceDown(false); };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => { window.removeEventListener("keydown", down); window.removeEventListener("keyup", up); };
  }, []);

  // ---- transformer follows the selection ----
  const selectable = useMemo(() => selection.filter((id) => { const n = locate(page, id)?.node; return n && !n.locked && n.visible; }), [selection, page]);
  useEffect(() => {
    const tr = trRef.current, stage = stageRef.current;
    if (!tr || !stage) return;
    const nodes = editingTextId ? [] : selectable.map((id) => stage.findOne((n: Konva.Node) => n.id() === id)).filter(Boolean) as Konva.Node[];
    tr.nodes(nodes);
    const only = selectable.length === 1 ? locate(page, selectable[0])?.node : null;
    tr.enabledAnchors(only?.type === "text" ? ["top-left", "top-right", "bottom-left", "bottom-right", "middle-left", "middle-right"]
      : only?.type === "line" ? ["middle-left", "middle-right"] : ["top-left", "top-center", "top-right", "middle-right", "middle-left", "bottom-left", "bottom-center", "bottom-right"]);
    tr.keepRatio(only?.type === "image" || only?.type === "text" || selectable.length > 1);
    tr.getLayer()?.batchDraw();
  }, [selectable, page, editingTextId, doc]);

  const nodeIdOf = (target: Konva.Node, deep: boolean): string | null => {
    let n: Konva.Node | null = target;
    let found: string | null = null;
    while (n && n !== contentRef.current) {
      if (n.name() === "node") {
        found = n.id();
        if (deep) return found;
      }
      n = n.getParent();
    }
    return found; // outermost node = top-level element (unless deep select)
  };

  // ---- pointer handling ----
  const onMouseDown = (e: Konva.KonvaEventObject<MouseEvent | TouchEvent>) => {
    const evt = e.evt as MouseEvent;
    const stage = stageRef.current!;
    const p = stage.getPointerPosition();
    if (!p) return;
    if (tool === "hand" || spaceDown || evt.button === 1) {
      pan.current = { x: p.x, y: p.y, px: ui.getState().panX, py: ui.getState().panY };
      return;
    }
    if (e.target.getParent()?.className === "Transformer") return;
    if (editingTextId) {
      // Clicking away finishes text editing: blurring the textarea saves it.
      (document.activeElement as HTMLElement | null)?.blur();
      return;
    }
    const id = nodeIdOf(e.target, !!(evt.metaKey || evt.ctrlKey));
    const s = store.getState();
    if (id) {
      if (evt.shiftKey) s.select(s.selection.includes(id) ? s.selection.filter((x) => x !== id) : [...s.selection, id]);
      else if (!s.selection.includes(id)) s.select([id]);
      return;
    }
    // empty space: start a marquee
    const rp = contentRef.current!.getRelativePointerPosition()!;
    marqueeStart.current = { x: rp.x, y: rp.y, add: evt.shiftKey };
    if (!evt.shiftKey) s.select([]);
  };
  const onMouseMove = () => {
    const stage = stageRef.current!;
    const p = stage.getPointerPosition();
    if (!p) return;
    if (pan.current) {
      ui.getState().set({ panX: pan.current.px + p.x - pan.current.x, panY: pan.current.py + p.y - pan.current.y });
      return;
    }
    if (marqueeStart.current) {
      const rp = contentRef.current!.getRelativePointerPosition()!;
      const m = marqueeStart.current;
      setMarquee({ x: Math.min(m.x, rp.x), y: Math.min(m.y, rp.y), width: Math.abs(rp.x - m.x), height: Math.abs(rp.y - m.y) });
    }
  };
  const onMouseUp = () => {
    pan.current = null;
    if (marqueeStart.current && marquee && (marquee.width > 2 || marquee.height > 2)) {
      const hits = flatten(page).filter((f) => f.depth === 0 && f.node.visible && !f.node.locked && intersects(f.box, marquee)).map((f) => f.node.id);
      const s = store.getState();
      s.select(marqueeStart.current.add ? [...new Set([...s.selection, ...hits])] : hits);
    }
    marqueeStart.current = null;
    setMarquee(null);
  };
  const onWheel = (e: Konva.KonvaEventObject<WheelEvent>) => {
    e.evt.preventDefault();
    const p = stageRef.current!.getPointerPosition();
    if (!p) return;
    if (e.evt.ctrlKey || e.evt.metaKey) zoomAt(ui.getState().zoom * Math.exp(-e.evt.deltaY * 0.01), p.x, p.y);
    else { const s = ui.getState(); s.set({ panX: s.panX - e.evt.deltaX, panY: s.panY - e.evt.deltaY }); }
  };
  const onTouchMove = (e: Konva.KonvaEventObject<TouchEvent>) => {
    const t = e.evt.touches;
    if (t.length !== 2) return;
    e.evt.preventDefault();
    const rect = stageRef.current!.container().getBoundingClientRect();
    const cx = (t[0].clientX + t[1].clientX) / 2 - rect.left, cy = (t[0].clientY + t[1].clientY) / 2 - rect.top;
    const dist = Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
    const s = ui.getState();
    if (!pinch.current) { pinch.current = { dist, zoom: s.zoom, cx, cy, px: s.panX, py: s.panY }; return; }
    const pc = pinch.current;
    const z = Math.max(ZMIN, Math.min(ZMAX, pc.zoom * (dist / pc.dist)));
    const wx = (pc.cx - pc.px) / pc.zoom, wy = (pc.cy - pc.py) / pc.zoom;
    s.set({ zoom: z, panX: cx - wx * z, panY: cy - wy * z });
  };

  // ---- drag with smart snapping ----
  const onDragMove = (e: Konva.KonvaEventObject<DragEvent>) => {
    const node = e.target;
    const s = store.getState();
    if (s.selection.length !== 1 || node.getParent() !== contentRef.current) { setGuides([]); return; }
    const box = node.getClientRect({ relativeTo: contentRef.current! });
    const targets: Box[] = [{ x: 0, y: 0, width: doc.width, height: doc.height },
      ...flatten(page).filter((f) => f.depth === 0 && f.node.id !== node.id() && f.node.visible).map((f) => f.box)];
    const r = snapBox(box, targets, 6 / ui.getState().zoom);
    if (r.dx || r.dy) node.position({ x: node.x() + r.dx, y: node.y() + r.dy });
    setGuides(r.guides);
  };
  const onDragEnd = () => {
    setGuides([]);
    const stage = stageRef.current!;
    const ids = store.getState().selection;
    store.getState().changePage("Move", (p) => {
      for (const id of ids) {
        const k = stage.findOne((n: Konva.Node) => n.id() === id);
        const l = locate(p as never, id);
        if (k && l) { l.node.x = round(k.x()); l.node.y = round(k.y()); }
      }
    });
  };

  // ---- transform (resize / rotate) ----
  const onTransform = () => {
    const tr = trRef.current!;
    const anchor = tr.getActiveAnchor();
    if (anchor !== "middle-left" && anchor !== "middle-right") return;
    for (const k of tr.nodes()) {
      const text = (k as Konva.Group).findOne?.("Text") as Konva.Text | undefined;
      if (text && (k as Konva.Group).getChildren().length === 1) {
        text.width(Math.max(10, text.width() * k.scaleX()));
        k.scaleX(1);
      }
    }
  };
  const onTransformEnd = () => {
    const tr = trRef.current!;
    const widthOnly = ["middle-left", "middle-right"].includes(tr.getActiveAnchor() ?? "");
    const ks = tr.nodes();
    store.getState().changePage("Resize", (p) => {
      for (const k of ks) {
        const l = locate(p as never, k.id());
        if (!l) continue;
        const n = l.node as DesignNode;
        const sx = k.scaleX(), sy = k.scaleY();
        if (n.type === "text" && widthOnly) {
          const text = (k as Konva.Group).findOne("Text") as Konva.Text;
          n.width = Math.max(10, round(text.width()));
        } else bakeScale(n, sx, sy);
        n.x = round(k.x()); n.y = round(k.y()); n.rotation = round(k.rotation(), 2);
        if (n.type === "text") fitText(n);
        k.scale({ x: 1, y: 1 });
      }
    });
  };

  // ---- hover outline ----
  const onOver = (e: Konva.KonvaEventObject<MouseEvent>) => {
    const id = nodeIdOf(e.target, e.evt.metaKey || e.evt.ctrlKey);
    if (!id || store.getState().selection.includes(id)) return setHover(null);
    const k = stageRef.current!.findOne((n: Konva.Node) => n.id() === id);
    setHover(k ? k.getClientRect({ relativeTo: contentRef.current! }) : null);
  };

  const onDblClick = (e: Konva.KonvaEventObject<MouseEvent>) => {
    const id = nodeIdOf(e.target, true);
    const n = id ? locate(page, id)?.node : null;
    if (n?.type === "text" && !n.locked) { store.getState().select([n.id]); ui.getState().set({ editingTextId: n.id }); }
  };

  const drop = useImageDrop((sx, sy) => {
    const s = ui.getState();
    return { x: (sx - s.panX - (rulers ? RULER : 0)) / s.zoom, y: (sy - s.panY - (rulers ? RULER : 0)) / s.zoom };
  });

  const cursor = tool === "hand" || spaceDown ? (pan.current ? "grabbing" : "grab") : "default";
  const stageW = Math.max(1, size.w - (rulers ? RULER : 0)), stageH = Math.max(1, size.h - (rulers ? RULER : 0));
  const editing = editingTextId ? (locate(page, editingTextId)?.node as TextNode | undefined) : undefined;

  return (
    <div ref={wrapRef} className="relative flex-1 min-w-0 min-h-0 bg-canvas overflow-hidden select-none touch-none" style={{ cursor }}
      onDragOver={drop.onDragOver} onDrop={drop.onDrop} data-testid="canvas">
      {rulers && <Rulers width={size.w} height={size.h} size={RULER} />}
      <div className="absolute" style={{ left: rulers ? RULER : 0, top: rulers ? RULER : 0 }}>
        <Stage ref={stageRef} width={stageW} height={stageH} x={panX} y={panY} scaleX={zoom} scaleY={zoom}
          onMouseDown={onMouseDown} onTouchStart={onMouseDown} onMouseMove={onMouseMove} onTouchMove={(e) => { onTouchMove(e); onMouseMove(); }}
          onMouseUp={onMouseUp} onTouchEnd={() => { pinch.current = null; onMouseUp(); }} onWheel={onWheel} onDblClick={onDblClick} onDblTap={onDblClick as never}
          onMouseOver={onOver} onMouseLeave={() => setHover(null)}>
          <Layer>
            <Rect x={0} y={0} width={doc.width} height={doc.height} fill="#000" opacity={0.08} shadowBlur={24 / zoom} shadowOpacity={0.25} listening={false} />
            <Group ref={contentRef} clipX={0} clipY={0} clipWidth={doc.width} clipHeight={doc.height}>
              <Rect name="page-bg" x={0} y={0} width={doc.width} height={doc.height}
                {...(page.background.type === "none" ? { fill: "#ffffff" } : fillProps(page.background, doc.width, doc.height))} />
              {page.children.map((n) => (
                <NodeView key={n.id} node={n} selection={selection} editingTextId={editingTextId} canDrag={tool === "select" && !spaceDown}
                  onDragMove={onDragMove} onDragEnd={onDragEnd} />
              ))}
              {showGrid && <Grid w={doc.width} h={doc.height} step={gridSize} zoom={zoom} />}
            </Group>
          </Layer>
          <Layer>
            <Group x={0} y={0}>
              {hover && <Rect {...hover} stroke="#5b4cf0" strokeWidth={1.5 / zoom} listening={false} />}
              {guides.map((g, i) => (
                <Line key={i} points={g.axis === "x" ? [g.pos, g.from, g.pos, g.to] : [g.from, g.pos, g.to, g.pos]} stroke="#ff2d87" strokeWidth={1 / zoom} dash={[4 / zoom, 3 / zoom]} listening={false} />
              ))}
              {marquee && <Rect {...marquee} fill="rgba(91,76,240,0.08)" stroke="#5b4cf0" strokeWidth={1 / zoom} listening={false} />}
            </Group>
            <Transformer ref={trRef} rotateEnabled flipEnabled={false} anchorSize={9} anchorCornerRadius={5} borderStroke="#5b4cf0" anchorStroke="#5b4cf0"
              anchorFill="#fff" rotationSnaps={[0, 45, 90, 135, 180, 225, 270, 315]} rotationSnapTolerance={4} ignoreStroke
              boundBoxFunc={(o, n) => (Math.abs(n.width) < 4 || Math.abs(n.height) < 1 ? o : n)} onTransform={onTransform} onTransformEnd={onTransformEnd} />
          </Layer>
        </Stage>
      </div>
      {editing && <TextEditor node={editing} offset={rulers ? RULER : 0} />}
    </div>
  );
}

function NodeView({ node, selection, editingTextId, canDrag, onDragMove, onDragEnd }: {
  node: DesignNode; selection: string[]; editingTextId: string | null; canDrag: boolean;
  onDragMove: (e: Konva.KonvaEventObject<DragEvent>) => void; onDragEnd: () => void;
}) {
  if (!node.visible) return null;
  const draggable = canDrag && selection.includes(node.id) && !node.locked && editingTextId !== node.id;
  const common = {
    id: node.id, name: "node", x: node.x, y: node.y, rotation: node.rotation, opacity: node.type === "group" ? node.opacity : 1,
    draggable, listening: !node.locked, onDragMove, onDragEnd,
  };
  if (node.type === "group") {
    return (
      <Group {...common}>
        {node.children.map((c) => <NodeView key={c.id} node={c} selection={selection} editingTextId={editingTextId} canDrag={canDrag} onDragMove={onDragMove} onDragEnd={onDragEnd} />)}
      </Group>
    );
  }
  return (
    <Group {...common}>
      <Shape node={node} hidden={editingTextId === node.id} />
    </Group>
  );
}

function Shape({ node, hidden }: { node: ShapeNode; hidden: boolean }) {
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const src = node.type === "image" ? node.src : null;
  useEffect(() => {
    if (!src) return;
    let alive = true;
    loadImage(src).then((i) => alive && setImg(i)).catch(() => alive && setImg(null));
    return () => { alive = false; };
  }, [src]);
  const p = primitive(node, img);
  const C = PRIM[p.kind] as unknown as React.ComponentType<Record<string, unknown>>;
  if (node.type === "image" && !img) {
    return <Rect width={node.width} height={node.height} fill="#d0d4db" cornerRadius={node.cornerRadius} opacity={node.opacity} />;
  }
  return <C {...p.props} opacity={hidden ? 0 : node.opacity} />;
}

function Grid({ w, h, step, zoom }: { w: number; h: number; step: number; zoom: number }) {
  const lines: number[][] = [];
  const s = step * Math.max(1, Math.ceil(6 / (step * zoom))); // never denser than 6 screen px
  for (let x = s; x < w; x += s) lines.push([x, 0, x, h]);
  for (let y = s; y < h; y += s) lines.push([0, y, w, y]);
  return <>{lines.map((pts, i) => <Line key={i} points={pts} stroke="rgba(91,76,240,0.25)" strokeWidth={1 / zoom} listening={false} />)}</>;
}

/** In-place text editing with a textarea that matches the canvas text (works for Dhivehi RTL). */
function TextEditor({ node, offset }: { node: TextNode; offset: number }) {
  const { store, ui } = useEditorCtx();
  const stage = useUi((s) => s.stage);
  const zoom = useUi((s) => s.zoom);
  useUi((s) => [s.panX, s.panY]);
  const [value, setValue] = useState(node.text);
  const ref = useRef<HTMLTextAreaElement>(null);
  const done = useRef(false);
  useEffect(() => { ref.current?.focus(); ref.current?.select(); }, []);
  const k = stage?.findOne((n: Konva.Node) => n.id() === node.id);
  if (!k) return null;
  const pos = k.getAbsoluteTransform().point({ x: 0, y: 0 });
  const rot = k.getAbsoluteRotation();
  const commit = (save: boolean) => {
    if (done.current) return;
    done.current = true;
    if (save && value !== node.text) {
      store.getState().changePage("Edit text", (p) => {
        const n = locate(p as never, node.id)?.node as TextNode | undefined;
        if (n) { n.text = value; fitText(n); }
      });
    }
    ui.getState().set({ editingTextId: null });
  };
  const color = node.fill.type === "solid" ? node.fill.color : node.fill.type === "none" ? "#000" : node.fill.stops[0].color;
  const dir = resolvedDirection({ direction: node.direction, text: value });
  return (
    <textarea ref={ref} value={value} dir={node.direction === "auto" ? "auto" : node.direction} spellCheck={false} aria-label="Edit text"
      onChange={(e) => setValue(e.target.value)} onBlur={() => commit(true)}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Escape") commit(false);
        if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) commit(true);
      }}
      className="absolute m-0 p-0 border-0 outline-none resize-none overflow-hidden bg-transparent"
      style={{
        left: pos.x + offset, top: pos.y + offset, width: node.width * zoom, height: Math.max(node.height, node.fontSize * node.lineHeight) * zoom + 4,
        transform: `rotate(${rot}deg)`, transformOrigin: "top left", fontFamily: fontStack(node.fontFamily),
        fontWeight: nearestWeight(node.fontFamily, node.fontWeight), fontStyle: node.italic ? "italic" : "normal",
        fontSize: node.fontSize * zoom, lineHeight: node.lineHeight, letterSpacing: node.letterSpacing * zoom,
        textAlign: node.align === "justify" ? "justify" : node.align, color, direction: dir, caretColor: "#5b4cf0",
        textDecoration: node.underline ? "underline" : "none", whiteSpace: "pre-wrap", wordBreak: "break-word",
      }} />
  );
}

const round = (v: number, d = 2) => Math.round(v * 10 ** d) / 10 ** d;
const intersects = (a: Box, b: Box) => a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
