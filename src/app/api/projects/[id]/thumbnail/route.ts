import { authed, err, json } from "@/server/http";
import { setThumbnail } from "@/server/projects";
import { putAsset, UploadError } from "@/server/storage";

export const runtime = "nodejs";
export const PUT = authed<{ id: string }>(async (req, user, { id }) => {
  const bytes = Buffer.from(await req.arrayBuffer());
  if (bytes.length > 2 * 1024 * 1024) return err(413, "Thumbnail too large");
  try {
    const a = await putAsset(user.id, bytes, { kind: "thumbnail" });
    return (await setThumbnail(user.id, id, a.id)) ? json({ assetId: a.id }) : err(404, "Project not found");
  } catch (e) {
    if (e instanceof UploadError) return err(400, e.message);
    throw e;
  }
});
