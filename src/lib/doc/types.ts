// The design document: the single source of truth that the editor edits, the server stores
// and every exporter reads. Units are pixels; `dpi` says how pixels map to physical size.

export type ColorStop = { offset: number; color: string };
export type Fill =
  | { type: "solid"; color: string }
  | { type: "linear"; angle: number; stops: ColorStop[] }
  | { type: "radial"; stops: ColorStop[] }
  | { type: "none" };

export type Stroke = { color: string; width: number; dash?: number[] } | null;
export type Shadow = { color: string; blur: number; offsetX: number; offsetY: number; opacity: number } | null;

export const BLEND_MODES = [
  "source-over", "multiply", "screen", "overlay", "darken", "lighten", "color-dodge", "color-burn",
  "hard-light", "soft-light", "difference", "exclusion", "hue", "saturation", "color", "luminosity",
] as const;
export type BlendMode = (typeof BLEND_MODES)[number];

export interface BaseNode {
  id: string;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number; // degrees, around the node's top-left (x, y), like Konva
  opacity: number; // 0..1
  visible: boolean;
  locked: boolean;
  blendMode: BlendMode;
  shadow: Shadow;
}

export interface RectNode extends BaseNode {
  type: "rect";
  fill: Fill;
  stroke: Stroke;
  cornerRadius: number;
}
export interface EllipseNode extends BaseNode {
  type: "ellipse";
  fill: Fill;
  stroke: Stroke;
}
export interface PolygonNode extends BaseNode {
  type: "polygon";
  sides: number;
  fill: Fill;
  stroke: Stroke;
}
export interface StarNode extends BaseNode {
  type: "star";
  points: number;
  innerRatio: number; // inner radius / outer radius
  fill: Fill;
  stroke: Stroke;
}
export interface LineNode extends BaseNode {
  type: "line";
  points: number[]; // [x1, y1, x2, y2, ...] relative to (x, y)
  stroke: NonNullable<Stroke>;
  arrowEnd: boolean;
}
export interface PathNode extends BaseNode {
  type: "path";
  data: string; // SVG path data in a box of (sourceWidth x sourceHeight), scaled to width x height
  sourceWidth: number;
  sourceHeight: number;
  fill: Fill;
  stroke: Stroke;
}
export type TextDirection = "auto" | "ltr" | "rtl";
export interface TextNode extends BaseNode {
  type: "text";
  text: string;
  fontFamily: string;
  fontSize: number;
  fontWeight: number; // 100..900; snapped to the nearest weight the font has
  italic: boolean;
  underline: boolean;
  align: "left" | "center" | "right" | "justify";
  direction: TextDirection;
  lineHeight: number;
  letterSpacing: number;
  fill: Fill;
  stroke: Stroke;
}
export type ImageCrop = { x: number; y: number; width: number; height: number }; // in source pixels
export type { Adjustments } from "../photo/adjust";
import type { Adjustments } from "../photo/adjust";
export interface ImageNode extends BaseNode {
  type: "image";
  assetId: string;
  src: string; // URL the editor loads (asset endpoint or data URL)
  naturalWidth: number;
  naturalHeight: number;
  crop: ImageCrop | null;
  cornerRadius: number;
  stroke: Stroke;
  adjust?: Adjustments; // non-destructive photo adjustments
}
export interface GroupNode extends BaseNode {
  type: "group";
  children: DesignNode[];
}

export type ShapeNode = RectNode | EllipseNode | PolygonNode | StarNode | LineNode | PathNode | TextNode | ImageNode;
export type DesignNode = ShapeNode | GroupNode;
export type NodeType = DesignNode["type"];

export interface Page {
  id: string;
  name: string;
  background: Fill;
  children: DesignNode[];
}

/** A font the design uses beyond the built-in set, so any device can load it. */
export type FontRef =
  | { source: "google"; family: string; weights: number[]; italics: number[] }
  | { source: "upload"; family: string; assetId: string; weight: number; italic: boolean };

export interface DesignDoc {
  schemaVersion: 1;
  width: number;
  height: number;
  dpi: number; // 96 for screen designs; 300 for print presets
  unit: "px" | "mm" | "in"; // what the UI shows; storage is always px
  pages: Page[];
  fonts?: FontRef[];
}

export const SCHEMA_VERSION = 1 as const;
