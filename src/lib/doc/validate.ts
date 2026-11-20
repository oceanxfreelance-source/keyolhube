import { z } from "zod";
import { BLEND_MODES, type DesignDoc } from "./types";

// Strict validation of documents arriving from clients, so a bad save cannot corrupt a project.
const num = z.number().finite();
const color = z.string().max(64).regex(/^(#[0-9a-fA-F]{3,8}|rgba?\([\d.,\s%]+\)|transparent)$/);
const stop = z.object({ offset: num.min(0).max(1), color });
const fill = z.discriminatedUnion("type", [
  z.object({ type: z.literal("solid"), color }),
  z.object({ type: z.literal("linear"), angle: num, stops: z.array(stop).min(2).max(16) }),
  z.object({ type: z.literal("radial"), stops: z.array(stop).min(2).max(16) }),
  z.object({ type: z.literal("none") }),
]);
const stroke = z.object({ color, width: num.min(0).max(1000), dash: z.array(num.min(0)).max(8).optional() }).nullable();
const shadow = z.object({ color, blur: num.min(0).max(500), offsetX: num, offsetY: num, opacity: num.min(0).max(1) }).nullable();
const base = {
  id: z.string().min(1).max(40), name: z.string().max(200), x: num, y: num, width: num.min(0), height: num.min(0),
  rotation: num, opacity: num.min(0).max(1), visible: z.boolean(), locked: z.boolean(), blendMode: z.enum(BLEND_MODES), shadow,
};
const shapes = [
  z.object({ ...base, type: z.literal("rect"), fill, stroke, cornerRadius: num.min(0) }),
  z.object({ ...base, type: z.literal("ellipse"), fill, stroke }),
  z.object({ ...base, type: z.literal("polygon"), sides: z.number().int().min(3).max(64), fill, stroke }),
  z.object({ ...base, type: z.literal("star"), points: z.number().int().min(3).max(64), innerRatio: num.min(0.05).max(1), fill, stroke }),
  z.object({ ...base, type: z.literal("line"), points: z.array(num).min(4).max(2000), stroke: stroke.unwrap(), arrowEnd: z.boolean() }),
  z.object({ ...base, type: z.literal("path"), data: z.string().max(200_000), sourceWidth: num.positive(), sourceHeight: num.positive(), fill, stroke }),
  z.object({
    ...base, type: z.literal("text"), text: z.string().max(20_000), fontFamily: z.string().max(100), fontSize: num.min(1).max(5000),
    fontWeight: z.number().int().min(100).max(900), italic: z.boolean(),
    underline: z.boolean(), align: z.enum(["left", "center", "right", "justify"]), direction: z.enum(["auto", "ltr", "rtl"]),
    lineHeight: num.min(0.5).max(5), letterSpacing: num.min(-50).max(500), fill, stroke,
  }),
  z.object({
    ...base, type: z.literal("image"), assetId: z.string().max(40), src: z.string().max(500),
    naturalWidth: num.positive(), naturalHeight: num.positive(), cornerRadius: num.min(0), stroke,
    crop: z.object({ x: num.min(0), y: num.min(0), width: num.positive(), height: num.positive() }).nullable(),
  }),
] as const;
type NodeSchema = z.ZodType<unknown>;
const node: NodeSchema = z.lazy(() =>
  z.union([...shapes, z.object({ ...base, type: z.literal("group"), children: z.array(node).max(5000) })]),
);
export const docSchema = z.object({
  schemaVersion: z.literal(1),
  width: num.min(1).max(30000), height: num.min(1).max(30000), dpi: num.min(36).max(1200), unit: z.enum(["px", "mm", "in"]),
  pages: z.array(z.object({ id: z.string().min(1).max(40), name: z.string().max(200), background: fill, children: z.array(node).max(5000) })).min(1).max(500),
  fonts: z.array(z.discriminatedUnion("source", [
    z.object({ source: z.literal("google"), family: z.string().min(1).max(100), weights: z.array(z.number().int().min(1).max(1000)).max(20), italics: z.array(z.number().int().min(1).max(1000)).max(20) }),
    z.object({ source: z.literal("upload"), family: z.string().min(1).max(100), assetId: z.string().max(40), weight: z.number().int().min(1).max(1000), italic: z.boolean() }),
  ])).max(200).optional(),
});

export function parseDoc(input: unknown): { ok: true; doc: DesignDoc } | { ok: false; error: string } {
  const r = docSchema.safeParse(input);
  if (!r.success) {
    const i = r.error.issues[0];
    return { ok: false, error: `${i.path.join(".")}: ${i.message}` };
  }
  return { ok: true, doc: r.data as DesignDoc };
}
