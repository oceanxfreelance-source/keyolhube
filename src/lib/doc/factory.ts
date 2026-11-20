import { nanoid } from "nanoid";
import type {
  BaseNode, DesignDoc, EllipseNode, Fill, ImageNode, LineNode, Page, PolygonNode, RectNode, StarNode, TextNode,
} from "./types";
import { SCHEMA_VERSION } from "./types";

export const newId = () => nanoid(10);

export const solid = (color: string): Fill => ({ type: "solid", color });

function base(name: string, x: number, y: number, width: number, height: number): BaseNode {
  return {
    id: newId(), name, x, y, width, height, rotation: 0, opacity: 1, visible: true, locked: false,
    blendMode: "source-over", shadow: null,
  };
}

export function newPage(name = "Page 1"): Page {
  return { id: newId(), name, background: solid("#ffffff"), children: [] };
}

export function newDoc(width: number, height: number, dpi = 96, unit: DesignDoc["unit"] = "px"): DesignDoc {
  return { schemaVersion: SCHEMA_VERSION, width, height, dpi, unit, pages: [newPage()] };
}

export const make = {
  rect(x: number, y: number, w: number, h: number, color = "#3b82f6"): RectNode {
    return { ...base("Rectangle", x, y, w, h), type: "rect", fill: solid(color), stroke: null, cornerRadius: 0 };
  },
  ellipse(x: number, y: number, w: number, h: number, color = "#f59e0b"): EllipseNode {
    return { ...base("Ellipse", x, y, w, h), type: "ellipse", fill: solid(color), stroke: null };
  },
  polygon(x: number, y: number, size: number, sides = 3, color = "#10b981"): PolygonNode {
    return { ...base(sides === 3 ? "Triangle" : "Polygon", x, y, size, size), type: "polygon", sides, fill: solid(color), stroke: null };
  },
  star(x: number, y: number, size: number, color = "#ef4444"): StarNode {
    return { ...base("Star", x, y, size, size), type: "star", points: 5, innerRatio: 0.45, fill: solid(color), stroke: null };
  },
  line(x: number, y: number, length: number, color = "#111827"): LineNode {
    return { ...base("Line", x, y, length, 0), type: "line", points: [0, 0, length, 0], stroke: { color, width: 4 }, arrowEnd: false };
  },
  text(x: number, y: number, text: string, fontSize = 48, width = 600): TextNode {
    return {
      ...base("Text", x, y, width, Math.round(fontSize * 1.25)), type: "text", text,
      fontFamily: "Inter", fontSize, fontWeight: 400, italic: false, underline: false, align: "left",
      direction: "auto", lineHeight: 1.25, letterSpacing: 0, fill: solid("#111827"), stroke: null,
    };
  },
  image(x: number, y: number, w: number, h: number, assetId: string, src: string, naturalWidth: number, naturalHeight: number): ImageNode {
    return {
      ...base("Image", x, y, w, h), type: "image", assetId, src, naturalWidth, naturalHeight, crop: null,
      cornerRadius: 0, stroke: null,
    };
  },
};

// Thaana (Dhivehi) block U+0780–U+07BF; Arabic and Hebrew blocks also run right to left.
const RTL_CHAR = /[֐-ࣿיִ-﷿ﹰ-﻿]/;
const LTR_CHAR = /[A-Za-zÀ-ɏ]/;

/** Direction of the first strong character (Unicode bidi rule P2), for `direction: "auto"`. */
export function detectDirection(text: string): "ltr" | "rtl" {
  for (const ch of text) {
    if (RTL_CHAR.test(ch)) return "rtl";
    if (LTR_CHAR.test(ch)) return "ltr";
  }
  return "ltr";
}

export function resolvedDirection(node: Pick<TextNode, "direction" | "text">): "ltr" | "rtl" {
  return node.direction === "auto" ? detectDirection(node.text) : node.direction;
}
