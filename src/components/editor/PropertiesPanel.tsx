"use client";
import {
  AlignCenterHorizontal, AlignCenterVertical, AlignEndHorizontal, AlignEndVertical, AlignHorizontalSpaceAround, AlignStartHorizontal,
  AlignStartVertical, AlignVerticalSpaceAround, ArrowDownToLine, ArrowUpToLine, BringToFront, Copy, Group as GroupIcon, Italic, Lock,
  SendToBack, Trash2, Underline, Ungroup, Unlock,
} from "lucide-react";
import type { Draft } from "immer";
import { useMemo, useState } from "react";
import { locate } from "@/lib/doc/geometry";
import { alignNodes, distributeNodes, duplicateNodes, groupNodes, removeNodes, reorder, ungroup, type Align } from "@/lib/doc/ops";
import { BLEND_MODES, type DesignNode, type Fill, type ImageNode, type Page, type Shadow, type Stroke, type TextNode } from "@/lib/doc/types";
import { fontDef, fontStack, hasItalic, nearestWeight } from "@/lib/fonts";
import { FontPicker } from "./FontPicker";
import { fromUnit, toUnit } from "@/lib/presets";
import { activePage, fitText, selectedNodes, useEd, useEditorCtx, useUi } from "./context";

export function PropertiesPanel() {
  const nodes = useEd(selectedNodes);
  const pro = useUi((s) => s.pro);
  return (
    <aside className="max-md:order-2 w-full md:w-72 shrink-0 bg-surface md:border-l border-line max-md:border-t overflow-y-auto max-md:max-h-[38dvh]" aria-label="Properties">
      <div className="p-4 space-y-5">
        {nodes.length === 0 ? <PageSettings /> : (
          <>
            <Arrange nodes={nodes} />
            {nodes.length === 1 ? <NodeProps node={nodes[0]} pro={pro} /> : <MultiProps nodes={nodes} pro={pro} />}
          </>
        )}
      </div>
    </aside>
  );
}

// ---------- update helpers ----------
function useUpdate() {
  const { store } = useEditorCtx();
  return (label: string, fn: (n: Draft<DesignNode>) => void, merge?: string) => {
    const ids = store.getState().selection;
    store.getState().changePage(label, (p) => {
      for (const id of ids) {
        const n = locate(p as Page, id)?.node as Draft<DesignNode> | undefined;
        if (!n) continue;
        fn(n);
        if (n.type === "text") fitText(n as TextNode);
      }
    }, merge ? { merge: `${merge}:${ids.join(",")}` } : undefined);
  };
}

// ---------- sections ----------
function Section({ title, children, right }: { title: string; children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <section className="space-y-2.5">
      <div className="flex items-center justify-between"><h3 className="label">{title}</h3>{right}</div>
      {children}
    </section>
  );
}

function Arrange({ nodes }: { nodes: DesignNode[] }) {
  const { store } = useEditorCtx();
  const s = () => store.getState();
  const ids = nodes.map((n) => n.id);
  const size = useEd((st) => ({ width: st.doc.width, height: st.doc.height }));
  const canGroup = nodes.length > 1;
  const isGroup = nodes.length === 1 && nodes[0].type === "group";
  const locked = nodes.every((n) => n.locked);
  const align = (a: Align) => s().changePage("Align", (p) => alignNodes(p as Page, ids, a, size));
  const A = (a: Align, Icon: React.ComponentType<{ size?: number }>, label: string) => (
    <button className="btn btn-ghost btn-icon" onClick={() => align(a)} title={label} aria-label={label}><Icon size={17} /></button>
  );
  return (
    <Section title={nodes.length > 1 ? `${nodes.length} selected` : nodes[0].name}>
      <div className="grid grid-cols-6 gap-0.5 -mx-1">
        {A("left", AlignStartVertical, nodes.length > 1 ? "Align left" : "Align to page left")}
        {A("hcenter", AlignCenterVertical, "Align centre")}
        {A("right", AlignEndVertical, "Align right")}
        {A("top", AlignStartHorizontal, "Align top")}
        {A("vcenter", AlignCenterHorizontal, "Align middle")}
        {A("bottom", AlignEndHorizontal, "Align bottom")}
      </div>
      {nodes.length >= 3 && (
        <div className="flex gap-1">
          <button className="btn flex-1" onClick={() => s().changePage("Distribute", (p) => distributeNodes(p as Page, ids, "x"))}><AlignHorizontalSpaceAround size={15} /> Space H</button>
          <button className="btn flex-1" onClick={() => s().changePage("Distribute", (p) => distributeNodes(p as Page, ids, "y"))}><AlignVerticalSpaceAround size={15} /> Space V</button>
        </div>
      )}
      <div className="flex flex-wrap gap-0.5 -mx-1">
        <button className="btn btn-ghost btn-icon" title="Bring to front" aria-label="Bring to front" onClick={() => s().changePage("Bring to front", (p) => reorder(p as Page, ids, "front"))}><BringToFront size={17} /></button>
        <button className="btn btn-ghost btn-icon" title="Bring forward" aria-label="Bring forward" onClick={() => s().changePage("Bring forward", (p) => reorder(p as Page, ids, "forward"))}><ArrowUpToLine size={17} /></button>
        <button className="btn btn-ghost btn-icon" title="Send backward" aria-label="Send backward" onClick={() => s().changePage("Send backward", (p) => reorder(p as Page, ids, "backward"))}><ArrowDownToLine size={17} /></button>
        <button className="btn btn-ghost btn-icon" title="Send to back" aria-label="Send to back" onClick={() => s().changePage("Send to back", (p) => reorder(p as Page, ids, "back"))}><SendToBack size={17} /></button>
        {canGroup && <button className="btn btn-ghost btn-icon" title="Group (Ctrl+G)" aria-label="Group" onClick={() => { let g: string | null = null; s().changePage("Group", (p) => { g = groupNodes(p as Page, ids); }); if (g) s().select([g]); }}><GroupIcon size={17} /></button>}
        {isGroup && <button className="btn btn-ghost btn-icon" title="Ungroup (Ctrl+Shift+G)" aria-label="Ungroup" onClick={() => { let k: string[] = []; s().changePage("Ungroup", (p) => { k = ungroup(p as Page, ids[0]); }); s().select(k); }}><Ungroup size={17} /></button>}
        <button className="btn btn-ghost btn-icon" title="Duplicate (Ctrl+D)" aria-label="Duplicate" onClick={() => { let k: string[] = []; s().changePage("Duplicate", (p) => { k = duplicateNodes(p as Page, ids); }); s().select(k); }}><Copy size={17} /></button>
        <button className="btn btn-ghost btn-icon" title={locked ? "Unlock" : "Lock"} aria-label={locked ? "Unlock" : "Lock"} onClick={() => s().changePage(locked ? "Unlock" : "Lock", (p) => ids.forEach((id) => { const n = locate(p as Page, id)?.node; if (n) n.locked = !locked; }))}>{locked ? <Lock size={17} /> : <Unlock size={17} />}</button>
        <button className="btn btn-ghost btn-icon btn-danger" title="Delete (Del)" aria-label="Delete" onClick={() => s().changePage("Delete", (p) => removeNodes(p as Page, ids))}><Trash2 size={17} /></button>
      </div>
    </Section>
  );
}

function MultiProps({ nodes, pro }: { nodes: DesignNode[]; pro: boolean }) {
  const upd = useUpdate();
  const op = Math.round((nodes.reduce((a, n) => a + n.opacity, 0) / nodes.length) * 100);
  return (
    <Section title="Appearance">
      <Slider label="Opacity" value={op} min={0} max={100} unit="%" onChange={(v) => upd("Opacity", (n) => { n.opacity = v / 100; }, "opacity")} />
      {pro && <p className="text-xs text-muted">Select a single element to edit its colours and size.</p>}
    </Section>
  );
}

function NodeProps({ node, pro }: { node: DesignNode; pro: boolean }) {
  const upd = useUpdate();
  const doc = useEd((s) => s.doc);
  const hasFill = "fill" in node;
  return (
    <>
      {node.type === "text" && <TextProps node={node} />}
      {node.type === "image" && <ImageProps node={node} pro={pro} />}
      {hasFill && (
        <Section title={node.type === "text" ? "Text colour" : "Fill"}>
          <FillEditor fill={(node as { fill: Fill }).fill} allowNone={node.type !== "text"} onChange={(f, m) => upd("Fill", (n) => { (n as { fill: Fill }).fill = f; }, m ? "fill" : undefined)} />
        </Section>
      )}
      {node.type === "line" && (
        <Section title="Line">
          <ColorRow label="Colour" value={node.stroke.color} onChange={(c) => upd("Line colour", (n) => { if (n.type === "line") n.stroke.color = c; }, "stroke")} />
          <Slider label="Thickness" value={node.stroke.width} min={1} max={Math.max(100, Math.round(doc.width / 20))} onChange={(v) => upd("Line thickness", (n) => { if (n.type === "line") n.stroke.width = v; }, "sw")} />
          <div className="flex gap-2">
            <Toggle label="Dashed" on={!!node.stroke.dash?.length} onChange={(on) => upd("Dash", (n) => { if (n.type === "line") n.stroke.dash = on ? [n.stroke.width * 3, n.stroke.width * 2] : undefined; })} />
            <Toggle label="Arrow" on={node.arrowEnd} onChange={(on) => upd("Arrow", (n) => { if (n.type === "line") n.arrowEnd = on; })} />
          </div>
        </Section>
      )}
      {(node.type === "rect" || node.type === "image") && (
        <Section title="Corners">
          <Slider label="Rounding" value={node.cornerRadius} min={0} max={Math.round(Math.min(node.width, node.height) / 2)} onChange={(v) => upd("Corner radius", (n) => { if (n.type === "rect" || n.type === "image") n.cornerRadius = v; }, "cr")} />
        </Section>
      )}
      {node.type === "polygon" && (
        <Section title="Shape"><Slider label="Sides" value={node.sides} min={3} max={12} onChange={(v) => upd("Sides", (n) => { if (n.type === "polygon") n.sides = v; }, "sides")} /></Section>
      )}
      {node.type === "star" && (
        <Section title="Shape">
          <Slider label="Points" value={node.points} min={3} max={16} onChange={(v) => upd("Points", (n) => { if (n.type === "star") n.points = v; }, "pts")} />
          <Slider label="Inner size" value={Math.round(node.innerRatio * 100)} min={10} max={95} unit="%" onChange={(v) => upd("Star depth", (n) => { if (n.type === "star") n.innerRatio = v / 100; }, "ir")} />
        </Section>
      )}
      {"stroke" in node && node.type !== "line" && (
        <Section title="Border">
          <StrokeEditor stroke={(node as { stroke: Stroke }).stroke} max={Math.max(50, Math.round(doc.width / 40))} onChange={(st, m) => upd("Border", (n) => { (n as { stroke: Stroke }).stroke = st; }, m ? "stroke" : undefined)} />
        </Section>
      )}
      <Section title="Appearance">
        <Slider label="Opacity" value={Math.round(node.opacity * 100)} min={0} max={100} unit="%" onChange={(v) => upd("Opacity", (n) => { n.opacity = v / 100; }, "opacity")} />
        {pro && node.type !== "group" && (
          <label className="flex items-center gap-2 text-sm">
            <span className="w-20 text-muted">Blend</span>
            <select className="input" value={node.blendMode} onChange={(e) => upd("Blend mode", (n) => { n.blendMode = e.target.value as DesignNode["blendMode"]; })} aria-label="Blend mode">
              {BLEND_MODES.map((b) => <option key={b} value={b}>{b === "source-over" ? "Normal" : b.replace(/-/g, " ")}</option>)}
            </select>
          </label>
        )}
        {node.type !== "group" && <ShadowEditor shadow={node.shadow} pro={pro} onChange={(sh, m) => upd("Shadow", (n) => { n.shadow = sh; }, m ? "shadow" : undefined)} />}
      </Section>
      {pro && <Transform node={node} />}
    </>
  );
}

function Transform({ node }: { node: DesignNode }) {
  const upd = useUpdate();
  const { unit, dpi } = useEd((s) => ({ unit: s.doc.unit, dpi: s.doc.dpi }));
  const show = (px: number) => Math.round(toUnit(px, unit, dpi) * (unit === "px" ? 1 : 100)) / (unit === "px" ? 1 : 100);
  const set = (k: "x" | "y" | "width" | "height", v: number) => upd("Transform", (n) => {
    const px = fromUnit(v, unit, dpi);
    if (k === "width" || k === "height") {
      if (px < 1) return;
      if (n.type === "line") { const s = px / Math.max(1, n.width); n.points = n.points.map((p, i) => (i % 2 === 0 ? p * s : p)); n.width = px; return; }
    }
    n[k] = px;
  });
  return (
    <Section title={`Position & size (${unit})`}>
      <div className="grid grid-cols-2 gap-2">
        <NumField label="X" value={show(node.x)} onChange={(v) => set("x", v)} />
        <NumField label="Y" value={show(node.y)} onChange={(v) => set("y", v)} />
        <NumField label="W" value={show(node.width)} onChange={(v) => set("width", v)} disabled={node.type === "text" ? false : node.type === "group"} />
        <NumField label="H" value={show(node.height)} onChange={(v) => set("height", v)} disabled={node.type === "text" || node.type === "group" || node.type === "line"} />
        <NumField label="°" value={Math.round(node.rotation * 10) / 10} onChange={(v) => upd("Rotate", (n) => { n.rotation = ((v % 360) + 360) % 360; })} />
      </div>
    </Section>
  );
}

function TextProps({ node }: { node: TextNode }) {
  const upd = useUpdate();
  const { store } = useEditorCtx();
  const [picker, setPicker] = useState(false);
  const t = (label: string, fn: (n: TextNode) => void, merge?: string) => upd(label, (n) => { if (n.type === "text") fn(n as TextNode); }, merge);
  const weights = fontDef(node.fontFamily).weights;
  const W = useEd((s) => s.doc.width);
  return (
    <Section title="Text">
      <button className="input text-start truncate" aria-label={`Font: ${node.fontFamily}`} style={{ fontFamily: fontStack(node.fontFamily) }} onClick={() => setPicker(true)}>
        {node.fontFamily}
      </button>
      {picker && <FontPicker current={node.fontFamily} onClose={() => setPicker(false)} onPick={(family, refs) => {
        const ids = store.getState().selection;
        store.getState().change("Font", (d) => {
          d.fonts ??= [];
          for (const r of refs) {
            const i = d.fonts.findIndex((f) => (r.source === "google" ? f.source === "google" && f.family === r.family : f.source === "upload" && f.assetId === r.assetId));
            if (i < 0) d.fonts.push(r); else d.fonts[i] = r;
          }
          const page = d.pages.find((p) => p.id === store.getState().pageId);
          for (const id of ids) {
            const n = page && (locate(page as Page, id)?.node as TextNode | undefined);
            if (n?.type !== "text") continue;
            n.fontFamily = family;
            n.fontWeight = nearestWeight(family, n.fontWeight);
            if (n.italic && !hasItalic(family, n.fontWeight)) n.italic = false;
            fitText(n);
          }
        });
      }} />}
      <div className="flex gap-2">
        <NumField label="Size" value={node.fontSize} onChange={(v) => v >= 1 && t("Font size", (n) => { n.fontSize = Math.min(5000, v); })} />
        <select className="input" value={nearestWeight(node.fontFamily, node.fontWeight)} aria-label="Weight" onChange={(e) => t("Weight", (n) => { n.fontWeight = Number(e.target.value); })}>
          {weights.map((w) => <option key={w} value={w}>{({ 100: "Thin", 200: "Extra light", 300: "Light", 400: "Regular", 500: "Medium", 600: "Semibold", 700: "Bold", 800: "Extra bold", 900: "Black" } as Record<number, string>)[w] ?? w}</option>)}
        </select>
      </div>
      <div className="flex gap-1 flex-wrap">
        {(["left", "center", "right", "justify"] as const).map((a) => (
          <button key={a} className={`btn btn-icon ${node.align === a ? "!bg-accent-soft !text-accent" : ""}`} aria-pressed={node.align === a} aria-label={`Align ${a}`} title={`Align ${a}`} onClick={() => t("Text align", (n) => { n.align = a; })}>
            <AlignIcon a={a} />
          </button>
        ))}
        {fontDef(node.fontFamily).italics.length > 0 && <button className={`btn btn-icon ${node.italic ? "!bg-accent-soft !text-accent" : ""}`} aria-pressed={node.italic} aria-label="Italic" onClick={() => t("Italic", (n) => { n.italic = !n.italic; })}><Italic size={16} /></button>}
        <button className={`btn btn-icon ${node.underline ? "!bg-accent-soft !text-accent" : ""}`} aria-pressed={node.underline} aria-label="Underline" onClick={() => t("Underline", (n) => { n.underline = !n.underline; })}><Underline size={16} /></button>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <span className="w-20 text-muted">Direction</span>
        <select className="input" value={node.direction} aria-label="Text direction" onChange={(e) => t("Direction", (n) => { n.direction = e.target.value as TextNode["direction"]; })}>
          <option value="auto">Automatic</option>
          <option value="rtl">Right to left (ދިވެހި)</option>
          <option value="ltr">Left to right</option>
        </select>
      </label>
      <Slider label="Line height" value={Math.round(node.lineHeight * 100) / 100} min={0.6} max={3} step={0.05} onChange={(v) => t("Line height", (n) => { n.lineHeight = v; }, "lh")} />
      <Slider label="Spacing" value={node.letterSpacing} min={-Math.round(W / 200)} max={Math.round(W / 20)} onChange={(v) => t("Letter spacing", (n) => { n.letterSpacing = v; }, "ls")} />
    </Section>
  );
}

function AlignIcon({ a }: { a: "left" | "center" | "right" | "justify" }) {
  const rows = { left: [16, 10, 14], center: [16, 10, 14], right: [16, 10, 14], justify: [16, 16, 16] }[a];
  return (
    <svg viewBox="0 0 20 20" width="16" height="16" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      {rows.map((w, i) => {
        const x1 = a === "right" ? 18 - w : a === "center" ? 10 - w / 2 : 2;
        return <line key={i} x1={x1} x2={x1 + w} y1={5 + i * 5} y2={5 + i * 5} />;
      })}
    </svg>
  );
}

function ImageProps({ node, pro }: { node: ImageNode; pro: boolean }) {
  const upd = useUpdate();
  const crop = node.crop ?? { x: 0, y: 0, width: node.naturalWidth, height: node.naturalHeight };
  // Crop as zoom (1 = whole image) + focus point, keeping the frame's aspect ratio.
  const frameAspect = node.width / node.height, natAspect = node.naturalWidth / node.naturalHeight;
  const baseW = natAspect > frameAspect ? node.naturalHeight * frameAspect : node.naturalWidth;
  const zoom = Math.round((baseW / crop.width) * 100) / 100;
  const cx = (crop.x + crop.width / 2) / node.naturalWidth, cy = (crop.y + crop.height / 2) / node.naturalHeight;
  const setCrop = (z: number, fx: number, fy: number) => upd("Crop", (n) => {
    if (n.type !== "image") return;
    const fa = n.width / n.height, na = n.naturalWidth / n.naturalHeight;
    const bw = na > fa ? n.naturalHeight * fa : n.naturalWidth;
    const w = bw / z, h = w / fa;
    const x = Math.min(Math.max(0, fx * n.naturalWidth - w / 2), n.naturalWidth - w);
    const y = Math.min(Math.max(0, fy * n.naturalHeight - h / 2), n.naturalHeight - h);
    n.crop = { x, y, width: w, height: h };
  }, "crop");
  const cropped = !!node.crop;
  return (
    <Section title="Image" right={<span className="text-xs text-muted">{node.naturalWidth} × {node.naturalHeight}px</span>}>
      <div className="flex gap-2">
        <button className="btn flex-1" onClick={() => setCrop(1, 0.5, 0.5)}>Fill frame</button>
        <button className="btn flex-1" disabled={!cropped && Math.abs(node.width / node.height - natAspect) < 0.01}
          onClick={() => upd("Fit image", (n) => { if (n.type === "image") { n.crop = null; n.height = Math.round(n.width / (n.naturalWidth / n.naturalHeight)); } })}>Original shape</button>
      </div>
      {cropped && (
        <>
          <Slider label="Zoom" value={zoom} min={1} max={5} step={0.05} onChange={(v) => setCrop(v, cx, cy)} />
          <Slider label="Left/right" value={Math.round(cx * 100)} min={0} max={100} unit="%" onChange={(v) => setCrop(zoom, v / 100, cy)} />
          <Slider label="Up/down" value={Math.round(cy * 100)} min={0} max={100} unit="%" onChange={(v) => setCrop(zoom, cx, v / 100)} />
        </>
      )}
      {pro && <p className="text-xs text-muted">Crop is non-destructive: the original image is always kept.</p>}
    </Section>
  );
}

// ---------- page settings ----------
function PageSettings() {
  const { store, ui } = useEditorCtx();
  const doc = useEd((s) => s.doc);
  const page = useEd(activePage);
  const { pro, showGrid, showRulers, gridSize } = useUi((s) => ({ pro: s.pro, showGrid: s.showGrid, showRulers: s.showRulers, gridSize: s.gridSize }));
  const show = (px: number) => Math.round(toUnit(px, doc.unit, doc.dpi) * (doc.unit === "px" ? 1 : 10)) / (doc.unit === "px" ? 1 : 10);
  const resize = (k: "width" | "height", v: number) => {
    const px = fromUnit(v, doc.unit, doc.dpi);
    if (px >= 1 && px <= 30000) store.getState().change("Resize design", (d) => { d[k] = px; });
  };
  return (
    <>
      <Section title="Page background">
        <FillEditor fill={page.background} allowNone onChange={(f, m) => store.getState().changePage("Background", (p) => { p.background = f; }, m ? { merge: "bg" } : undefined)} />
        {page.background.type === "none" && <p className="text-xs text-muted">Transparent: PNG exports keep the transparency.</p>}
      </Section>
      <Section title="Design size">
        <div className="grid grid-cols-2 gap-2">
          <NumField label="W" value={show(doc.width)} onChange={(v) => resize("width", v)} />
          <NumField label="H" value={show(doc.height)} onChange={(v) => resize("height", v)} />
        </div>
        <label className="flex items-center gap-2 text-sm">
          <span className="w-20 text-muted">Units</span>
          <select className="input" value={doc.unit} aria-label="Units" onChange={(e) => store.getState().change("Units", (d) => { d.unit = e.target.value as typeof d.unit; })}>
            <option value="px">Pixels</option><option value="mm">Millimetres</option><option value="in">Inches</option>
          </select>
        </label>
        <p className="text-xs text-muted">{doc.width} × {doc.height} px at {doc.dpi} DPI = {Math.round((doc.width / doc.dpi) * 254) / 10} × {Math.round((doc.height / doc.dpi) * 254) / 10} mm printed.</p>
      </Section>
      {pro && (
        <Section title="Guides">
          <div className="flex flex-wrap gap-2">
            <Toggle label="Grid" on={showGrid} onChange={(on) => ui.getState().set({ showGrid: on })} />
            <Toggle label="Rulers" on={showRulers} onChange={(on) => ui.getState().set({ showRulers: on })} />
          </div>
          {showGrid && <Slider label="Grid size" value={gridSize} min={5} max={500} onChange={(v) => ui.getState().set({ gridSize: v })} />}
        </Section>
      )}
      <p className="text-xs text-muted">Select an element to edit it. Shortcuts: Ctrl/⌘+Z undo, Ctrl/⌘+D duplicate, Ctrl/⌘+G group, Delete remove, arrows nudge, Space+drag to pan, Ctrl/⌘+scroll to zoom.</p>
    </>
  );
}

// ---------- controls ----------
export function NumField({ label, value, onChange, disabled }: { label: string; value: number; onChange: (v: number) => void; disabled?: boolean }) {
  return (
    <label className="flex items-center gap-1.5 text-sm min-w-0">
      <span className="text-muted w-6 shrink-0 text-xs">{label}</span>
      <input key={value} className="input h-8 min-w-0" type="number" defaultValue={value} disabled={disabled} aria-label={label} step="any"
        onBlur={(e) => { const v = Number(e.target.value); if (Number.isFinite(v) && v !== value) onChange(v); }}
        onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); e.stopPropagation(); }} />
    </label>
  );
}

function Slider({ label, value, min, max, step = 1, unit = "", onChange }: { label: string; value: number; min: number; max: number; step?: number; unit?: string; onChange: (v: number) => void }) {
  return (
    <label className="flex items-center gap-2 text-sm">
      <span className="w-20 text-muted shrink-0">{label}</span>
      <input type="range" className="flex-1 min-w-0" min={min} max={max} step={step} value={value} aria-label={label} onChange={(e) => onChange(Number(e.target.value))} />
      <span className="w-12 text-right tabular-nums text-xs">{value}{unit}</span>
    </label>
  );
}

function Toggle({ label, on, onChange }: { label: string; on: boolean; onChange: (on: boolean) => void }) {
  return <button className={`btn ${on ? "!bg-accent-soft !text-accent !border-accent/40" : ""}`} aria-pressed={on} onClick={() => onChange(!on)}>{label}</button>;
}

function ColorRow({ label, value, onChange }: { label: string; value: string; onChange: (c: string) => void }) {
  return (
    <label className="flex items-center gap-2 text-sm">
      <span className="w-20 text-muted">{label}</span>
      <input type="color" value={toHex(value)} aria-label={label} onChange={(e) => onChange(e.target.value)} />
      <input className="input h-8 font-mono text-xs" value={value} aria-label={`${label} hex`} onChange={(e) => /^#[0-9a-f]{6}$/i.test(e.target.value) && onChange(e.target.value)} />
    </label>
  );
}

const SWATCHES = ["#111827", "#ffffff", "#ef4444", "#f97316", "#f59e0b", "#10b981", "#06b6d4", "#3b82f6", "#6366f1", "#a855f7", "#ec4899", "#8b5e3c"];

function FillEditor({ fill, allowNone, onChange }: { fill: Fill; allowNone: boolean; onChange: (f: Fill, merge: boolean) => void }) {
  const first = fill.type === "solid" ? fill.color : fill.type === "none" ? "#ffffff" : fill.stops[0].color;
  const last = fill.type === "linear" || fill.type === "radial" ? fill.stops[fill.stops.length - 1].color : "#000000";
  const kinds = useMemo(() => [...(allowNone ? ["none"] : []), "solid", "linear", "radial"] as Fill["type"][], [allowNone]);
  const setKind = (k: Fill["type"]) => onChange(
    k === "none" ? { type: "none" } : k === "solid" ? { type: "solid", color: first }
      : k === "linear" ? { type: "linear", angle: fill.type === "linear" ? fill.angle : 90, stops: [{ offset: 0, color: first }, { offset: 1, color: fill.type === "solid" ? "#000000" : last }] }
      : { type: "radial", stops: [{ offset: 0, color: first }, { offset: 1, color: fill.type === "solid" ? "#000000" : last }] },
    false,
  );
  return (
    <div className="space-y-2">
      <div className="flex gap-1 text-xs">
        {kinds.map((k) => (
          <button key={k} className={`btn h-7 px-2 flex-1 ${fill.type === k ? "!bg-accent-soft !text-accent !border-accent/40" : ""}`} aria-pressed={fill.type === k} onClick={() => setKind(k)}>
            {{ none: "None", solid: "Solid", linear: "Linear", radial: "Radial" }[k]}
          </button>
        ))}
      </div>
      {fill.type === "solid" && (
        <>
          <ColorRow label="Colour" value={fill.color} onChange={(c) => onChange({ type: "solid", color: c }, true)} />
          <div className="flex flex-wrap gap-1.5">
            {SWATCHES.map((c) => <button key={c} className="size-6 rounded-md border border-line" style={{ background: c }} aria-label={`Colour ${c}`} onClick={() => onChange({ type: "solid", color: c }, false)} />)}
          </div>
        </>
      )}
      {(fill.type === "linear" || fill.type === "radial") && (
        <>
          <div className="h-6 rounded-md border border-line" style={{ background: `${fill.type === "linear" ? `linear-gradient(${fill.angle + 90}deg` : "radial-gradient(circle"}, ${fill.stops.map((s) => `${s.color} ${s.offset * 100}%`).join(", ")})` }} />
          {fill.stops.map((s, i) => (
            <ColorRow key={i} label={i === 0 ? "Start" : i === fill.stops.length - 1 ? "End" : `Stop ${i + 1}`} value={s.color}
              onChange={(c) => onChange({ ...fill, stops: fill.stops.map((x, j) => (j === i ? { ...x, color: c } : x)) }, true)} />
          ))}
          {fill.type === "linear" && <Slider label="Angle" value={fill.angle} min={0} max={360} unit="°" onChange={(v) => onChange({ ...fill, angle: v }, true)} />}
        </>
      )}
    </div>
  );
}

function StrokeEditor({ stroke, max, onChange }: { stroke: Stroke; max: number; onChange: (s: Stroke, merge: boolean) => void }) {
  if (!stroke) return <button className="btn w-full" onClick={() => onChange({ color: "#111827", width: Math.max(2, Math.round(max / 10)) }, false)}>Add border</button>;
  return (
    <div className="space-y-2">
      <ColorRow label="Colour" value={stroke.color} onChange={(c) => onChange({ ...stroke, color: c }, true)} />
      <Slider label="Width" value={stroke.width} min={1} max={max} onChange={(v) => onChange({ ...stroke, width: v }, true)} />
      <div className="flex gap-2">
        <Toggle label="Dashed" on={!!stroke.dash?.length} onChange={(on) => onChange({ ...stroke, dash: on ? [stroke.width * 3, stroke.width * 2] : undefined }, false)} />
        <button className="btn btn-danger" onClick={() => onChange(null, false)}>Remove</button>
      </div>
    </div>
  );
}

function ShadowEditor({ shadow, pro, onChange }: { shadow: Shadow; pro: boolean; onChange: (s: Shadow, merge: boolean) => void }) {
  if (!shadow) return <button className="btn w-full" onClick={() => onChange({ color: "#000000", blur: 20, offsetX: 0, offsetY: 8, opacity: 0.35 }, false)}>Add shadow</button>;
  return (
    <div className="space-y-2 rounded-lg border border-line p-2.5">
      <div className="flex items-center justify-between text-sm"><span className="font-medium">Shadow</span><button className="text-xs text-danger" onClick={() => onChange(null, false)}>Remove</button></div>
      <Slider label="Blur" value={shadow.blur} min={0} max={200} onChange={(v) => onChange({ ...shadow, blur: v }, true)} />
      <Slider label="Strength" value={Math.round(shadow.opacity * 100)} min={0} max={100} unit="%" onChange={(v) => onChange({ ...shadow, opacity: v / 100 }, true)} />
      {pro && (
        <>
          <Slider label="Offset X" value={shadow.offsetX} min={-200} max={200} onChange={(v) => onChange({ ...shadow, offsetX: v }, true)} />
          <Slider label="Offset Y" value={shadow.offsetY} min={-200} max={200} onChange={(v) => onChange({ ...shadow, offsetY: v }, true)} />
          <ColorRow label="Colour" value={shadow.color} onChange={(c) => onChange({ ...shadow, color: c }, true)} />
        </>
      )}
    </div>
  );
}

function toHex(c: string): string {
  if (/^#[0-9a-f]{6}$/i.test(c)) return c;
  if (/^#[0-9a-f]{3}$/i.test(c)) return "#" + c.slice(1).split("").map((x) => x + x).join("");
  if (/^#[0-9a-f]{8}$/i.test(c)) return c.slice(0, 7);
  return "#000000";
}
