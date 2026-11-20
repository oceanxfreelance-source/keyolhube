import { authed, err, json } from "@/server/http";
import { listAssets, MAX_UPLOAD_BYTES, putAsset, UploadError } from "@/server/storage";

export const runtime = "nodejs";

export const GET = authed(async (_req, user) => json({ assets: await listAssets(user.id) }));

/** Upload one image as multipart form data (field "file"). */
export const POST = authed(async (req, user) => {
  const len = Number(req.headers.get("content-length") ?? 0);
  if (len > MAX_UPLOAD_BYTES + 64 * 1024) return err(413, "File is larger than 15 MB");
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return err(400, "No file");
  try {
    const a = await putAsset(user.id, Buffer.from(await file.arrayBuffer()), { filename: file.name });
    return json({ ...a, url: `/api/assets/${a.id}` }, 201);
  } catch (e) {
    if (e instanceof UploadError) return err(400, e.message);
    throw e;
  }
});
