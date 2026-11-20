import "server-only";
import { and, desc, eq, inArray } from "drizzle-orm";
import { nanoid } from "nanoid";
import { z } from "zod";
import type { DesignDoc } from "@/lib/doc/types";
import { getDb, schema } from "./db";

const { brandKit, template, asset } = schema;
const colour = z.string().regex(/^#[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$/);
const fontRef = z.discriminatedUnion("source", [
  z.object({ source: z.literal("google"), family: z.string().min(1).max(100), weights: z.array(z.number().int().min(1).max(1000)).max(20), italics: z.array(z.number().int().min(1).max(1000)).max(20) }),
  z.object({ source: z.literal("upload"), family: z.string().min(1).max(100), assetId: z.string().max(40), weight: z.number().int().min(1).max(1000), italic: z.boolean() }),
]);
export const brandInput = z.object({
  name: z.string().min(1).max(100),
  colors: z.array(colour).max(60),
  fonts: z.array(z.object({ role: z.enum(["heading", "subheading", "body"]), family: z.string().min(1).max(100), weight: z.number().int().min(100).max(900), ref: fontRef.optional() })).max(10),
  logos: z.array(z.object({ assetId: z.string().min(1).max(40), width: z.number().positive(), height: z.number().positive(), name: z.string().max(200) })).max(40),
}).partial({ colors: true, fonts: true, logos: true });
export type BrandInput = z.infer<typeof brandInput>;

const view = (k: typeof brandKit.$inferSelect) => ({ id: k.id, name: k.name, colors: k.colors, fonts: k.fonts, logos: k.logos, updatedAt: k.updatedAt.toISOString() });

/** Logos must be images the user owns. */
async function ownsAssets(ownerId: string, ids: string[]) {
  if (!ids.length) return true;
  const db = await getDb();
  const rows = await db.select({ id: asset.id }).from(asset).where(and(eq(asset.ownerId, ownerId), inArray(asset.id, ids)));
  return rows.length === new Set(ids).size;
}

export async function listBrandKits(ownerId: string) {
  const db = await getDb();
  return (await db.select().from(brandKit).where(eq(brandKit.ownerId, ownerId)).orderBy(desc(brandKit.updatedAt))).map(view);
}
export async function createBrandKit(ownerId: string, input: BrandInput) {
  if (!(await ownsAssets(ownerId, (input.logos ?? []).map((l) => l.assetId)))) return null;
  const db = await getDb();
  const [k] = await db.insert(brandKit).values({ id: nanoid(12), ownerId, name: input.name, colors: input.colors ?? [], fonts: input.fonts ?? [], logos: input.logos ?? [] }).returning();
  return view(k);
}
export async function updateBrandKit(ownerId: string, id: string, input: Partial<BrandInput>) {
  if (input.logos && !(await ownsAssets(ownerId, input.logos.map((l) => l.assetId)))) return "bad_asset" as const;
  const db = await getDb();
  const [k] = await db.update(brandKit).set({ ...input, updatedAt: new Date() }).where(and(eq(brandKit.id, id), eq(brandKit.ownerId, ownerId))).returning();
  return k ? view(k) : null;
}
export async function deleteBrandKit(ownerId: string, id: string) {
  const db = await getDb();
  return (await db.delete(brandKit).where(and(eq(brandKit.id, id), eq(brandKit.ownerId, ownerId))).returning({ id: brandKit.id })).length > 0;
}

// ---- user templates ----
export async function listTemplates(ownerId: string) {
  const db = await getDb();
  const rows = await db.select({ id: template.id, title: template.title, category: template.category, doc: template.doc, thumbnailAssetId: template.thumbnailAssetId, createdAt: template.createdAt })
    .from(template).where(eq(template.ownerId, ownerId)).orderBy(desc(template.createdAt)).limit(300);
  return rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() }));
}
export async function createTemplate(ownerId: string, title: string, category: string, doc: DesignDoc, thumbnailAssetId: string | null) {
  const db = await getDb();
  const [t] = await db.insert(template).values({ id: nanoid(12), ownerId, title: title.slice(0, 200), category: category.slice(0, 60) || "My templates", doc, thumbnailAssetId }).returning();
  return { id: t.id, title: t.title, category: t.category };
}
export async function deleteTemplate(ownerId: string, id: string) {
  const db = await getDb();
  const r = await db.delete(template).where(and(eq(template.id, id), eq(template.ownerId, ownerId))).returning({ id: template.id, thumb: template.thumbnailAssetId });
  if (r[0]?.thumb) await db.delete(asset).where(and(eq(asset.id, r[0].thumb), eq(asset.ownerId, ownerId)));
  return r.length > 0;
}

/** Copy an asset (e.g. a design thumbnail) so a template keeps its own copy. */
export async function copyAsset(ownerId: string, id: string): Promise<string | null> {
  const db = await getDb();
  const [a] = await db.select().from(asset).where(and(eq(asset.id, id), eq(asset.ownerId, ownerId)));
  if (!a) return null;
  const nid = nanoid(16);
  await db.insert(asset).values({ ...a, id: nid, kind: "template-thumb", createdAt: new Date() });
  return nid;
}
