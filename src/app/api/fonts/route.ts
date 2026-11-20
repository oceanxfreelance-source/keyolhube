import { authed, err, json } from "@/server/http";
import { listFonts, MAX_FONT_BYTES, putFont, UploadError } from "@/server/storage";

export const runtime = "nodejs";

export const GET = authed(async (_req, user) => json({ fonts: await listFonts(user.id) }));

/** Upload a font file: multipart fields file, family, weight (100-900), italic ("1"/"0"). */
export const POST = authed(async (req, user) => {
  if (Number(req.headers.get("content-length") ?? 0) > MAX_FONT_BYTES + 64 * 1024) return err(413, "Font file is larger than 10 MB");
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return err(400, "No file");
  const family = String(form?.get("family") ?? "").trim().replace(/["\\]/g, "").slice(0, 100);
  const weight = Math.round(Number(form?.get("weight") ?? 400) / 100) * 100;
  if (!family) return err(400, "A font name is required");
  if (!(weight >= 100 && weight <= 900)) return err(400, "Weight must be 100 to 900");
  try {
    return json(await putFont(user.id, Buffer.from(await file.arrayBuffer()), file.name, family, weight, form?.get("italic") === "1"), 201);
  } catch (e) {
    if (e instanceof UploadError) return err(400, e.message);
    throw e;
  }
});
