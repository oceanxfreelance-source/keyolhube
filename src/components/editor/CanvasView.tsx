"use client";
import { isTypingTarget } from "@/lib/editor/keys";
import Konva from "konva";
import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Arrow, Ellipse, Group, Image as KImage, Layer, Line, Path, Rect, Stage, Text, TextPath, Transformer } from "react-konva";
import { resolvedDirection } from "@/lib/doc/factory";
import { flatten, locate, type Box } from "@/lib/doc/geometry";
import { bakeScale } from "@/lib/doc/ops";
import { snapBox, type Guide } from "@/lib/doc/snap";
import type { DesignNode, ShapeNode, TextNode } from "@/lib/doc/types";
import { make } from "@/lib/doc/factory";
import { fontStack, nearestWeight } from "@/lib/fonts";
import { fillProps, loadImage, primitive } from "@/lib/editor/render";
import { activePage, fitText, useEd, useEditorCtx, useUi } from "./context";
import { Rulers } from "./Rulers";
import { useImageDrop } from "./useUploads";
import { PenPreview, PointEditor, usePen } from "./VectorTools";
import { HealBar, HealStrokes } from "./HealTool";
import { brushPathData, nodeFromItemData } from "@/lib/vector/paths";
import { applyToNode } from "@/lib/photo/konva";
import { maskClipFunc } from "@/lib/editor/mask";

Konva.pixelRatio = typeof window !== "undefined" ? Math.min(2, window.devicePixelRatio || 1) : 1;
const PRIM = { Rect, Ellipse, Line, Arrow, Path, Text, TextPath, Image: KImage } as const;
const ZMIN = 0.02, ZMAX = 16;
const RULER = 20;

export function CanvasView() {
  const { store, ui } = useEditorCtx();
  const doc = useEd((s) => s.doc);
  const page = useEd(activePage);
  const selection = useEd((s) => s.selection);
  const { zoom, panX, panY, tool, showGrid, gridSize, editingTextId, fitRequest, showRulers, pro, editingPathId } = useUi((s) => s);
  const { pen, handlers: penH } = usePen();
  const brush = useUi((s) => s.brush);
  const [stroke, setStroke] = useState<number[] | null>(null);
  const strokeRef = useRef<number[] | null>(null);
  const healRef = useRef<number[] | null>(null);
  // Drag-to-create for rectangle / ellipse / line / text tools.
  const [draft, setDraft] = useState<{ x0: number; y0: number; x1: number; y1: number; shift: boolean } | null>(null);
  const draftRef = useRef<typeof draft>(null);
  const isDrawTool = tool === "rect" || tool === "ellipse" || tool === "line" || tool === "text";
  const finishDraft = () => {
    const d = draftRef.current;
    draftRef.current = null; setDraft(null);
    if (!d) return;
    const W = doc.width, minSide = Math.round(Math.min(W, doc.height) * 0.25);
    let x = Math.min(d.x0, d.x1), y = Math.min(d.y0, d.y1), w = Math.abs(d.x1 - d.x0), h = Math.abs(d.y1 - d.y0);
    const clicked = Math.max(w, h) * ui.getState().zoom < 4;
    if (d.shift && tool !== "line") { const m = Math.max(w, h); w = m; h = m; if (d.x1 < d.x0) x = d.x0 - m; if (d.y1 < d.y0) y = d.y0 - m; }
    let n: DesignNode;
    if (tool === "rect") n = clicked ? make.rect(d.x0 - minSide / 2, d.y0 - minSide / 2, minSide, minSide) : make.rect(x, y, w, h);
    else if (tool === "ellipse") n = clicked ? make.ellipse(d.x0 - minSide / 2, d.y0 - minSide / 2, minSide, minSide) : make.ellipse(x, y, w, h);
    else if (tool === "line") {
      let dx = d.x1 - d.x0, dy = d.y1 - d.y0;
      if (clicked) { dx = minSide; dy = 0; }
      if (d.shift) { const a = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * (Math.PI / 4), len = Math.hypot(dx, dy); dx = Math.cos(a) * len; dy = Math.sin(a) * len; }
      const ln = make.line(d.x0, d.y0, 1);
      ln.points = [0, 0, dx, dy]; ln.width = Math.abs(dx); ln.height = Math.abs(dy);
      ln.stroke.width = Math.max(2, Math.round(W / 300));
      n = ln;
    } else {
      const t = make.text(clicked ? d.x0 : x, clicked ? d.y0 : y, "Type something", Math.round(W / 22), clicked ? Math.round(W * 0.5) : Math.max(40, w));
      fitText(t);
      n = t;
    }
    n.x = Math.round(n.x); n.y = Math.round(n.y);
    store.getState().changePage(`Draw ${n.name.toLowerCase()}`, (p) => { p.children.push(n); });
    store.getState().select([n.id]);
    ui.getState().set({ tool: "select", ...(n.type === "text" ? { editingTextId: n.id } : {}) });
  };
  const healing = useUi((s) => !!s.heal);
  const finishStroke = () => {
    const pts = strokeRef.current;
    strokeRef.current = null; setStroke(null);
    if (!pts || pts.length < 4) return;
    const vs = []; for (let i = 0; i < pts.length; i += 2) vs.push({ x: pts[i], y: pts[i + 1] });
    const data = brushPathData(vs, Math.max(0.5, 1.5 / ui.getState().zoom));
    if (!data) return;
    const b = ui.getState().brush;
    const n = nodeFromItemData(data, { type: "none" }, { color: b.color, width: b.size, cap: "round", join: "round" }, "Brush stroke");
    if (!n) return;
    n.opacity = b.opacity;
    store.getState().changePage("Brush stroke", (p) => { p.children.push(n); });
  };
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
  // Keep the page fitted while the layout settles or the window resizes, until the user zooms or pans.
  const autoFit = useRef(true);
  useEffect(() => { autoFit.current = true; fit(); }, [fitRequest, doc.width, doc.height]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (autoFit.current) fit(); }, [size.w, size.h]); // eslint-disable-line react-hooks/exhaustive-deps
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
    const isField = isTypingTarget;
    // Space pans only when no control has focus (Space must still press buttons and toggles).
    const onControl = (t: EventTarget | null) => isField(t) || (t instanceof HTMLElement && /^(BUTTON|INPUT|A)$/.test(t.tagName));
    const down = (e: KeyboardEvent) => { if (e.code === "Space" && !onControl(e.target)) { setSpaceDown(true); e.preventDefault(); } };
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
    const nodes = editingTextId || editingPathId ? [] : selectable.map((id) => stage.findOne((n: Konva.Node) => n.id() === id)).filter(Boolean) as Konva.Node[];
    tr.nodes(nodes);
    const only = selectable.length === 1 ? locate(page, selectable[0])?.node : null;
    tr.enabledAnchors(only?.type === "text" ? ["top-left", "top-right", "bottom-left", "bottom-right", "middle-left", "middle-right"]
      : only?.type === "line" ? ["middle-left", "middle-right"] : ["top-left", "top-center", "top-right", "middle-right", "middle-left", "bottom-left", "bottom-center", "bottom-right"]);
    tr.keepRatio(only?.type === "image" || only?.type === "text" || selectable.length > 1);
    tr.getLayer()?.batchDraw();
  }, [selectable, page, editingTextId, editingPathId, doc]);

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
      autoFit.current = false;
      pan.current = { x: p.x, y: p.y, px: ui.getState().panX, py: ui.getState().panY };
      return;
    }
    if (e.target.getParent()?.className === "Transformer") return;
    if (tool === "pen") { penH.down(contentRef.current!.getRelativePointerPosition()!); return; }
    if (tool === "brush") { const p0 = contentRef.current!.getRelativePointerPosition()!; strokeRef.current = [p0.x, p0.y]; setStroke([p0.x, p0.y]); return; }
    if (isDrawTool) { const p0 = contentRef.current!.getRelativePointerPosition()!; draftRef.current = { x0: p0.x, y0: p0.y, x1: p0.x, y1: p0.y, shift: evt.shiftKey }; setDraft(draftRef.current); return; }
    const healNow = ui.getState().heal;
    if (healNow) { const p0 = contentRef.current!.getRelativePointerPosition()!; healRef.current = [p0.x, p0.y]; ui.getState().set({ heal: { ...healNow, strokes: [...healNow.strokes, [p0.x, p0.y]] } }); return; }
    if (editingPathId) {
      const nm = e.target.name();
      if (nm === "anchor" || nm === "handle" || nm === "path-hit") return;
      ui.getState().set({ editingPathId: null });
    }
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
    if (tool === "pen") { penH.move(contentRef.current!.getRelativePointerPosition()!); return; }
    if (draftRef.current) {
      const q = contentRef.current!.getRelativePointerPosition()!;
      draftRef.current = { ...draftRef.current, x1: q.x, y1: q.y, shift: !!(window.event as MouseEvent | undefined)?.shiftKey };
      setDraft(draftRef.current);
      return;
    }
    if (healRef.current) {
      const h0 = ui.getState().heal;
      if (!h0) { healRef.current = null; return; }
      const q = contentRef.current!.getRelativePointerPosition()!;
      healRef.current = [...healRef.current, q.x, q.y];
      ui.getState().set({ heal: { ...h0, strokes: [...h0.strokes.slice(0, -1), healRef.current] } });
      return;
    }
    if (tool === "brush") {
      if (!strokeRef.current) return;
      const q = contentRef.current!.getRelativePointerPosition()!;
      const s0 = strokeRef.current, lx = s0[s0.length - 2], ly = s0[s0.length - 1];
      if (Math.hypot(q.x - lx, q.y - ly) * ui.getState().zoom < 1.5) return; // ignore sub-pixel jitter
      strokeRef.current = [...s0, q.x, q.y]; setStroke(strokeRef.current);
      return;
    }
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
    if (tool === "pen") { penH.up(); return; }
    if (tool === "brush") { finishStroke(); return; }
    if (draftRef.current) { finishDraft(); return; }
    if (healRef.current) { healRef.current = null; return; }
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
    autoFit.current = false;
    const p = stageRef.current!.getPointerPosition();
    if (!p) return;
    if (e.evt.ctrlKey || e.evt.metaKey) zoomAt(ui.getState().zoom * Math.exp(-e.evt.deltaY * 0.01), p.x, p.y);
    else { const s = ui.getState(); s.set({ panX: s.panX - e.evt.deltaX, panY: s.panY - e.evt.deltaY }); }
  };
  const onTouchMove = (e: Konva.KonvaEventObject<TouchEvent>) => {
    const t = e.evt.touches;
    if (t.length !== 2) return;
    e.evt.preventDefault();
    autoFit.current = false;
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
    if (tool === "pen") { penH.dbl(); return; }
    const id = nodeIdOf(e.target, true);
    const n = id ? locate(page, id)?.node : null;
    if (n?.type === "path" && !n.locked) { store.getState().select([n.id]); ui.getState().set({ editingPathId: n.id }); return; }
    if (n?.type === "text" && !n.locked) { store.getState().select([n.id]); ui.getState().set({ editingTextId: n.id }); }
  };

  // Stable handler identities so unchanged elements are not re-rendered (see NodeView memo).
  const dragMoveRef = useRef(onDragMove); dragMoveRef.current = onDragMove;
  const dragEndRef = useRef(onDragEnd); dragEndRef.current = onDragEnd;
  const stableDragMove = useCallback((e: Konva.KonvaEventObject<DragEvent>) => dragMoveRef.current(e), []);
  const stableDragEnd = useCallback(() => dragEndRef.current(), []);

  const drop = useImageDrop((sx, sy) => {
    const s = ui.getState();
    return { x: (sx - s.panX - (rulers ? RULER : 0)) / s.zoom, y: (sy - s.panY - (rulers ? RULER : 0)) / s.zoom };
  });

  const cursor = tool === "hand" || spaceDown ? (pan.current ? "grabbing" : "grab") : tool === "pen" || tool === "brush" || healing || isDrawTool ? (tool === "text" ? "text" : "crosshair") : "default";
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
            <Group ref={contentRef} name="page-content" clipX={0} clipY={0} clipWidth={doc.width} clipHeight={doc.height}>
              <Rect name="page-bg" x={0} y={0} width={doc.width} height={doc.height}
                {...(page.background.type === "none" ? { fill: "#ffffff" } : fillProps(page.background, doc.width, doc.height))} />
              {page.children.map((n) => (
                <NodeView key={n.id} node={n} selection={selection} editingTextId={editingTextId} canDrag={tool === "select" && !spaceDown && !editingPathId && !healing}
                  onDragMove={stableDragMove} onDragEnd={stableDragEnd} />
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
              {tool === "pen" && <PenPreview pen={pen} />}
              <HealStrokes />
              {draft && (tool === "line"
                ? <Line points={[draft.x0, draft.y0, draft.x1, draft.y1]} stroke="#7b7bff" strokeWidth={2 / zoom} listening={false} />
                : tool === "ellipse"
                  ? <Ellipse x={(draft.x0 + draft.x1) / 2} y={(draft.y0 + draft.y1) / 2} radiusX={Math.abs(draft.x1 - draft.x0) / 2} radiusY={Math.abs(draft.y1 - draft.y0) / 2} stroke="#7b7bff" strokeWidth={1.5 / zoom} dash={[4 / zoom, 3 / zoom]} listening={false} />
                  : <Rect x={Math.min(draft.x0, draft.x1)} y={Math.min(draft.y0, draft.y1)} width={Math.abs(draft.x1 - draft.x0)} height={Math.abs(draft.y1 - draft.y0)} stroke="#7b7bff" strokeWidth={1.5 / zoom} dash={[4 / zoom, 3 / zoom]} listening={false} />)}
              {stroke && <Line points={stroke} stroke={brush.color} strokeWidth={brush.size} opacity={brush.opacity} lineCap="round" lineJoin="round" tension={0.4} listening={false} />}
              {editingPathId && <PointEditor pathId={editingPathId} />}
            </Group>
            <Transformer ref={trRef} rotateEnabled flipEnabled={false} anchorSize={9} anchorCornerRadius={5} borderStroke="#5b4cf0" anchorStroke="#5b4cf0"
              anchorFill="#fff" rotationSnaps={[0, 45, 90, 135, 180, 225, 270, 315]} rotationSnapTolerance={4} ignoreStroke
              boundBoxFunc={(o, n) => (Math.abs(n.width) < 4 || Math.abs(n.height) < 1 ? o : n)} onTransform={onTransform} onTransformEnd={onTransformEnd} />
          </Layer>
        </Stage>
      </div>
      {editing && <TextEditor node={editing} offset={rulers ? RULER : 0} />}
      <HealBar />
      {tool === "brush" && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-10 card flex items-center gap-3 px-3 py-2 text-sm" data-testid="brush-bar">
          <span className="font-medium">Brush</span>
          <input type="color" value={brush.color} aria-label="Brush colour" onChange={(e) => ui.getState().set({ brush: { ...brush, color: e.target.value } })} />
          <label className="flex items-center gap-1">Size <input type="range" min={1} max={Math.max(50, Math.round(doc.width / 20))} value={brush.size} aria-label="Brush size" onChange={(e) => ui.getState().set({ brush: { ...brush, size: Number(e.target.value) } })} /></label>
          <label className="flex items-center gap-1">Opacity <input type="range" min={0.1} max={1} step={0.05} value={brush.opacity} aria-label="Brush opacity" onChange={(e) => ui.getState().set({ brush: { ...brush, opacity: Number(e.target.value) } })} /></label>
          <button className="btn h-7 px-2" onClick={() => ui.getState().set({ tool: "select" })}>Done</button>
        </div>
      )}
    </div>
  );
}

type NodeViewProps = {
  node: DesignNode; selection: string[]; editingTextId: string | null; canDrag: boolean;
  onDragMove: (e: Konva.KonvaEventObject<DragEvent>) => void; onDragEnd: () => void;
};

/** True if this node or anything inside it is in `ids`. */
function touches(n: DesignNode, ids: string[] | string | null): boolean {
  if (!ids || !ids.length) return false;
  const has = (id: string) => (typeof ids === "string" ? ids === id : ids.includes(id));
  if (has(n.id)) return true;
  return n.type === "group" && n.children.some((c) => touches(c, ids));
}

// Documents are immutable (immer), so an unchanged element keeps the same object: skip its render.
const NodeView = memo(NodeViewInner, (a: NodeViewProps, b: NodeViewProps) =>
  a.node === b.node && a.canDrag === b.canDrag && a.onDragMove === b.onDragMove && a.onDragEnd === b.onDragEnd &&
  (a.editingTextId === b.editingTextId || (!touches(b.node, a.editingTextId) && !touches(b.node, b.editingTextId))) &&
  (a.selection === b.selection || (!touches(b.node, a.selection) && !touches(b.node, b.selection))));

function NodeViewInner({ node, selection, editingTextId, canDrag, onDragMove, onDragEnd }: NodeViewProps) {
  if (!node.visible) return null;
  const draggable = canDrag && selection.includes(node.id) && !node.locked && editingTextId !== node.id;
  const common = {
    id: node.id, name: "node", x: node.x, y: node.y, rotation: node.rotation, opacity: node.type === "group" ? node.opacity : 1,
    draggable, listening: !node.locked, onDragMove, onDragEnd,
  };
  if (node.type === "group") {
    const clip = maskClipFunc(node);
    return (
      <Group {...common} clipFunc={clip}>
        {(node.mask ? node.children.slice(1) : node.children).map((c) => <NodeView key={c.id} node={c} selection={selection} editingTextId={editingTextId} canDrag={canDrag} onDragMove={onDragMove} onDragEnd={onDragEnd} />)}
      </Group>
    );
  }
  return (
    <Group {...common}>
      <Shape node={node} hidden={editingTextId === node.id} />
    </Group>
  );
}

const Shape = memo(ShapeInner);
function ShapeInner({ node, hidden }: { node: ShapeNode; hidden: boolean }) {
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const ref = useRef<Konva.Image>(null);
  const adjust = node.type === "image" ? node.adjust : undefined;
  // Re-cache adjusted images only when the zoom changes by about 2x (keeps zooming smooth).
  const zoomBucket = useUi((s) => (adjust ? Math.round(Math.log2(s.zoom * 4)) : 0));
  const showOriginal = useUi((s) => (adjust ? s.showOriginal : false));
  useEffect(() => {
    const k = ref.current;
    if (!k || node.type !== "image" || !img) return;
    const pr = Math.min(4, Math.max(0.1, 2 ** zoomBucket / 4) * (window.devicePixelRatio || 1));
    applyToNode(k, showOriginal ? undefined : adjust, pr);
    k.getLayer()?.batchDraw();
  }, [img, adjust, zoomBucket, showOriginal, node]); // eslint-disable-line react-hooks/exhaustive-deps
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
  return <C {...p.props} ref={node.type === "image" ? ref : undefined} opacity={hidden ? 0 : node.opacity} />;
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
  // Focus as soon as the textarea exists (it can mount a frame after the text node is created).
  const focused = useRef(false);
  const attach = (el: HTMLTextAreaElement | null) => {
    ref.current = el;
    if (el && !focused.current) { focused.current = true; el.focus(); el.select(); }
  };
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
    <textarea ref={attach} value={value} dir={node.direction === "auto" ? "auto" : node.direction} spellCheck={false} aria-label="Edit text"
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
