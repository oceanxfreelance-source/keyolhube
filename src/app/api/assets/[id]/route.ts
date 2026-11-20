import { authed, err } from "@/server/http";
import { getAsset } from "@/server/storage";

export const runtime = "nodejs";
export const GET = authed<{ id: string }>(async (_req, user, { id }) => {
  const a = await getAsset(user.id, id);
  if (!a) return err(404, "Not found");
  return new Response(new Uint8Array(a.bytes), {
    headers: {
      "Content-Type": a.mime, "Content-Length": String(a.size), "Cache-Control": "private, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
    },
  });
});
