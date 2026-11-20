import "server-only";
import { and, eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { getDb, schema } from "./db";

// Asset storage. Today: Postgres (free, no extra service). The interface is small on purpose so
// it can move to object storage (S3, R2, Vercel Blob) later without touching the callers.
export const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;

/** Identify an image by its magic bytes; the browser-declared type is never trusted. */
export function sniffImage(b: Buffer): "image/png" | "image/jpeg" | "image/webp" | "image/gif" | null {
  if (b.length >= 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b.length >= 12 && b.toString("ascii", 0, 4) === "RIFF" && b.toString("ascii", 8, 12) === "WEBP") return "image/webp";
  if (b.length >= 6 && (b.toString("ascii", 0, 6) === "GIF87a" || b.toString("ascii", 0, 6) === "GIF89a")) return "image/gif";
  return null;
}

export const MAX_FONT_BYTES = 10 * 1024 * 1024;
/** Identify a font file by its signature (TrueType, OpenType, WOFF, WOFF2). */
export function sniffFont(b: Buffer): "font/ttf" | "font/otf" | "font/woff" | "font/woff2" | null {
  if (b.length < 12) return null;
  const tag = b.toString("latin1", 0, 4);
  if (tag === "wOF2") return "font/woff2";
  if (tag === "wOFF") return "font/woff";
  if (tag === "OTTO") return "font/otf";
  if (b.readUInt32BE(0) === 0x00010000 || tag === "true") return "font/ttf";
  return null;
}

/** Pixel size from the file header (PNG, JPEG, WebP, GIF), or null if it cannot be read. */
export function imageSize(b: Buffer, mime: string): { width: number; height: number } | null {
  try {
    if (mime === "image/png") return { width: b.readUInt32BE(16), height: b.readUInt32BE(20) };
    if (mime === "image/gif") return { width: b.readUInt16LE(6), height: b.readUInt16LE(8) };
    if (mime === "image/webp") {
      const chunk = b.toString("ascii", 12, 16);
      if (chunk === "VP8 ") return { width: b.readUInt16LE(26) & 0x3fff, height: b.readUInt16LE(28) & 0x3fff };
      if (chunk === "VP8L") {
        const bits = b.readUInt32LE(21);
        return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
      }
      if (chunk === "VP8X") return { width: 1 + b.readUIntLE(24, 3), height: 1 + b.readUIntLE(27, 3) };
    }
    if (mime === "image/jpeg") {
      let i = 2;
      while (i < b.length) {
        if (b[i] !== 0xff) return null;
        const marker = b[i + 1];
        const len = b.readUInt16BE(i + 2);
        if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
          return { width: b.readUInt16BE(i + 7), height: b.readUInt16BE(i + 5) };
        }
        i += 2 + len;
      }
    }
  } catch {
    return null;
  }
  return null;
}

export async function putFont(ownerId: string, bytes: Buffer, filename: string, family: string, weight: number, italic: boolean) {
  if (bytes.length > MAX_FONT_BYTES) throw new UploadError("Font file is larger than 10 MB");
  const mime = sniffFont(bytes);
  if (!mime) throw new UploadError("Only TTF, OTF, WOFF and WOFF2 font files are supported");
  const db = await getDb();
  const id = nanoid(16);
  // Font metadata lives in the filename column as JSON: {file, family, weight, italic}.
  const meta = JSON.stringify({ file: filename.slice(0, 120), family: family.slice(0, 100), weight, italic });
  await db.insert(schema.asset).values({ id, ownerId, kind: "font", mime, bytes, size: bytes.length, filename: meta });
  return { id, mime, family, weight, italic, size: bytes.length };
}

export async function listFonts(ownerId: string) {
  const db = await getDb();
  const { asset } = schema;
  const rows = await db.select({ id: asset.id, filename: asset.filename, createdAt: asset.createdAt }).from(asset)
    .where(and(eq(asset.ownerId, ownerId), eq(asset.kind, "font"))).limit(500);
  return rows.map((r) => ({ id: r.id, ...(JSON.parse(r.filename ?? "{}") as { file: string; family: string; weight: number; italic: boolean }), createdAt: r.createdAt.toISOString() }));
}

export async function deleteAsset(ownerId: string, id: string) {
  const db = await getDb();
  const r = await db.delete(schema.asset).where(and(eq(schema.asset.id, id), eq(schema.asset.ownerId, ownerId))).returning({ id: schema.asset.id });
  return r.length > 0;
}

export async function putAsset(ownerId: string, bytes: Buffer, opts: { kind?: "image" | "thumbnail"; filename?: string }) {
  if (bytes.length > MAX_UPLOAD_BYTES) throw new UploadError(`File is larger than ${MAX_UPLOAD_BYTES / 1024 / 1024} MB`);
  const mime = sniffImage(bytes);
  if (!mime) throw new UploadError("Only PNG, JPEG, WebP and GIF images are supported");
  const size = imageSize(bytes, mime);
  if (!size || size.width < 1 || size.height < 1 || size.width > 20000 || size.height > 20000) throw new UploadError("Could not read the image size");
  const db = await getDb();
  const id = nanoid(16);
  await db.insert(schema.asset).values({
    id, ownerId, kind: opts.kind ?? "image", mime, bytes, size: bytes.length, width: size.width, height: size.height,
    filename: opts.filename?.slice(0, 200) ?? null,
  });
  return { id, mime, width: size.width, height: size.height, size: bytes.length };
}

export async function getAsset(ownerId: string, id: string) {
  const db = await getDb();
  const [a] = await db.select().from(schema.asset).where(and(eq(schema.asset.id, id), eq(schema.asset.ownerId, ownerId)));
  return a ?? null;
}

export async function listAssets(ownerId: string) {
  const db = await getDb();
  const { asset } = schema;
  const rows = await db.select({ id: asset.id, mime: asset.mime, width: asset.width, height: asset.height, size: asset.size, filename: asset.filename, createdAt: asset.createdAt })
    .from(asset).where(and(eq(asset.ownerId, ownerId), eq(asset.kind, "image"))).limit(500);
  return rows.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()).map((r) => ({ ...r, createdAt: r.createdAt.toISOString() }));
}

export class UploadError extends Error {}
